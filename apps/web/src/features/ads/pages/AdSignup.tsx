import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Megaphone } from 'lucide-react';
import { Button, Card, Input, PhoneInput } from '@/components/ui';
import { ApiError, api, setAccessToken } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/useT';

/** Public: non-members create an advertiser account, verified by OTP. */
export default function AdSignup() {
  const { t } = useT('ads');
  const { status } = useAuth();
  const [step, setStep] = useState<0 | 1>(0);
  const [f, setF] = useState({ name: '', contactPerson: '', mobile: '', email: '', code: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (f.name.trim().length < 2) e.name = t('signup.errName');
    if (f.contactPerson.trim().length < 2) e.contactPerson = t('signup.errContact');
    if (!/^[6-9]\d{9}$/.test(f.mobile)) e.mobile = t('signup.errMobile');
    if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) e.email = t('signup.errEmail');
    setFieldErr(e);
    return Object.keys(e).length === 0;
  }

  async function sendOtp() {
    if (!validate()) return;
    setBusy(true); setErr(null);
    try { await api.post('/api/advertisers/signup/request', { mobile: f.mobile }); setStep(1); }
    catch (e) { setErr((e as ApiError).message); }
    finally { setBusy(false); }
  }
  async function confirm() {
    if (!/^\d{6}$/.test(f.code)) { setFieldErr({ code: t('signup.errCode') }); return; }
    setBusy(true); setErr(null);
    try {
      const r = await api.post<{ accessToken: string }>('/api/advertisers/signup', {
        name: f.name.trim(), contactPerson: f.contactPerson.trim(), mobile: f.mobile, email: f.email.trim(), code: f.code, trustDevice: true,
      });
      setAccessToken(r.accessToken);
      window.location.assign('/advertise/new'); // reload so the session (cookie) is picked up everywhere
    } catch (e) { setErr((e as ApiError).message); setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <div className="mb-5 text-center">
        <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-accent-soft text-primary"><Megaphone size={26} aria-hidden /></span>
        <h1 className="text-2xl">{t('signup.title')}</h1>
        <p className="mt-1 text-muted">{t('signup.subtitle')}</p>
      </div>
      <Card className="space-y-4">
        {step === 0 ? (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void sendOtp(); }} noValidate>
            <Input label={t('signup.business')} value={f.name} onChange={set('name')} error={fieldErr.name} required maxLength={120} autoComplete="organization" />
            <Input label={t('signup.contact')} value={f.contactPerson} onChange={set('contactPerson')} error={fieldErr.contactPerson} required maxLength={100} autoComplete="name" />
            <PhoneInput label={t('signup.mobile')} value={f.mobile} onChange={set('mobile')} error={fieldErr.mobile} required />
            <Input label={t('signup.email')} type="email" value={f.email} onChange={set('email')} error={fieldErr.email} autoComplete="email" hint={t('signup.emailHint')} />
            {err ? <p role="alert" className="text-sm text-danger">{err}</p> : null}
            <Button type="submit" fullWidth size="lg" loading={busy}>{t('signup.sendOtp')}</Button>
          </form>
        ) : (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void confirm(); }} noValidate>
            <p className="text-sm text-muted">{t('signup.otpSent', { mobile: f.mobile })}</p>
            <Input label={t('signup.otp')} value={f.code} onChange={(e) => setF((s) => ({ ...s, code: e.target.value.replace(/\D/g, '').slice(0, 6) }))} inputMode="numeric" autoComplete="one-time-code" error={fieldErr.code} required maxLength={6} />
            {err ? <p role="alert" className="text-sm text-danger">{err}</p> : null}
            <Button type="submit" fullWidth size="lg" loading={busy}>{t('signup.create')}</Button>
            <Button type="button" variant="ghost" fullWidth onClick={() => { setStep(0); setErr(null); }}>{t('signup.change')}</Button>
          </form>
        )}
      </Card>
      <p className="mt-4 text-center text-sm text-muted">
        {status === 'authed' ? <Link to="/advertise" className="font-semibold text-primary">{t('signup.backToAdvertise')}</Link> : <>{t('signup.haveAccount')} <Link to="/login?next=/advertise" className="font-semibold text-primary">{t('signup.login')}</Link></>}
      </p>
    </div>
  );
}
