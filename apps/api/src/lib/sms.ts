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
