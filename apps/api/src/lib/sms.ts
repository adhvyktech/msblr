import { env } from './env';

export interface SmsProvider {
  sendOtp(mobile: string, code: string): Promise<void>;
}
export class ConsoleSmsProvider implements SmsProvider {
  async sendOtp(mobile: string, code: string) {
    if (env.NODE_ENV !== 'test') console.log(`[sms] OTP for ${mobile}: ${code}`);
  }
}
let provider: SmsProvider = new ConsoleSmsProvider();
export const getSmsProvider = () => provider;
/** Swap in a real gateway (or a spy in tests). */
export const setSmsProvider = (p: SmsProvider) => { provider = p; };
export const DEV_OTP = '123456';

/**
 * Demo logins (live demo before DLT SMS is approved). Comma list in DEMO_OTP_MOBILES;
 * an entry ending in "*" is a prefix (e.g. "90000000*"). Works in production but ONLY for listed numbers.
 */
const demoEntries = (env.DEMO_OTP_MOBILES ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const isDemoMobile = (mobile: string) =>
  demoEntries.some((e) => (e.endsWith('*') ? mobile.startsWith(e.slice(0, -1)) : mobile === e));

/** True when the fixed code 123456 is accepted for this mobile. */
export const otpBypassFor = (mobile: string) =>
  (env.DEV_OTP_BYPASS && env.NODE_ENV !== 'production') || isDemoMobile(mobile);

/** The OTP to issue for this mobile (fixed for bypass numbers, random otherwise). */
export const otpCodeFor = (mobile: string, random: () => string) => (otpBypassFor(mobile) ? DEV_OTP : random());
