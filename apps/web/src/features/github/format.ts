/** Days before expiry from which a token is flagged as expiring soon. */
export const EXPIRY_WARNING_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

export type ExpiryState = 'none' | 'valid' | 'soon' | 'expired';

/** How close a token is to its expiration date; `null` means it never expires. */
export function expiryState(expiresAt: string | null, now: Date = new Date()): ExpiryState {
  if (expiresAt === null) return 'none';
  const left = new Date(expiresAt).getTime() - now.getTime();
  if (left <= 0) return 'expired';
  return left <= EXPIRY_WARNING_DAYS * DAY_MS ? 'soon' : 'valid';
}

/** "2026-12-31"-style date, unambiguous in every locale. */
export function formatDate(iso: string): string {
  return iso.slice(0, 10);
}
