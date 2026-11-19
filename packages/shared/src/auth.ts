import { z } from 'zod';

/** Normalise to a 10-digit Indian mobile (strips +91, 0, spaces, dashes). */
export function normalizeMobile(input: string): string {
  let d = String(input ?? '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d;
}
export const mobileSchema = z.string().transform(normalizeMobile).refine((v) => /^[6-9]\d{9}$/.test(v) || /^9000\d{6}$/.test(v), 'Enter a valid 10-digit mobile number');

export const otpRequestSchema = z.object({ mobile: mobileSchema });
export const otpVerifySchema = z.object({
  mobile: mobileSchema,
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
  trustDevice: z.boolean().optional(),
  deviceName: z.string().max(100).optional(),
  platform: z.enum(['web', 'android', 'ios']).optional(),
});
export const refreshSchema = z.object({ refreshToken: z.string().optional() }).default({});
export const languageSchema = z.object({ language: z.enum(['en', 'hi']) });
export const deviceTokenSchema = z.object({ token: z.string().min(10).max(4096), platform: z.enum(['web', 'android', 'ios']) });
export const deviceTokenDeleteSchema = z.object({ token: z.string().min(10).max(4096) });
