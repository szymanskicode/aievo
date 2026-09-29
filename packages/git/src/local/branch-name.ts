/** Prefix of every branch an agent may write; pushes elsewhere are refused. */
export const AGENT_BRANCH_PREFIX = 'agent/';

const SLUG_MAX_LENGTH = 40;
const SHORT_ID_LENGTH = 8;

// Letters that NFKD does not split into a base letter and a diacritic.
const TRANSLITERATIONS: Record<string, string> = { ł: 'l', Ł: 'L', ß: 'ss', æ: 'ae', ø: 'o' };

/** Lowercase ASCII words joined by `-`, at most 40 characters; `task` when nothing is left. */
export function slugify(text: string): string {
  const ascii = text
    .replace(/[łŁßæø]/g, (char) => TRANSLITERATIONS[char] ?? char)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '');
  const slug = ascii
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/^-+|-+$/g, '');
  return slug || 'task';
}

/** `agent/<first 8 characters of the task id>-<slug of the title>`. */
export function agentBranchName(taskId: string, title: string): string {
  const shortId = taskId.replace(/-/g, '').slice(0, SHORT_ID_LENGTH).toLowerCase();
  return `${AGENT_BRANCH_PREFIX}${shortId}-${slugify(title)}`;
}

/**
 * An `agent/...` name made of safe characters that git accepts as a branch
 * (no `..`, no `.lock` suffix, no empty or dot-leading path parts).
 */
export function isValidAgentBranch(name: string): boolean {
  if (!name.startsWith(AGENT_BRANCH_PREFIX) || name.length > 200) return false;
  if (!/^[A-Za-z0-9._/-]+$/.test(name)) return false;
  if (name.includes('..') || name.endsWith('.lock') || name.endsWith('/')) return false;
  return name.split('/').every((part) => part.length > 0 && !part.startsWith('.'));
}
