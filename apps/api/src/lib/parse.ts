import type { ZodTypeAny, z } from 'zod';
import { httpError } from './errors';

/** Validate data with a zod schema; throws 400 VALIDATION_ERROR with field details. */
export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.output<S> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const details = r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw httpError(400, 'VALIDATION_ERROR', details[0]?.message ?? 'Invalid input', details);
  }
  return r.data;
}
