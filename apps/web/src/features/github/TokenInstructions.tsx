import { GITHUB_TOKEN_REQUIREMENTS } from '@aievo/shared';
import { ExternalLinkIcon } from 'lucide-react';

/** GitHub's form for a new fine-grained personal access token. */
export const NEW_TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new';

/** Permissions of a fine-grained token (docs/architecture.md, section 10). */
const PERMISSIONS = [
  ['Administration', 'Read and write', 'creates repositories from the project wizard'],
  ['Contents', 'Read and write', 'writes the first commit and pushes agent branches'],
  ['Pull requests', 'Read and write', 'opens pull requests and reads review comments'],
  ['Metadata', 'Read-only', 'lists your repositories (GitHub selects it automatically)'],
] as const;

export function TokenInstructions() {
  return (
    <section aria-labelledby="token-instructions" className="flex flex-col gap-3 text-sm">
      <h2 id="token-instructions" className="text-base font-semibold">
        How to create the token
      </h2>
      <p className="text-muted-foreground">{GITHUB_TOKEN_REQUIREMENTS}</p>
      <ol className="flex list-decimal flex-col gap-2 pl-5">
        <li>
          Open{' '}
          <a
            href={NEW_TOKEN_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-medium underline underline-offset-4"
          >
            New fine-grained token on GitHub
            <ExternalLinkIcon className="size-3.5" aria-hidden />
          </a>{' '}
          (Settings → Developer settings → Personal access tokens → Fine-grained tokens).
        </li>
        <li>Name it, for example “AIEvo”, and choose an expiration date.</li>
        <li>
          As the resource owner pick your account, or the organization whose repositories AIEvo
          should work on.
        </li>
        <li>
          Under <strong>Repository access</strong> choose <strong>All repositories</strong>: a
          repository created from the wizard does not exist yet, so it cannot be selected in
          advance.
        </li>
        <li>
          Under <strong>Permissions → Repository permissions</strong> set:
          <ul className="mt-1 flex list-disc flex-col gap-1 pl-5">
            {PERMISSIONS.map(([name, access, why]) => (
              <li key={name}>
                <strong>{name}</strong>: {access} ({why})
              </li>
            ))}
          </ul>
        </li>
        <li>Generate the token, copy it and paste it into the form here. GitHub shows it once.</li>
      </ol>
    </section>
  );
}
