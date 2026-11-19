import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2, Clock, FileText, Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import {
  Avatar, Badge, Button, Card, Checkbox, DateInput, FileUpload, IconButton, Input, PageHeader, PhoneInput, Select, Stepper,
} from '@/components/ui';
import type { UploadedFile } from '@/lib/api';
import { ApiError } from '@/lib/api';
import { fmtDate, formatMobile } from '@/lib/format';
import { useZones } from '@/features/members/api';
import { PersonFormModal, emptyPerson, personPayload, relationKey, type PersonValues } from '@/features/family/PersonForm';
import { confirmOtp, requestOtp, submitRegistration } from './api';

interface Head {
  name: string; dob: string; anniversary: string; gender: string; mobile: string; email: string; education: string; occupation: string;
  zoneId: string; addressLine: string; area: string; pincode: string; photo: UploadedFile | null;
}
const EMPTY_HEAD: Head = { name: '', dob: '', anniversary: '', gender: '', mobile: '', email: '', education: '', occupation: '', zoneId: '', addressLine: '', area: '', pincode: '', photo: null };

export default function Register() {
  const { t } = useTranslation('registration');
  const { t: tf } = useTranslation('family');
  const zones = useZones();
  const [step, setStep] = useState(0);
  const [head, setHead] = useState<Head>(EMPTY_HEAD);
  const [members, setMembers] = useState<PersonValues[]>([]);
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [docs, setDocs] = useState<UploadedFile[]>([]);
  const [consent, setConsent] = useState(false);
  const [otpToken, setOtpToken] = useState<string | null>(null);
  const [verifiedMobile, setVerifiedMobile] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: number } | null>(null);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [step, done]);

  const steps = [t('steps.head'), t('steps.members'), t('steps.documents'), t('steps.review')];
  const verified = !!otpToken && verifiedMobile === head.mobile;

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const r = await submitRegistration({
        head: {
          name: head.name.trim(), dob: head.dob, anniversary: head.anniversary || null, gender: head.gender || null, mobile: head.mobile,
          email: head.email || null, education: head.education || null, occupation: head.occupation || null, photoFileId: head.photo?.id ?? null,
        },
        address: { addressLine: head.addressLine.trim(), area: head.area.trim(), pincode: head.pincode, zoneId: Number(head.zoneId) },
        members: members.map((m) => personPayload(m)),
        documentFileIds: docs.map((d) => d.id),
        otpToken,
      });
      setDone({ id: r.id });
    } catch (e) {
      const err = e as ApiError;
      setError(err.message);
      if (err.code === 'OTP_TOKEN_INVALID') { setOtpToken(null); setStep(0); }
      if (err.code === 'DUPLICATE_MOBILE') setStep(0);
    } finally { setSubmitting(false); }
  };

  if (done) {
    return (
      <div className="mx-auto max-w-lg">
        <Card className="text-center">
          <div className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-full bg-accent-soft text-accent"><Clock size={32} aria-hidden /></div>
          <h1 className="text-2xl">{t('success.title')}</h1>
          <p className="mt-2 text-muted">{t('success.body')}</p>
          <div className="mt-4 flex items-center justify-center gap-2"><span className="text-sm text-muted">{t('success.status')}</span><Badge tone="warning">{t('pending')}</Badge></div>
          <p className="mt-1 text-sm text-muted">{t('success.ref', { id: done.id })}</p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link to="/register/status"><Button variant="outline" fullWidth>{t('success.check')}</Button></Link>
            <Link to="/"><Button fullWidth>{t('success.home')}</Button></Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t('title')} subtitle={t('subtitle')} actions={<Link to="/register/status" className="font-semibold text-primary underline">{t('checkStatusLink')}</Link>} />
      <Stepper steps={steps} current={step} className="mb-6" />

      {step === 0 ? (
        <HeadStep
          head={head} zones={(zones.data ?? []).map((z) => ({ value: z.id, label: z.name }))} verified={verified}
          onVerified={(mobile, token) => { setOtpToken(token); setVerifiedMobile(mobile); }}
          onNext={(h) => { setHead(h); setStep(1); }}
        />
      ) : null}

      {step === 1 ? (
        <div>
          <ul className="space-y-3">
            {members.map((m, i) => (
              <li key={i}>
                <Card className="flex items-center gap-3 !p-3">
                  <Avatar name={m.name} src={m.photo?.url} size={44} />
                  <div className="min-w-0 flex-1"><p className="truncate font-semibold">{m.name}</p><p className="truncate text-sm text-muted">{tf(relationKey(m.relation))}{m.dob ? ` · ${fmtDate(m.dob)}` : ''}</p></div>
                  <IconButton icon={Pencil} label={t('editMember', { name: m.name })} onClick={() => setEditing(i)} />
                  <IconButton icon={Trash2} label={t('removeMember', { name: m.name })} className="text-danger" onClick={() => setMembers((l) => l.filter((_, j) => j !== i))} />
                </Card>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => setEditing('new')} className="mt-3 flex w-full flex-col items-center gap-1 rounded-theme border-2 border-dashed border-accent bg-accent-soft p-4 text-primary">
            <Plus size={24} aria-hidden /><span className="font-semibold">{t('addMember')}</span><span className="text-sm text-muted">{t('addMemberHint')}</span>
          </button>
          <Card className="mt-4 flex items-start gap-3 !p-3"><ShieldCheck size={20} className="mt-0.5 shrink-0 text-accent" aria-hidden /><p className="text-sm">{t('noLoginNote')}</p></Card>
          <Nav onBack={() => setStep(0)} onNext={() => setStep(2)} nextLabel={t('nextDocuments')} />
          <PersonFormModal
            open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? tf('form.addTitle') : tf('form.editTitle')}
            initial={editing !== null && editing !== 'new' ? members[editing]! : emptyPerson()}
            onSubmit={async (v) => { setMembers((l) => (editing === 'new' ? [...l, v] : l.map((x, i) => (i === editing ? v : x)))); setEditing(null); }}
          />
        </div>
      ) : null}

      {step === 2 ? (
        <div>
          <p className="mb-3 text-muted">{t('docsHint')}</p>
          <ul className="mb-3 space-y-2">
            {docs.map((d, i) => (
              <li key={d.id} className="flex items-center gap-3 rounded-theme-sm border border-line bg-surface p-3">
                <FileText size={22} className="text-accent" aria-hidden /><span className="flex-1 truncate">{t('docN', { n: i + 1 })}</span>
                <IconButton icon={Trash2} label={t('removeDoc')} className="text-danger" onClick={() => setDocs((l) => l.filter((x) => x.id !== d.id))} />
              </li>
            ))}
          </ul>
          {docs.length < 8 ? <FileUpload kind="document" label={docs.length ? t('addAnotherDoc') : t('addDoc')} required={!docs.length} value={null} onChange={(f) => { if (f) setDocs((l) => [...l, f]); }} maxMb={10} /> : null}
          <Nav onBack={() => setStep(1)} onNext={() => setStep(3)} nextLabel={t('nextReview')} nextDisabled={docs.length === 0} />
        </div>
      ) : null}

      {step === 3 ? (
        <div>
          <Card padded={false}>
            <ReviewRow label={t('review.head')} value={`${head.name} · ${formatMobile(head.mobile)}`} onEdit={() => setStep(0)} />
            <ReviewRow label={t('review.address')} value={`${head.addressLine}, ${head.area} ${head.pincode}`} onEdit={() => setStep(0)} />
            <ReviewRow label={t('review.members')} value={members.length ? t('review.added', { count: members.length }) : t('review.none')} onEdit={() => setStep(1)} />
            <ReviewRow label={t('review.documents')} value={t('review.docCount', { count: docs.length })} onEdit={() => setStep(2)} />
          </Card>
          <Checkbox className="mt-4" checked={consent} onChange={(e) => setConsent(e.target.checked)} label={t('consent')} />
          {error ? <p role="alert" className="mt-3 rounded-theme-sm bg-danger-soft p-3 text-sm text-danger">{error}</p> : null}
          <div className="mt-4 flex gap-3">
            <Button variant="outline" onClick={() => setStep(2)} disabled={submitting}>{t('back')}</Button>
            <Button className="flex-1" disabled={!consent || !verified} loading={submitting} onClick={() => void submit()}>{t('submit')}</Button>
          </div>
          {!verified ? <p className="mt-2 text-sm text-danger">{t('verifyAgain')}</p> : null}
          <Card tone="accent-soft" className="mt-6 text-center"><p className="font-semibold">{t('after.title')}</p><p className="text-sm text-muted">{t('after.body')}</p></Card>
        </div>
      ) : null}
    </div>
  );
}

