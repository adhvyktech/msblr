import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { UploadedFile } from '@/lib/api';
import { useT } from '@/lib/useT';
import { Button, FileUpload, Input, Select, Textarea } from '@/components/ui';
import { catName, useCategories, useSaveBusiness, type Business } from '../api';
import { MultiUpload } from './MultiUpload';

const phoneRe = /^\+?\d[\d\s-]{5,17}$/;
const blank = (v: string | undefined) => (v ?? '').trim();

function schemaFor(msg: Record<'name' | 'phone' | 'url' | 'category', string>) {
  return z.object({
    name: z.string().trim().min(2, msg.name).max(120),
    categoryId: z.string().min(1, msg.category),
    description: z.string().max(2000).optional(),
    addressLine: z.string().max(300).optional(),
    area: z.string().max(80).optional(),
    phone: z.string().refine((v) => phoneRe.test(blank(v)), { message: msg.phone }),
    whatsapp: z.string().refine((v) => blank(v) === '' || phoneRe.test(blank(v)), { message: msg.phone }),
    website: z.string().refine((v) => blank(v) === '' || /^https?:\/\/\S+$/i.test(blank(v)), { message: msg.url }),
    mapsUrl: z.string().refine((v) => blank(v) === '' || /^https?:\/\/\S+$/i.test(blank(v)), { message: msg.url }),
  });
}

const asFile = (id: number, url?: string): UploadedFile => ({ id, url: url ?? `/files/${id}`, mime: 'image/jpeg' });

export function BusinessForm({ initial, onDone, onCancel }: { initial?: Business; onDone: () => void; onCancel: () => void }) {
  const { t, lang } = useT('business');
  const cats = useCategories();
  const save = useSaveBusiness(initial ? t('form.updated') : t('form.created'));
  const [logo, setLogo] = useState<UploadedFile | null>(initial?.logoFileId ? asFile(initial.logoFileId, initial.logoUrl ?? undefined) : null);
  const [photos, setPhotos] = useState<UploadedFile[]>((initial?.photoFileIds ?? []).map((id, i) => asFile(id, initial?.photoUrls[i])));
  const schema = useMemo(() => schemaFor({ name: t('form.errors.name'), phone: t('form.errors.phone'), url: t('form.errors.url'), category: t('form.errors.category') }), [t]);
  type V = z.infer<typeof schema>;
  const { register, handleSubmit, formState: { errors } } = useForm<V>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initial?.name ?? '', categoryId: initial?.categoryId ? String(initial.categoryId) : '', description: initial?.description ?? '',
      addressLine: initial?.addressLine ?? '', area: initial?.area ?? '', phone: initial?.phone ?? '', whatsapp: initial?.whatsapp ?? '',
      website: initial?.website ?? '', mapsUrl: initial?.mapsUrl ?? '',
    },
  });
  const orNull = (v?: string) => (blank(v) ? blank(v) : null);
  const submit = handleSubmit((v) =>
    save.mutate(
      {
        id: initial?.id,
        data: {
          name: v.name.trim(), categoryId: Number(v.categoryId), description: orNull(v.description), addressLine: orNull(v.addressLine), area: orNull(v.area),
          phone: orNull(v.phone), whatsapp: orNull(v.whatsapp), website: orNull(v.website), mapsUrl: orNull(v.mapsUrl),
          logoFileId: logo?.id ?? null, photoFileIds: photos.map((p) => p.id),
        },
      },
      { onSuccess: onDone },
    ),
  );

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <Input label={t('form.name')} required error={errors.name?.message} {...register('name')} />
      <Select
        label={t('form.category')} required error={errors.categoryId?.message} placeholder={t('form.chooseCategory')}
        options={(cats.data ?? []).map((c) => ({ value: c.id, label: catName(c, lang) }))} {...register('categoryId')}
      />
      <Textarea label={t('form.description')} rows={3} hint={t('form.descriptionHint')} {...register('description')} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label={t('form.address')} {...register('addressLine')} />
        <Input label={t('form.area')} hint={t('form.areaHint')} {...register('area')} />
        <Input label={t('form.phone')} required type="tel" inputMode="tel" error={errors.phone?.message} {...register('phone')} />
        <Input label={t('form.whatsapp')} type="tel" inputMode="tel" error={errors.whatsapp?.message} hint={t('form.whatsappHint')} {...register('whatsapp')} />
        <Input label={t('form.website')} type="url" inputMode="url" placeholder="https://" error={errors.website?.message} {...register('website')} />
        <Input label={t('form.mapsUrl')} type="url" inputMode="url" placeholder="https://maps.google.com/…" error={errors.mapsUrl?.message} hint={t('form.mapsHint')} {...register('mapsUrl')} />
      </div>
      <FileUpload kind="business_photo" visibility="MEMBERS" accept="image/jpeg,image/png,image/webp" maxMb={5} label={t('form.logo')} value={logo} onChange={setLogo} />
      <MultiUpload kind="business_photo" max={6} label={t('form.photos')} hint={t('form.photosHint')} value={photos} onChange={setPhotos} />
      {initial?.status === 'APPROVED' ? null : <p className="rounded-theme-sm bg-info-soft p-3 text-sm text-info">{t('form.approvalNote')}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={save.isPending}>{t('form.cancel')}</Button>
        <Button type="submit" loading={save.isPending}>{initial ? t('form.saveChanges') : t('form.submit')}</Button>
      </div>
    </form>
  );
}
