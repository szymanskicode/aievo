import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  ChangedFile,
  CloneInput,
  CommitInput,
  CreatePullRequestInput,
  GitProvider,
  LocalGit,
  PushInput,
} from '@aievo/git';
import type {
  CreateSandboxInput,
  ExecOptions,
  ExecResult,
  Sandbox,
  SandboxFactory,
} from '@aievo/sandbox';

/** Resolves when `signal` aborts, rejecting like an aborted operation does. */
export function untilAborted(signal: AbortSignal | undefined): Promise<never> {
  return new Promise((_resolve, reject) => {
    const fail = () => reject(new Error('aborted'));
    if (signal?.aborted) fail();
    else signal?.addEventListener('abort', fail, { once: true });
  });
}

/** Records git calls; `clone` creates a working copy with one file. */
export class FakeLocalGit implements LocalGit {
  clones: CloneInput[] = [];
  branches: string[] = [];
  /** Makes `clone` fail with this error. */
  cloneError: Error | undefined;
  /** Makes `clone` hang until its signal aborts. */
  hangOnClone = false;

  async clone(input: CloneInput): Promise<void> {
    this.clones.push(input);
    if (this.hangOnClone) await untilAborted(input.signal);
    if (this.cloneError) throw this.cloneError;
    await mkdir(input.dir, { recursive: true });
    await writeFile(path.join(input.dir, 'README.md'), '# demo\n');
  }

  createBranch(_dir: string, name: string): Promise<void> {
    this.branches.push(name);
    return Promise.resolve();
  }

  commits: CommitInput[] = [];
  /** What `commitAll` returns; `null` means nothing changed. */
  commitSha: string | null = 'c0ffee'.padEnd(40, '0');
  pushes: PushInput[] = [];
  pushError: Error | undefined;
  changed: ChangedFile[] = [{ status: 'modified', path: 'README.md' }];

  commitAll(_dir: string, input: CommitInput): Promise<string | null> {
    this.commits.push(input);
    return Promise.resolve(this.commitSha);
  }

  pushAgentBranch(_dir: string, input: PushInput): Promise<void> {
    this.pushes.push(input);
    return this.pushError ? Promise.reject(this.pushError) : Promise.resolve();
  }

  changedFiles(): Promise<ChangedFile[]> {
    return Promise.resolve(this.changed);
  }

  /** Answers of `workingChanges` in call order (after install, after the agent); then none. */
  working: ChangedFile[][] = [];
  restores: { ref: string; paths: string[] }[] = [];

  workingChanges(): Promise<ChangedFile[]> {
    return Promise.resolve(this.working.shift() ?? []);
  }

  restoreFiles(_dir: string, ref: string, paths: string[]): Promise<void> {
    this.restores.push({ ref, paths });
    return Promise.resolve();
  }
}

/** A Git host that only opens pull requests and records them. */
export class FakeGitProvider {
  pullRequests: CreatePullRequestInput[] = [];
  tokens: string[] = [];
  error: Error | undefined;

  /** The factory the runner gets: one provider per token. */
  readonly factory = (token: string): GitProvider => {
    this.tokens.push(token);
    const unused = () => Promise.reject(new Error('Not used by runs'));
    return {
      verifyToken: unused,
      listOwners: unused,
      listRepos: unused,
      getRepo: unused,
      createRepo: unused,
      createInitialCommit: unused,
      listPullRequestComments: unused,
      createPullRequest: (input) => {
        this.pullRequests.push(input);
        if (this.error) return Promise.reject(this.error);
        return Promise.resolve({
          number: 7,
          url: `https://github.com/${input.owner}/${input.repo}/pull/7`,
        });
      },
    };
  };
}

/** What a fake command does: return a result, or hang until aborted. */
export type FakeCommand = Partial<ExecResult> | 'hang';

export class FakeSandbox implements Sandbox {
  commands: string[] = [];
  stopped = 0;
  stopError: Error | undefined;

  constructor(
    readonly runId: string,
    private readonly behaviour: Record<string, FakeCommand>,
  ) {}

  async exec(command: string, options: ExecOptions): Promise<ExecResult> {
    this.commands.push(command);
    const behaviour = this.behaviour[command] ?? {};
    if (behaviour === 'hang') return untilAborted(options.signal);
    return {
      exitCode: 0,
      output: '',
      timedOut: false,
      truncated: false,
      durationMs: 5,
      ...behaviour,
    };
  }

  readFile(): Promise<string> {
    return Promise.reject(new Error('not used'));
  }

  writeFile(): Promise<void> {
    return Promise.reject(new Error('not used'));
  }

  realPath(): Promise<string> {
    return Promise.reject(new Error('not used'));
  }

  listFiles(): Promise<string[]> {
    return Promise.resolve([]);
  }

  stop(): Promise<void> {
    this.stopped += 1;
    return this.stopError ? Promise.reject(this.stopError) : Promise.resolve();
  }
}

export class FakeSandboxFactory implements SandboxFactory {
  created: FakeSandbox[] = [];
  inputs: CreateSandboxInput[] = [];
  createError: Error | undefined;
  /** Behaviour of commands by their exact text; unknown commands succeed. */
  commands: Record<string, FakeCommand> = {};
  stopError: Error | undefined;

  create(input: CreateSandboxInput): Promise<Sandbox> {
    this.inputs.push(input);
    if (this.createError) return Promise.reject(this.createError);
    const sandbox = new FakeSandbox(input.runId, this.commands);
    sandbox.stopError = this.stopError;
    this.created.push(sandbox);
    return Promise.resolve(sandbox);
  }

  get last(): FakeSandbox | undefined {
    return this.created.at(-1);
  }
}
