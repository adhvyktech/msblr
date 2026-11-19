export const DAY = 86400_000;
const IST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });

/** yyyy-mm-dd in India time. */
export const dayKey = (d: Date) => IST.format(d);

/** Last n calendar days (IST) as yyyy-mm-dd, oldest first. */
export function lastDays(n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(dayKey(new Date(Date.now() - i * DAY)));
  return out;
}

/** auth.login summaries end with "(web)" or "(android)" etc. */
export const platformOf = (summary?: string | null): 'web' | 'app' | 'unknown' => {
  const m = summary?.match(/\(([\w-]+)\)\s*$/);
  if (!m) return 'unknown';
  return m[1]!.toLowerCase() === 'web' ? 'web' : 'app';
};
