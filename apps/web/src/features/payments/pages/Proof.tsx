import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Clock, Hourglass } from 'lucide-react';
import { useT } from '@/lib/useT';
import { useAuth } from '@/lib/auth';
import type { UploadedFile } from '@/lib/api';
import { Button, Card, DateInput, EmptyState, FileUpload, Input, PageHeader, RadioCards, Skeleton, useToast } from '@/components/ui';
import { BackLink, errMsg, todayISO } from '../shared';
import { useSubscription, useSubmitPayment } from '../api';

interface FormValues { file: UploadedFile | null; utr: string; amount: string; paidOn: string; kind: 'SUBSCRIPTION' | 'DONATION'; purpose: string }

export default function Proof() {
  const { t } = useT('payments');
  const { isHead } = useAuth();
  const toast = useToast();
  const [sp] = useSearchParams();
  const sub = useSubscription();
  const submit = useSubmitPayment();
  const [done, setDone] = useState(false);
  const [serverUtrError, setServerUtrError] = useState<string | null>(null);

  const schema = useMemo(() => z.object({
    file: z.object({ id: z.number(), url: z.string() }, { invalid_type_error: t('proof.errScreenshot'), required_error: t('proof.errScreenshot') }).nullable().refine((v) => !!v, t('proof.errScreenshot')),
    utr: z.string().trim().regex(/^[A-Za-z0-9]{12,22}$/, t('proof.errUtr')),
    amount: z.string().refine((v) => Number(v) > 0, t('proof.errAmount')),
    paidOn: z.string().min(1, t('proof.errDate')).refine((v) => v <= todayISO(), t('proof.errFuture')),
    kind: z.enum(['SUBSCRIPTION', 'DONATION']),
    purpose: z.string().max(200),
  }), [t]);

  const { control, register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema) as never,
    defaultValues: { file: null, utr: '', amount: '', paidOn: todayISO(), kind: sp.get('kind') === 'donation' ? 'DONATION' : 'SUBSCRIPTION', purpose: '' },
  });
  const kind = watch('kind');
  const amountDefault = sub.data?.amount;
  useEffect(() => {
    if (amountDefault && watch('kind') === 'SUBSCRIPTION' && !watch('amount')) setValue('amount', String(amountDefault));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amountDefault]);

  if (!isHead) {
    return <div className="mx-auto max-w-md"><EmptyState title={t('proof.headOnlyTitle')} description={t('proof.headOnlyBody')} action={<Link to="/me/subscription"><Button variant="outline">{t('proof.backToSub')}</Button></Link>} /></div>;
  }
  if (sub.isLoading) return <div className="mx-auto max-w-md"><Skeleton className="h-80 w-full" /></div>;

  if (done) {
    return (
      <div className="mx-auto max-w-md">
        <Card className="mt-6 text-center">
          <div className="mx-auto mb-4 grid h-20 w-20 place-items-center rounded-full bg-warning-soft text-warning"><Hourglass size={40} aria-hidden /></div>
          <h1 className="text-2xl">{t('proof.successTitle')}</h1>
          <p className="mt-2 text-muted">{t('proof.successBody')}</p>
          <div className="mt-6 flex flex-col gap-2">
            <Link to="/me/payments"><Button fullWidth>{t('proof.viewPayments')}</Button></Link>
            <Link to="/me/subscription"><Button fullWidth variant="outline">{t('proof.backToSub')}</Button></Link>
          </div>
        </Card>
      </div>
    );
  }

  const onSubmit = handleSubmit(async (v) => {
    setServerUtrError(null);
    try {
      await submit.mutateAsync({
        kind: v.kind, amount: Number(v.amount), utr: v.utr.trim(), paidOn: v.paidOn,
        purpose: v.kind === 'DONATION' ? v.purpose.trim() || undefined : undefined, screenshotFileId: v.file!.id,
      });
      setDone(true);
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'UTR_EXISTS') setServerUtrError((e as Error).message);
      else toast.error(errMsg(e, t('common.error')));
    }
  });

  return (
    <div className="mx-auto max-w-md">
      <PageHeader back={<BackLink to="/me/subscription/pay" />} title={t('proof.title')} />
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Card className="space-y-4">
          <Controller
            control={control} name="file"
            render={({ field }) => (
              <FileUpload
                kind="payment_proof" label={t('proof.screenshot')} required value={field.value} onChange={field.onChange}
                accept="image/jpeg,image/png,image/webp" maxMb={5} hint={t('proof.screenshotHint')}
                error={errors.file?.message as string | undefined}
              />
            )}
          />
          <Input
            label={t('proof.utr')} required autoComplete="off" autoCapitalize="characters" maxLength={22} placeholder="431298765410"
            hint={t('proof.utrHint')} error={serverUtrError ?? errors.utr?.message} {...register('utr', { onChange: () => setServerUtrError(null) })}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label={t('proof.amount')} required type="number" inputMode="decimal" step="0.01" min="1"
              placeholder={amountDefault ? String(amountDefault) : undefined} error={errors.amount?.message} {...register('amount')}
            />
            <DateInput label={t('proof.paidOn')} required max={todayISO()} error={errors.paidOn?.message} {...register('paidOn')} />
          </div>
          <Controller
            control={control} name="kind"
            render={({ field }) => (
              <RadioCards
                name="kind" label={t('proof.paidFor')} value={field.value} columns={2}
                onChange={(v) => { field.onChange(v); if (v === 'SUBSCRIPTION' && amountDefault) setValue('amount', String(amountDefault)); }}
                options={[
                  { value: 'SUBSCRIPTION', label: sub.data?.periodLabel ?? t('proof.subscription') },
                  { value: 'DONATION', label: t('proof.donation') },
                ]}
              />
            )}
          />
          {kind === 'DONATION' ? <Input label={t('proof.note')} maxLength={200} placeholder={t('proof.notePlaceholder')} {...register('purpose')} /> : null}
        </Card>
        <Button type="submit" size="lg" fullWidth loading={submit.isPending}>{t('proof.submit')}</Button>
        <p className="flex items-start gap-2 text-sm text-muted"><Clock size={16} className="mt-0.5 shrink-0" aria-hidden />{t('proof.note2')}</p>
      </form>
    </div>
  );
}
