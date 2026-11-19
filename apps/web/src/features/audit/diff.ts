export interface Change { field: string; before: unknown; after: unknown }

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Fields that differ between the before/after JSON of an audit row. */
export function diffChanges(before: unknown, after: unknown): Change[] {
  if (isObj(before) || isObj(after)) {
    const b = isObj(before) ? before : {};
    const a = isObj(after) ? after : {};
    return [...new Set([...Object.keys(b), ...Object.keys(a)])]
      .filter((k) => JSON.stringify(b[k]) !== JSON.stringify(a[k]))
      .map((k) => ({ field: k, before: b[k], after: a[k] }));
  }
  if (before == null && after == null) return [];
  return [{ field: '', before, after }];
}

export function showValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
