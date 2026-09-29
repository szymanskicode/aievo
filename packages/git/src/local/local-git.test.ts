import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  authEnv,
  createLocalGit,
  parseNameStatus,
  parsePorcelainStatus,
  redactToken,
} from './local-git.js';
import type { GitExec, GitExecOptions } from './local-git.js';
import { LocalGitError } from './local-git-error.js';

/** A fake fine-grained token that exists only inside this test process. */
const fakeToken = () => `github_pat_${randomBytes(20).toString('hex')}`;

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'aievo-git-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 5 });
});

/** Runs git for test setup, isolated from the user's and the system's config. */
function git(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args],
      {
        cwd,
        env: {
          ...process.env,
          GIT_CONFIG_NOSYSTEM: '1',
          GIT_CONFIG_GLOBAL: path.join(root, 'none'),
        },
        windowsHide: true,
      },
      (error, stdout, stderr) => (error ? reject(new Error(stderr)) : resolve(stdout)),
    );
  });
}

/** A bare repository with one commit on `main`, standing in for GitHub. */
async function bareRemote(): Promise<string> {
  const remote = path.join(root, 'remote.git');
  const seed = path.join(root, 'seed');
  await git(['init', '--bare', '--initial-branch=main', remote], root);
  await git(['init', '--initial-branch=main', seed], root);
  await writeFile(path.join(seed, 'README.md'), '# demo\r\n');
  await git(['add', '.'], seed);
  await git(['commit', '-m', 'init'], seed);
  await git(['push', remote, 'main'], seed);
  return remote;
}

async function filesUnder(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries.filter((e) => e.isFile()).map((e) => path.join(e.parentPath, e.name));
}

describe('redactToken', () => {
  it('removes the token and its base64 forms', () => {
    const token = fakeToken();
    const header = authEnv('https://github.com/o/r.git', token).GIT_CONFIG_VALUE_0 ?? '';
    const text = `a ${token} b ${header} c ${Buffer.from(token).toString('base64')}`;

    const result = redactToken(text, token);

    expect(result).not.toContain(token);
    expect(result).not.toContain(header.split(' ').at(-1));
    expect(result).not.toContain(Buffer.from(token).toString('base64'));
  });
});

describe('authEnv', () => {
  it('scopes the header to the origin of the remote', () => {
    const token = fakeToken();

    const env = authEnv('https://github.com/octocat/demo.git', token);

    expect(env.GIT_CONFIG_COUNT).toBe('1');
    expect(env.GIT_CONFIG_KEY_0).toBe('http.https://github.com/.extraheader');
    expect(env.GIT_CONFIG_VALUE_0).toBe(
      `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`,
    );
  });

  it('adds nothing for a local path', () => {
    expect(authEnv(path.join(root, 'remote.git'), fakeToken())).toEqual({});
  });
});

