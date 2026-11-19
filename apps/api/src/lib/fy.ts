/** Indian financial year label: fyOf(2026-05-01) -> "26-27"; Jan-Mar belongs to previous FY. */
export function fyOf(date: Date | string = new Date()): string {
  const d = new Date(date);
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  const a = String(y % 100).padStart(2, '0');
  const b = String((y + 1) % 100).padStart(2, '0');
  return `${a}-${b}`;
}
/** Last day (23:59:59) of the FY label e.g. "26-27" -> 31 Mar 2027 */
export function fyEnd(fy: string): Date {
  const y = 2000 + Number(fy.split('-')[1]);
  return new Date(y, 2, 31, 23, 59, 59);
}
