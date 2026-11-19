import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, PageHeader, PhoneInput, StatusBadge } from '@/components/ui';
import { fmtDate } from '@/lib/format';
import { confirmOtp, fetchStatus, requestOtp, type RegStatus } from './api';

export default function RegisterStatus() {
  const { t } = useTranslation('registration');
  const [mobile, setMobile] = useState('');
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<RegStatus | null>(null);
  const valid = /^[6-9]\d{9}$/.test(mobile);

  const send = async () => {
    setBusy(true); setErr(null);
    try { await requestOtp(mobile); setSent(true); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const check = async () => {
    setBusy(true); setErr(null);
    try {
      const { otpToken } = await confirmOtp(mobile, code, 'status');
      setRes(await fetchStatus(mobile, otpToken));
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-md">
      <PageHeader title={t('status.title')} subtitle={t('status.subtitle')} />
      {res ? (
        <Card>
          <div className="flex items-center justify-between gap-3">
            <div><p className="text-sm text-muted">{t('status.applicant')}</p><p className="text-lg font-semibold">{res.headName}</p></div>
            <StatusBadge status={res.status} />
          </div>
          <dl className="mt-4 space-y-2 text-[15px]">
            <div className="flex justify-between gap-3"><dt className="text-muted">{t('status.submitted')}</dt><dd>{fmtDate(res.submittedAt)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">{t('status.members')}</dt><dd>{res.memberCount}</dd></div>
            {res.membershipNo ? <div className="flex justify-between gap-3"><dt className="text-muted">{t('status.membershipNo')}</dt><dd className="font-bold">{res.membershipNo}</dd></div> : null}
          </dl>
          {res.status === 'PENDING' ? <p className="mt-4 rounded-theme-sm bg-accent-soft p-3 text-sm">{t('status.pendingNote')}</p> : null}
          {res.status === 'REJECTED' ? <p className="mt-4 rounded-theme-sm bg-danger-soft p-3 text-sm text-danger">{t('status.rejectedNote', { remarks: res.remarks ?? '' })}</p> : null}
          {res.status === 'APPROVED' ? <Link to="/login" className="mt-4 block"><Button fullWidth>{t('status.signIn')}</Button></Link> : null}
          {res.status === 'REJECTED' ? <Link to="/register" className="mt-4 block"><Button fullWidth variant="outline">{t('status.registerAgain')}</Button></Link> : null}
          <Button variant="ghost" fullWidth className="mt-2" onClick={() => { setRes(null); setSent(false); setCode(''); }}>{t('status.another')}</Button>
        </Card>
      ) : (
        <Card className="space-y-4">
          <PhoneInput label={t('mobile')} required value={mobile} onChange={(e) => { setMobile(e.target.value); setSent(false); setCode(''); }} />
          {!sent ? <Button fullWidth disabled={!valid} loading={busy} onClick={() => void send()}>{t('sendOtp')}</Button> : (
            <>
              <Input label={t('otpLabel')} inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoComplete="one-time-code" placeholder="123456" />
              <Button fullWidth disabled={code.length !== 6} loading={busy} onClick={() => void check()}>{t('status.check')}</Button>
              <Button fullWidth variant="ghost" disabled={busy} onClick={() => void send()}>{t('resend')}</Button>
            </>
          )}
          {err ? <p role="alert" className="text-sm text-danger">{err}</p> : <p className="text-sm text-muted">{t('otpHint')}</p>}
        </Card>
      )}
    </div>
  );
}
