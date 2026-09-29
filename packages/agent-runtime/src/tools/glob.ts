import path from 'node:path';

/** Put before every name starting with a dot, in the path and in the glob alike. */
const DOT_MARK = '\u0001';

function markDotNames(value: string): string {
  return value
    .split('/')
    .map((segment) =>
      segment.startsWith('.') && segment !== '.' && segment !== '..' ? DOT_MARK + segment : segment,
    )
    .join('/');
}

/**
 * `path.posix.matchesGlob` with dotfiles matched like other files (as `dot: true` in
 * minimatch): `**` covers `.github/…` and `.gitignore`, `*.env` covers `.env`. Names with a dot
 * are prefixed with a mark in both the path and the glob, so wildcards no longer see a leading
 * dot, while a glob naming `.github` literally still matches only `.github`.
 */
export function matchesPath(file: string, glob: string): boolean {
  return path.posix.matchesGlob(markDotNames(file), markDotNames(glob));
}