function Nav({ onBack, onNext, nextLabel, nextDisabled }: { onBack: () => void; onNext: () => void; nextLabel: string; nextDisabled?: boolean }) {
  const { t } = useTranslation('registration');
  return (
    <div className="mt-6 flex gap-3">
      <Button variant="outline" onClick={onBack}>{t('back')}</Button>
      <Button className="flex-1" onClick={onNext} disabled={nextDisabled}>{nextLabel}</Button>
    </div>
  );
}

function ReviewRow({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) {
  const { t } = useTranslation('registration');
  return (
    <div className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0">
      <div className="min-w-0 flex-1"><p className="text-xs text-muted">{label}</p><p className="break-words font-semibold">{value}</p></div>
      <button type="button" onClick={onEdit} className="min-h-[44px] px-2 font-semibold text-primary">{t('edit')}</button>
    </div>
  );
}

function HeadStep({ head, zones, verified, onVerified, onNext }: {
  head: Head; zones: { value: number; label: string }[]; verified: boolean; onVerified: (mobile: string, token: string) => void; onNext: (h: Head) => void;
}) {
  const { t } = useTranslation('registration');
  const { t: tf } = useTranslation('family');
  const schema = useMemo(() => z.object({
    name: z.string().trim().min(2, tf('form.errName')),
    dob: z.string().min(1, tf('form.errDob')).refine((d) => d < new Date().toISOString().slice(0, 10), tf('form.errDob')),
    anniversary: z.string(), gender: z.string(),
    mobile: z.string().regex(/^[6-9]\d{9}$/, tf('form.errMobile')),
    email: z.string().refine((v) => v === '' || /^\S+@\S+\.\S+$/.test(v), tf('form.errEmail')),
    education: z.string(), occupation: z.string(),
    zoneId: z.string().min(1, t('errZone')),
    addressLine: z.string().trim().min(3, t('errAddress')),
    area: z.string().trim().min(2, t('errArea')),
    pincode: z.string().regex(/^\d{6}$/, t('errPincode')),
    photo: z.custom<UploadedFile | null>(),
  }), [t, tf]);
  const { register, control, handleSubmit, watch, formState: { errors } } = useForm<Head>({ resolver: zodResolver(schema), defaultValues: head });
  const mobile = watch('mobile');

  // OTP sub-flow
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [otpErr, setOtpErr] = useState<string | null>(null);
  const [showVerifyErr, setShowVerifyErr] = useState(false);
  const validMobile = /^[6-9]\d{9}$/.test(mobile);
  useEffect(() => { setSent(false); setCode(''); setOtpErr(null); }, [mobile]);

  const send = async () => {
    setBusy(true); setOtpErr(null);
    try { await requestOtp(mobile); setSent(true); } catch (e) { setOtpErr((e as Error).message); } finally { setBusy(false); }
  };
  const verify = async () => {
    setBusy(true); setOtpErr(null);
    try { const r = await confirmOtp(mobile, code, 'register'); onVerified(mobile, r.otpToken); setSent(false); } catch (e) { setOtpErr((e as Error).message); } finally { setBusy(false); }
  };
  const today = new Date().toISOString().slice(0, 10);
  const next = handleSubmit((v) => { if (!verified) { setShowVerifyErr(true); return; } onNext(v); });

  return (
    <form onSubmit={next} noValidate className="space-y-4">
      <Controller control={control} name="photo" render={({ field }) => (
        <FileUpload kind="photo" accept="image/jpeg,image/png,image/webp" maxMb={5} label={t('photo')} hint={t('photoHint')} value={field.value} onChange={field.onChange} />
      )} />
      <Input label={t('fullName')} required autoComplete="name" error={errors.name?.message} {...register('name')} />
      <div className="grid gap-4 sm:grid-cols-2">
        <DateInput label={tf('form.dob')} required max={today} error={errors.dob?.message} {...register('dob')} />
        <DateInput label={tf('form.anniversary')} max={today} {...register('anniversary')} />
      </div>
      <div>
        <PhoneInput label={t('mobile')} required error={errors.mobile?.message} {...register('mobile')} />
        {verified && mobile ? <p className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold text-success"><CheckCircle2 size={16} aria-hidden />{t('verified')}</p> : (
          <div className="mt-2 space-y-2">
            {!sent ? <Button size="sm" variant="outline" disabled={!validMobile} loading={busy} onClick={() => void send()}>{t('sendOtp')}</Button> : (
              <div className="flex flex-wrap items-end gap-2">
                <Input aria-label={t('otpLabel')} label={t('otpLabel')} inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} wrapperClassName="!w-44" placeholder="123456" autoComplete="one-time-code" />
                <Button size="sm" loading={busy} disabled={code.length !== 6} onClick={() => void verify()}>{t('verifyOtp')}</Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => void send()}>{t('resend')}</Button>
              </div>
            )}
            {otpErr ? <p role="alert" className="text-sm text-danger">{otpErr}</p> : <p className="text-sm text-muted">{t('otpHint')}</p>}
            {showVerifyErr && !verified ? <p role="alert" className="text-sm text-danger">{t('mustVerify')}</p> : null}
          </div>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label={tf('form.email')} type="email" error={errors.email?.message} {...register('email')} />
        <Select label={tf('form.gender')} placeholder={tf('form.select')} options={[{ value: 'MALE', label: tf('form.male') }, { value: 'FEMALE', label: tf('form.female') }, { value: 'OTHER', label: tf('form.other') }]} {...register('gender')} />
        <Input label={tf('form.education')} {...register('education')} />
        <Input label={tf('form.occupation')} {...register('occupation')} />
      </div>
      <Select label={t('zone')} required placeholder={tf('form.select')} options={zones} error={errors.zoneId?.message} {...register('zoneId')} />
      <Input label={t('addressLine')} required placeholder={t('addressHint')} error={errors.addressLine?.message} {...register('addressLine')} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label={t('area')} required error={errors.area?.message} {...register('area')} />
        <Input label={t('pincode')} required inputMode="numeric" maxLength={6} error={errors.pincode?.message} {...register('pincode')} />
      </div>
      <Button type="submit" fullWidth size="lg">{t('nextMembers')}</Button>
    </form>
  );
}
