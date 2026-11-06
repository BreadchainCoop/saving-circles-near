// NEAR account ID rules: 2–64 chars, lowercase a–z 0–9, with - _ . separators.
const ACCOUNT_RE = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;

export const isAccountId = (s: string) =>
  s.length >= 2 && s.length <= 64 && ACCOUNT_RE.test(s);

export const normalizeAccountId = (s: string) => s.trim().toLowerCase();

/** Contract limits (MINIMUM_MEMBERS, MAX_MEMBERS in contracts/src/lib.rs). */
export const MIN_MEMBERS = 2;
export const MAX_MEMBERS = 25;
