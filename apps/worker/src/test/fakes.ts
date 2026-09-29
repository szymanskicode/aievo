import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { CloneInput, LocalGit } from '@aievo/git';
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

  commitAll(): Promise<string | null> {
    return Promise.reject(new Error('Diagnostic runs never commit'));
  }

  pushAgentBranch(): Promise<void> {
    return Promise.reject(new Error('Diagnostic runs never push'));
  }
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
