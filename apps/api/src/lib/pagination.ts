import { z } from 'zod';
import { parse } from './parse';

const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export interface Paging {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
  /** Build the standard list response. */
  result<T>(data: T[], total: number): { data: T[]; total: number; page: number; pageSize: number };
}

/** paginate(req.query) -> { skip, take, result(data,total) } */
export function paginate(query: unknown): Paging {
  const { page, pageSize } = parse(pageSchema, query ?? {});
  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
    result: (data, total) => ({ data, total, page, pageSize }),
  };
}
