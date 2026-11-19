export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}
/** Throw with: throw httpError(404, 'NOT_FOUND', 'Family not found') */
export function httpError(status: number, code: string, message: string, details?: unknown): HttpError {
  return new HttpError(status, code, message, details);
}
