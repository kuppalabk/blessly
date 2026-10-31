import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export const notFound = (what = 'Not found') => new AppError(404, 'not_found', what);
export const badRequest = (msg: string) => new AppError(400, 'bad_request', msg);

export function toErrorBody(e: unknown): { status: number; body: { error: string; code: string; fields?: Record<string, string> } } {
  if (e instanceof AppError) return { status: e.status, body: { error: e.message, code: e.code } };
  if (e instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const i of e.issues) fields[i.path.join('.') || '_'] = i.message;
    return { status: 400, body: { error: e.issues[0]?.message ?? 'Invalid input', code: 'invalid', fields } };
  }
  console.error(e);
  return { status: 500, body: { error: 'Something went wrong', code: 'internal' } };
}
