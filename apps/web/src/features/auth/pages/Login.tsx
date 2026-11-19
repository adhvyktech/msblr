import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Clock, Info, ShieldAlert, UserPlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/cn';
import { formatMobile } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { PhoneInput } from '@/components/ui/forms';
import { Toggle } from '@/components/ui/forms';

interface Problem { code: string; message: string; details?: { personName?: string; headName?: string; membershipNo?: string } }

const safeNext = (n: string | null) => (n && n.startsWith('/') && !n.startsWith('//') && !n.startsWith('/login') ? n : '/');

export default function Login() {
  const { t } = useTranslation('auth');
  const { status, requestOtp, verifyOtp } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));

  const [step, setStep] = useState<'mobile' | 'otp'>('mobile');
  const [mobile, setMobile] = useState('');
  const [mobileErr, setMobileErr] = useState<string | undefined>();
  const [digits, setDigits] = useState<string[]>(Array(6).fill(''));
  const [trust, setTrust] = useState(true);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [resendIn]);

  const fail = (e: unknown): Problem => {
    if (e instanceof ApiError) return { code: e.code, message: e.message, details: e.details as Problem['details'] };
    return { code: 'ERROR', message: t('errors.generic') };
  };

  const sendOtp = useCallback(async () => {
    setProblem(null);
    if (!/^[6-9]\d{9}$/.test(mobile)) { setMobileErr(t('errors.invalidMobile')); return; }
    setMobileErr(undefined);
    setBusy(true);
    try {
      const r = await requestOtp(mobile);
      setResendIn(r.resendAfterSec ?? 30);
      setDigits(Array(6).fill(''));
      setStep('otp');
      setTimeout(() => boxes.current[0]?.focus(), 50);
    } catch (e) {
      setProblem(fail(e));
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mobile, requestOtp]);

  const submitCode = useCallback(async (code: string) => {
    setBusy(true);
    setProblem(null);
    try {
      await verifyOtp(mobile, code, trust);
      nav(next, { replace: true });
    } catch (e) {
      setProblem(fail(e));
      setDigits(Array(6).fill(''));
      setTimeout(() => boxes.current[0]?.focus(), 50);
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mobile, trust, verifyOtp, nav, next]);

  const setDigit = (i: number, v: string) => {
    const d = v.replace(/\D/g, '');
    if (!d) { setDigits((a) => a.map((x, j) => (j === i ? '' : x))); return; }
    const arr = [...digits];
    // typing/pasting several digits fills forward
    d.slice(0, 6 - i).split('').forEach((ch, k) => { arr[i + k] = ch; });
    setDigits(arr);
    const nextIdx = Math.min(i + d.length, 5);
    boxes.current[nextIdx]?.focus();
    if (arr.every(Boolean) && !busy) void submitCode(arr.join(''));
  };
  const onKey = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) { boxes.current[i - 1]?.focus(); setDigits((a) => a.map((x, j) => (j === i - 1 ? '' : x))); }
    if (e.key === 'ArrowLeft' && i > 0) boxes.current[i - 1]?.focus();
    if (e.key === 'ArrowRight' && i < 5) boxes.current[i + 1]?.focus();
  };
  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '');
    if (text.length > 1) { e.preventDefault(); setDigit(0, text); }
  };

  if (status === 'authed') return <Navigate to={next} replace />;

  const code = digits.join('');
  const pending = problem && (problem.code === 'LOGIN_PENDING' || problem.code === 'REGISTRATION_PENDING');
  const limit = problem && ['OTP_SEND_LIMIT', 'OTP_TOO_SOON', 'RATE_LIMITED', 'OTP_ATTEMPTS'].includes(problem.code);

  const banner = problem ? (
    problem.code === 'NOT_REGISTERED' ? (
      <div role="alert" className="mb-5 rounded-theme-sm border border-info/30 bg-info-soft p-4 text-ink">
        <p className="flex items-center gap-2 font-semibold text-info"><Info size={18} aria-hidden />{t('notRegistered.title')}</p>
        <p className="mt-1 text-sm">{t('notRegistered.body')}</p>
        <Link to="/register" className="mt-3 inline-flex min-h-[44px] items-center gap-2 font-semibold text-primary underline"><UserPlus size={18} aria-hidden />{t('registerLink')}</Link>
      </div>
    ) : pending ? (
      <div role="alert" className="mb-5 rounded-theme-sm border border-warning/30 bg-warning-soft p-4">
        <p className="flex items-center gap-2 font-semibold text-warning"><Clock size={18} aria-hidden />{problem.code === 'LOGIN_PENDING' ? t('loginPending.title') : t('regPending.title')}</p>
        <p className="mt-1 text-sm text-ink">
          {problem.code === 'LOGIN_PENDING'
            ? t('loginPending.body', { name: problem.details?.personName ?? '', head: problem.details?.headName ?? '', no: problem.details?.membershipNo ?? '' })
            : t('regPending.body')}
        </p>
      </div>
    ) : limit ? (
      <div role="alert" className="mb-5 flex gap-3 rounded-theme-sm border border-warning/30 bg-warning-soft p-4 text-sm text-ink"><ShieldAlert size={20} className="mt-0.5 shrink-0 text-warning" aria-hidden /><span>{problem.message}</span></div>
    ) : (
      <div role="alert" className="mb-5 rounded-theme-sm border border-danger/30 bg-danger-soft p-3.5 text-sm text-danger">{problem.message}</div>
    )
  ) : null;

  return (
    <div>
      {step === 'mobile' ? (
        <form onSubmit={(e) => { e.preventDefault(); void sendOtp(); }} noValidate>
          <h1 className="text-2xl">{t('welcome')}</h1>
          <p className="mb-6 mt-1 text-muted">{t('mobileHelp')}</p>
          {banner}
          <PhoneInput
            label={t('mobileLabel')} required value={mobile} error={mobileErr} autoFocus
            onChange={(e) => { setMobile(e.target.value); setMobileErr(undefined); }}
          />
          <p className="mt-2 text-sm text-muted">{t('smsNote')}</p>
          <Button type="submit" size="lg" fullWidth className="mt-6" loading={busy}>{t('sendOtp')}</Button>
          <div className="mt-6 border-t border-line pt-5 text-center">
            <p className="text-sm text-muted">{t('newHere')}</p>
            <Link to="/register" className="mt-1 inline-flex min-h-[44px] items-center gap-2 font-semibold text-primary underline"><UserPlus size={18} aria-hidden />{t('registerLink')}</Link>
          </div>
        </form>
      ) : (
        <div>
          <button type="button" onClick={() => { setStep('mobile'); setProblem(null); }} className="-ml-2 mb-3 inline-flex min-h-[44px] items-center gap-1 px-2 text-sm font-semibold text-primary">
            <ArrowLeft size={18} aria-hidden />{t('change')}
          </button>
          <h1 className="text-2xl">{t('enterOtp')}</h1>
          <p className="mb-6 mt-1 text-muted">{t('sentTo', { mobile: formatMobile(mobile) })}</p>
          {banner}
          <div className="flex justify-between gap-2" role="group" aria-label={t('enterOtp')}>
            {digits.map((d, i) => (
              <input
                key={i} ref={(el) => { boxes.current[i] = el; }} value={d} inputMode="numeric" pattern="[0-9]*" maxLength={6}
                autoComplete={i === 0 ? 'one-time-code' : 'off'} aria-label={t('digit', { n: i + 1 })} disabled={busy}
                onChange={(e) => setDigit(i, e.target.value)} onKeyDown={(e) => onKey(i, e)} onPaste={onPaste} onFocus={(e) => e.target.select()}
                className={cn('h-14 w-full min-w-0 rounded-theme-xs border-2 bg-surface text-center text-2xl font-bold focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25',
                  d ? 'border-primary/60' : 'border-line', problem && 'border-danger')}
              />
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-1.5 text-muted"><Clock size={16} aria-hidden />{resendIn > 0 ? t('resendIn', { time: `0:${String(resendIn).padStart(2, '0')}` }) : t('didntGet')}</span>
            <button type="button" disabled={resendIn > 0 || busy} onClick={() => void sendOtp()} className="min-h-[44px] px-2 font-semibold text-primary disabled:text-muted disabled:no-underline">{t('resend')}</button>
          </div>
          <div className="mt-2 rounded-theme-sm bg-bg px-3 py-1">
            <Toggle checked={trust} onChange={setTrust} label={t('keepLoggedIn')} description={t('keepLoggedInHint')} />
          </div>
          <Button size="lg" fullWidth className="mt-5" loading={busy} disabled={code.length < 6} onClick={() => void submitCode(code)}>{t('verify')}</Button>
        </div>
      )}
    </div>
  );
}
