import { useRef, useState, type ReactNode } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api, fileSrc, type UploadedFile } from '@/lib/api';
import { Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';

/** Several photos in one go (tap to choose many). Uploads one by one through POST /api/files and shows thumbnails. */
export function MultiUpload({ kind, visibility = 'MEMBERS', value, onChange, max, label, hint, accept = 'image/jpeg,image/png,image/webp', maxMb = 5, className }: {
  kind: string; visibility?: 'PUBLIC' | 'MEMBERS' | 'PRIVATE'; value: UploadedFile[]; onChange: (v: UploadedFile[]) => void; max: number;
  label?: ReactNode; hint?: ReactNode; accept?: string; maxMb?: number; className?: string;
}) {
  const { t } = useTranslation('common');
  const { t: tb } = useTranslation('business');
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setErr(null);
    const room = max - value.length;
    const list = Array.from(files).slice(0, Math.max(0, room));
    if (files.length > room) setErr(tb('upload.max', { n: max }));
    const done: UploadedFile[] = [];
    setBusy(list.length);
    for (const f of list) {
      if (f.size > maxMb * 1024 * 1024) { setErr(`${f.name}: ${tb('upload.size', { mb: maxMb })}`); setBusy((n) => n - 1); continue; }
      try {
        done.push(await api.upload(f, { kind, visibility }));
      } catch (e) {
        setErr((e as Error).message);
      }
      setBusy((n) => n - 1);
    }
    if (done.length) onChange([...value, ...done]);
    if (input.current) input.current.value = '';
  }

  return (
    <div className={className}>
      {label ? <div className="mb-1.5 text-sm font-semibold text-ink/80">{label}</div> : null}
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {value.map((f) => (
          <li key={f.id} className="relative aspect-square overflow-hidden rounded-theme-sm border border-line bg-accent-soft">
            {f.mime?.startsWith('video/')
              ? <video src={fileSrc(f.url)} className="h-full w-full object-cover" muted />
              : <img src={fileSrc(f.url)} alt="" className="h-full w-full object-cover" />}
            <button
              type="button" aria-label={t('actions.remove')} onClick={() => onChange(value.filter((x) => x.id !== f.id))}
              className="absolute right-1 top-1 grid h-9 w-9 place-items-center rounded-full bg-black/60 text-white hover:bg-danger"
            ><Trash2 size={16} aria-hidden /></button>
          </li>
        ))}
        {Array.from({ length: busy }).map((_, i) => (
          <li key={`b${i}`} className="grid aspect-square place-items-center rounded-theme-sm border border-dashed border-line bg-surface"><Spinner size={22} className="text-primary" /></li>
        ))}
        {value.length + busy < max ? (
          <li>
            <button
              type="button" onClick={() => input.current?.click()}
              className={cn('flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-theme-sm border-2 border-dashed border-line bg-surface px-1 text-center text-sm font-semibold text-primary hover:border-primary')}
            >
              <ImagePlus size={24} aria-hidden />
              <span>{t('actions.add')}</span>
            </button>
          </li>
        ) : null}
      </ul>
      <input ref={input} type="file" multiple accept={accept} className="sr-only" tabIndex={-1} onChange={(e) => void add(e.target.files)} />
      {err ? <p role="alert" className="mt-1.5 text-sm text-danger">{err}</p> : hint ? <p className="mt-1.5 text-sm text-muted">{hint}</p> : null}
    </div>
  );
}
