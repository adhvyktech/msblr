import { useEffect, useMemo, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Button, ChipGroup, DateInput, FileUpload, Input, Modal, PhoneInput, Select } from '@/components/ui';
import type { UploadedFile } from '@/lib/api';
import { RELATIONS } from '@/features/members/api';

export interface PersonValues {
  name: string; relation: string; gender: string; dob: string; anniversary: string; mobile: string; email: string; education: string; occupation: string;
  photo: UploadedFile | null;
}
export const emptyPerson = (relation = ''): PersonValues => ({ name: '', relation, gender: '', dob: '', anniversary: '', mobile: '', email: '', education: '', occupation: '', photo: null });

export const relationKey = (r?: string | null) => `relations.${r ?? 'OTHER'}`;

/** Add/edit family member form in a modal (design: addFamPhone). Used by My family and by Registration step 2. */
export function PersonFormModal({ open, onClose, initial, onSubmit, title, isHead, dobRequired = true }: {
  open: boolean; onClose: () => void; initial: PersonValues; title: string; isHead?: boolean; dobRequired?: boolean;
  onSubmit: (v: PersonValues) => Promise<void>;
}) {
  const { t } = useTranslation('family');
  const { t: tc } = useTranslation('common');
  const [serverError, setServerError] = useState<string | null>(null);
  const schema = useMemo(() => z.object({
    name: z.string().trim().min(2, t('form.errName')),
    relation: isHead ? z.string() : z.string().min(1, t('form.errRelation')),
    gender: z.string(),
    dob: dobRequired ? z.string().min(1, t('form.errDob')) : z.string(),
    anniversary: z.string(),
    mobile: z.string().refine((v) => v === '' || /^[6-9]\d{9}$/.test(v), t('form.errMobile')),
    email: z.string().refine((v) => v === '' || /^\S+@\S+\.\S+$/.test(v), t('form.errEmail')),
    education: z.string(),
    occupation: z.string(),
    photo: z.custom<UploadedFile | null>(),
  }), [t, isHead, dobRequired]);
  const { register, handleSubmit, control, reset, formState: { errors, isSubmitting } } = useForm<PersonValues>({ resolver: zodResolver(schema), defaultValues: initial });
  useEffect(() => { if (open) { reset(initial); setServerError(null); } }, [open, initial, reset]);

  const submit = handleSubmit(async (v) => {
    setServerError(null);
    try { await onSubmit(v); } catch (e) { setServerError((e as Error).message); }
  });
  const today = new Date().toISOString().slice(0, 10);

  return (
    <Modal
      open={open} onClose={onClose} title={title} size="md" dismissible={!isSubmitting}
      footer={<>
        <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>{tc('actions.cancel')}</Button>
        <Button onClick={submit} loading={isSubmitting}>{t('form.save')}</Button>
      </>}
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Controller control={control} name="photo" render={({ field }) => (
          <FileUpload kind="photo" visibility="MEMBERS" accept="image/jpeg,image/png,image/webp" maxMb={5} label={t('form.photo')} hint={t('form.photoHint')} value={field.value} onChange={field.onChange} />
        )} />
        <Input label={t('form.name')} required autoComplete="off" error={errors.name?.message} {...register('name')} />
        {isHead ? null : (
          <Controller control={control} name="relation" render={({ field }) => (
            <div>
              <p className="mb-1.5 text-sm font-semibold text-ink/80">{t('form.relation')}<span className="ml-0.5 text-danger" aria-hidden>*</span></p>
              <ChipGroup label={t('form.relation')} value={field.value} onChange={field.onChange} options={RELATIONS.map((r) => ({ value: r as string, label: t(relationKey(r)) }))} />
              {errors.relation ? <p role="alert" className="mt-1.5 text-sm text-danger">{errors.relation.message}</p> : null}
            </div>
          )} />
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <DateInput label={t('form.dob')} required={dobRequired} max={today} error={errors.dob?.message} {...register('dob')} />
          <DateInput label={t('form.anniversary')} max={today} {...register('anniversary')} />
        </div>
        <Controller control={control} name="mobile" render={({ field }) => (
          <PhoneInput label={t('form.mobile')} hint={t('form.mobileHint')} error={errors.mobile?.message} value={field.value} onChange={field.onChange} onBlur={field.onBlur} />
        )} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label={t('form.gender')} placeholder={t('form.select')} options={[{ value: 'MALE', label: t('form.male') }, { value: 'FEMALE', label: t('form.female') }, { value: 'OTHER', label: t('form.other') }]} {...register('gender')} />
          <Input label={t('form.email')} type="email" error={errors.email?.message} {...register('email')} />
          <Input label={t('form.education')} {...register('education')} />
          <Input label={t('form.occupation')} {...register('occupation')} />
        </div>
        {serverError ? <p role="alert" className="rounded-theme-sm bg-danger-soft p-3 text-sm text-danger">{serverError}</p> : null}
      </form>
    </Modal>
  );
}

/** Convert form values to the API body (blank -> null so edits can clear fields). */
export function personPayload(v: PersonValues, o: { isHead?: boolean } = {}) {
  const n = (s: string) => (s.trim() === '' ? null : s.trim());
  return {
    name: v.name.trim(),
    ...(o.isHead ? {} : { relation: v.relation }),
    gender: n(v.gender), dob: n(v.dob), anniversary: n(v.anniversary), mobile: n(v.mobile), email: n(v.email),
    education: n(v.education), occupation: n(v.occupation), photoFileId: v.photo?.id ?? null,
  };
}