describe('local git with a fake runner', () => {
  it('never puts the token in arguments and keeps worker secrets out of the environment', async () => {
    const token = fakeToken();
    const calls: { args: string[]; options: GitExecOptions }[] = [];
    const exec: GitExec = (args, options) => {
      calls.push({ args, options });
      return Promise.resolve({ stdout: 'https://github.com/octocat/demo.git\n', stderr: '' });
    };
    process.env.AIEVO_MASTER_KEY = 'must-not-leak';
    try {
      const local = await createLocalGit({ stateDir: path.join(root, 'state'), exec });

      await local.clone({
        url: 'https://github.com/octocat/demo.git',
        dir: path.join(root, 'work', 'repo'),
        branch: 'main',
        token,
      });
      await local.pushAgentBranch(path.join(root, 'work', 'repo'), {
        branch: 'agent/abc-fix',
        baseBranch: 'main',
        token,
      });
    } finally {
      delete process.env.AIEVO_MASTER_KEY;
    }

    for (const { args, options } of calls) {
      expect(args.join(' ')).not.toContain(token);
      expect(args).toContain('credential.helper=');
      expect(options.env.AIEVO_MASTER_KEY).toBeUndefined();
      expect(options.env.GIT_TERMINAL_PROMPT).toBe('0');
    }
    const push = calls.find((c) => c.args.includes('push'));
    expect(push?.args.slice(-2)).toEqual([
      'origin',
      'refs/heads/agent/abc-fix:refs/heads/agent/abc-fix',
    ]);
    expect(push?.args).not.toContain('--force');
    expect(push?.options.env.GIT_CONFIG_VALUE_0).toContain('AUTHORIZATION: basic ');
  });

  it('reports a failing command without the token', async () => {
    const token = fakeToken();
    const exec: GitExec = () =>
      Promise.reject(
        Object.assign(new Error('failed'), { code: 128, stderr: `fatal: bad token ${token}` }),
      );
    const local = await createLocalGit({ stateDir: path.join(root, 'state'), exec });

    const error = await local
      .clone({
        url: 'https://github.com/o/r.git',
        dir: path.join(root, 'r'),
        branch: 'main',
        token,
      })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(LocalGitError);
    expect(error).toMatchObject({
      kind: 'command_failed',
      details: { command: 'clone', exitCode: 128, output: 'fatal: bad token [redacted]' },
    });
    expect(JSON.stringify(error)).not.toContain(token);
    expect((error as Error).message).not.toContain(token);
  });

  it('maps an abort and a timeout', async () => {
    const aborted: GitExec = () =>
      Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    const killed: GitExec = () =>
      Promise.reject(Object.assign(new Error('killed'), { killed: true, signal: 'SIGKILL' }));

    const a = await createLocalGit({ stateDir: path.join(root, 'a'), exec: aborted });
    const k = await createLocalGit({ stateDir: path.join(root, 'k'), exec: killed });

    await expect(a.createBranch(root, 'agent/x')).rejects.toMatchObject({ kind: 'aborted' });
    await expect(k.createBranch(root, 'agent/x')).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('refuses invalid branch names before running git', async () => {
    const calls: string[][] = [];
    const exec: GitExec = (args) => {
      calls.push(args);
      return Promise.resolve({ stdout: '', stderr: '' });
    };
    const local = await createLocalGit({ stateDir: path.join(root, 'state'), exec });

    await expect(local.createBranch(root, 'main')).rejects.toMatchObject({
      kind: 'invalid_branch',
    });
    for (const branch of ['main', 'feature/x', '+agent/x', 'agent/../main']) {
      await expect(
        local.pushAgentBranch(root, { branch, baseBranch: 'main', token: fakeToken() }),
      ).rejects.toMatchObject({ kind: 'forbidden_push' });
    }
    await expect(
      local.pushAgentBranch(root, { branch: 'agent/x', baseBranch: 'agent/x', token: 't' }),
    ).rejects.toMatchObject({ kind: 'forbidden_push' });
    expect(calls).toEqual([]);
  });
});

// Each test spawns a dozen git processes; under a parallel `pnpm test` on Windows that can
// take well over the default 5 s.
describe('local git against a real repository', { timeout: 30_000 }, () => {
  it('clones, branches, commits and pushes an agent branch without storing the token', async () => {
    const remote = await bareRemote();
    const token = fakeToken();
    const local = await createLocalGit({ stateDir: path.join(root, 'state') });
    const dir = path.join(root, 'runs', 'run-1', 'repo');

    await local.clone({ url: remote, dir, branch: 'main', token });
    await local.createBranch(dir, 'agent/abc-fix');
    await writeFile(path.join(dir, 'fix.ts'), 'export const fixed = true;\n');
    const sha = await local.commitAll(dir, {
      message: 'fix: add fix',
      author: { name: 'AIEvo', email: 'agent@aievo.local' },
    });
    await local.pushAgentBranch(dir, { branch: 'agent/abc-fix', baseBranch: 'main', token });

    expect(sha).toMatch(/^[0-9a-f]{40}$/);
    expect((await git(['rev-parse', 'refs/heads/agent/abc-fix'], remote)).trim()).toBe(sha);
    expect((await git(['config', '--get', 'remote.origin.url'], dir)).trim()).toBe(remote);
    // Bytes stay as committed: no CRLF conversion from a Windows git setup.
    expect(await readFile(path.join(dir, 'README.md'), 'utf8')).toBe('# demo\r\n');

    const config = await readFile(path.join(dir, '.git', 'config'), 'utf8');
    expect(config.toLowerCase()).not.toContain('extraheader');
    const basic = Buffer.from(`x-access-token:${token}`).toString('base64');
    for (const file of await filesUnder(path.join(dir, '.git'))) {
      const content = await readFile(file);
      expect(content.includes(token), file).toBe(false);
      expect(content.includes(basic), file).toBe(false);
    }
  });

  it('lists the files the agent branch changed against the base', async () => {
    const remote = await bareRemote();
    const local = await createLocalGit({ stateDir: path.join(root, 'state') });
    const dir = path.join(root, 'repo');
    await local.clone({ url: remote, dir, branch: 'main' });
    await local.createBranch(dir, 'agent/abc-sum');
    await writeFile(path.join(dir, 'README.md'), '# demo\nmore\n');
    await mkdir(path.join(dir, 'src'));
    await writeFile(path.join(dir, 'src', 'sum.ts'), 'export const sum = 1;\n');
    await local.commitAll(dir, {
      message: 'feat: sum',
      author: { name: 'AIEvo', email: 'agent@aievo.local' },
    });

    expect(await local.changedFiles(dir, 'origin/main')).toEqual([
      { status: 'modified', path: 'README.md' },
      { status: 'added', path: 'src/sum.ts' },
    ]);
    await expect(local.changedFiles(dir, '--output=x')).rejects.toThrow(LocalGitError);
  });

  it('reports uncommitted changes and restores files from a ref', async () => {
    const remote = await bareRemote();
    const local = await createLocalGit({ stateDir: path.join(root, 'state') });
    const dir = path.join(root, 'repo');
    await local.clone({ url: remote, dir, branch: 'main' });
    await writeFile(path.join(dir, '.gitignore'), 'ignored/\n');
    await git(['add', '.gitignore'], dir);
    await git(['commit', '-m', 'ignore'], dir);

    await writeFile(path.join(dir, 'README.md'), 'changed\n');
    await writeFile(path.join(dir, 'new.ts'), 'export {};\n');
    await mkdir(path.join(dir, 'ignored'));
    await writeFile(path.join(dir, 'ignored', 'cache.txt'), 'x');
    await rm(path.join(dir, '.gitignore'));
    await writeFile(path.join(dir, '.gitignore'), 'ignored/\n');
    await rm(path.join(dir, 'README.md'));

    expect(await local.workingChanges(dir)).toEqual([
      { status: 'deleted', path: 'README.md' },
      { status: 'added', path: 'new.ts' },
    ]);

    await local.restoreFiles(dir, 'HEAD', ['README.md']);

    expect(await readFile(path.join(dir, 'README.md'), 'utf8')).toBe('# demo\r\n');
    expect(await local.workingChanges(dir)).toEqual([{ status: 'added', path: 'new.ts' }]);
    await expect(local.restoreFiles(dir, '--force', ['x'])).rejects.toThrow(LocalGitError);
  });

  it('returns null when there is nothing to commit', async () => {
    const remote = await bareRemote();
    const local = await createLocalGit({ stateDir: path.join(root, 'state') });
    const dir = path.join(root, 'repo');
    await local.clone({ url: remote, dir, branch: 'main' });

    const sha = await local.commitAll(dir, {
      message: 'nothing',
      author: { name: 'AIEvo', email: 'agent@aievo.local' },
    });

    expect(sha).toBeNull();
  });

  it('refuses to push the base branch and leaves the remote unchanged', async () => {
    const remote = await bareRemote();
    const before = (await git(['rev-parse', 'refs/heads/main'], remote)).trim();
    const local = await createLocalGit({ stateDir: path.join(root, 'state') });
    const dir = path.join(root, 'repo');
    await local.clone({ url: remote, dir, branch: 'main' });
    await writeFile(path.join(dir, 'x.txt'), 'x');
    await local.commitAll(dir, { message: 'x', author: { name: 'A', email: 'a@b.c' } });

    await expect(
      local.pushAgentBranch(dir, { branch: 'main', baseBranch: 'main', token: fakeToken() }),
    ).rejects.toMatchObject({ kind: 'forbidden_push' });
    expect((await git(['rev-parse', 'refs/heads/main'], remote)).trim()).toBe(before);
  });

  it('does not run hooks planted in the working copy', async () => {
    const remote = await bareRemote();
    const local = await createLocalGit({ stateDir: path.join(root, 'state') });
    const dir = path.join(root, 'repo');
    await local.clone({ url: remote, dir, branch: 'main' });
    const marker = path.join(root, 'hook-ran');
    const hook = path.join(dir, '.git', 'hooks', 'pre-commit');
    await writeFile(hook, `#!/bin/sh\necho ran > "${marker.replace(/\\/g, '/')}"\n`, {
      mode: 0o755,
    });
    await writeFile(path.join(dir, 'y.txt'), 'y');

    await local.commitAll(dir, { message: 'y', author: { name: 'A', email: 'a@b.c' } });

    await expect(stat(marker)).rejects.toThrow();
  });

  it('sends the token to an HTTP remote only as an Authorization header', async () => {
    const token = fakeToken();
    const seen: { url: string | undefined; authorization: string | undefined }[] = [];
    const server = createServer((req, res) => {
      seen.push({ url: req.url, authorization: req.headers.authorization });
      res.writeHead(404).end();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    try {
      const local = await createLocalGit({ stateDir: path.join(root, 'state') });

      const error = await local
        .clone({
          url: `http://127.0.0.1:${port}/octocat/demo.git`,
          dir: path.join(root, 'repo'),
          branch: 'main',
          token,
        })
        .catch((e: unknown) => e);

      expect(error).toMatchObject({ kind: 'command_failed' });
      expect(JSON.stringify(error)).not.toContain(token);
    } finally {
      server.close();
    }

    const expected = `basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`;
    expect(seen.length).toBeGreaterThan(0);
    for (const request of seen) {
      expect(request.authorization?.toLowerCase()).toBe(expected.toLowerCase());
      expect(request.url).not.toContain(token);
    }
  });
});

describe('parseNameStatus', () => {
  it('maps git status letters and keeps unusual paths intact', () => {
    const output = ['A', 'new file.ts', 'M', 'src/ä.ts', 'D', 'old.ts', 'T', 'link', ''].join(
      String.fromCharCode(0),
    );

    expect(parseNameStatus(output)).toEqual([
      { status: 'added', path: 'new file.ts' },
      { status: 'modified', path: 'src/ä.ts' },
      { status: 'deleted', path: 'old.ts' },
      { status: 'modified', path: 'link' },
    ]);
    expect(parseNameStatus('')).toEqual([]);
  });
});

describe('parsePorcelainStatus', () => {
  it('reads index and working tree states and untracked files', () => {
    const nul = String.fromCharCode(0);
    const output = [' M a.ts', 'M  b.ts', ' D c.ts', '?? new dir/d.ts', 'A  e.ts', ''].join(nul);

    expect(parsePorcelainStatus(output)).toEqual([
      { status: 'modified', path: 'a.ts' },
      { status: 'modified', path: 'b.ts' },
      { status: 'deleted', path: 'c.ts' },
      { status: 'added', path: 'new dir/d.ts' },
      { status: 'added', path: 'e.ts' },
    ]);
  });
});
