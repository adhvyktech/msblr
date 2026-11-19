import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env, isProd } from '../../lib/env';
import { prisma } from '../../lib/prisma';
import { httpError } from '../../lib/errors';
import { getSmsProvider, DEV_OTP, otpBypassFor, otpCodeFor } from '../../lib/sms';

// Same mechanism as /api/auth/otp (OtpRequest rows, HMAC hash, 5 min validity, 5 attempts, 3 sends / 15 min),
// but for people who are not registered yet. A successful confirm returns a short-lived signed token.
const OTP_TTL_MS = 5 * 60_000;
const MAX_ATTEMPTS = 5;
const MAX_SENDS = 3;
const SEND_WINDOW_MS = 15 * 60_000;
const RESEND_AFTER_SEC = 30;
export const OTP_TOKEN_TTL_SEC = 30 * 60;

const hashOtp = (mobile: string, code: string) => crypto.createHmac('sha256', env.JWT_SECRET).update(`${mobile}:${code}`).digest('hex');
// Distinct signing key so this token can never be mistaken for a login access token.
const tokenKey = () => `${env.JWT_SECRET}:registration-otp`;

export async function requestMobileOtp(mobile: string, ip?: string) {
  const since = new Date(Date.now() - SEND_WINDOW_MS);
  const sends = await prisma.otpRequest.findMany({ where: { mobile, createdAt: { gte: since } }, orderBy: { createdAt: 'desc' } });
  if (sends.length >= MAX_SENDS) {
    const wait = Math.max(1, Math.ceil((sends[sends.length - 1]!.createdAt.getTime() + SEND_WINDOW_MS - Date.now()) / 60_000));
    throw httpError(429, 'OTP_SEND_LIMIT', `Too many OTP requests. Please try again in ${wait} minute${wait > 1 ? 's' : ''}.`, { retryAfterMin: wait });
  }
  const last = sends[0];
  if (last && Date.now() - last.createdAt.getTime() < RESEND_AFTER_SEC * 1000 && !otpBypassFor(mobile)) {
    throw httpError(429, 'OTP_TOO_SOON', `Please wait ${RESEND_AFTER_SEC} seconds before requesting another OTP.`);
  }
  const code = otpCodeFor(mobile, () => String(crypto.randomInt(100000, 1000000)));
  await prisma.otpRequest.create({ data: { mobile, otpHash: hashOtp(mobile, code), expiresAt: new Date(Date.now() + OTP_TTL_MS), ip } });
  await getSmsProvider().sendOtp(mobile, code);
  return { sent: true, expiresInSec: OTP_TTL_MS / 1000, resendAfterSec: RESEND_AFTER_SEC, sendsLeft: MAX_SENDS - sends.length - 1 };
}

export async function confirmMobileOtp(mobile: string, code: string): Promise<string> {
  const bypass = otpBypassFor(mobile) && code === DEV_OTP;
  if (!bypass) {
    const otp = await prisma.otpRequest.findFirst({ where: { mobile, consumed: false, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } });
    if (!otp) throw httpError(400, 'OTP_EXPIRED', 'This OTP has expired. Please request a new one.');
    if (otp.attempts >= MAX_ATTEMPTS) throw httpError(429, 'OTP_ATTEMPTS', 'Too many wrong attempts. Please request a new OTP.');
    const ok = crypto.timingSafeEqual(Buffer.from(hashOtp(mobile, code)), Buffer.from(otp.otpHash));
    if (!ok) {
      const upd = await prisma.otpRequest.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      const left = MAX_ATTEMPTS - upd.attempts;
      throw httpError(400, 'OTP_INVALID', left > 0 ? `Incorrect OTP. ${left} attempt${left > 1 ? 's' : ''} left.` : 'Too many wrong attempts. Please request a new OTP.', { attemptsLeft: left });
    }
    await prisma.otpRequest.update({ where: { id: otp.id }, data: { consumed: true } });
  } else {
    await prisma.otpRequest.updateMany({ where: { mobile, consumed: false }, data: { consumed: true } });
  }
  return jwt.sign({ typ: 'reg-otp', mobile }, tokenKey(), { expiresIn: OTP_TOKEN_TTL_SEC });
}

/** Returns the verified mobile for a token, or throws 401/400. */
export function verifyOtpToken(token: string, expectedMobile: string): void {
  let mobile: string | undefined;
  try {
    const p = jwt.verify(token, tokenKey()) as jwt.JwtPayload;
    if (p.typ === 'reg-otp') mobile = p.mobile as string;
  } catch {
    throw httpError(401, 'OTP_TOKEN_INVALID', 'Mobile verification expired. Please verify your mobile number again.');
  }
  if (!mobile || mobile !== expectedMobile) throw httpError(401, 'OTP_TOKEN_INVALID', 'Mobile verification does not match this number. Please verify again.');
}

/** A mobile is a duplicate if it already has a login, or heads an ACTIVE/PENDING family. */
export async function findDuplicateMobile(mobile: string): Promise<'USER' | 'HEAD_ACTIVE' | 'HEAD_PENDING' | null> {
  if (await prisma.user.findUnique({ where: { mobile } })) return 'USER';
  const head = await prisma.person.findFirst({
    where: { mobile, isHead: true, deletedAt: null, family: { status: { in: ['ACTIVE', 'PENDING'] } } },
    select: { family: { select: { status: true } } },
  });
  if (!head) return null;
  return head.family.status === 'PENDING' ? 'HEAD_PENDING' : 'HEAD_ACTIVE';
}
export const duplicateMessage = (d: 'USER' | 'HEAD_ACTIVE' | 'HEAD_PENDING') =>
  d === 'HEAD_PENDING'
    ? 'A registration with this mobile number is already under review. Use "Check status" to follow it.'
    : 'This mobile number is already registered with the Sabha. Please sign in instead.';
