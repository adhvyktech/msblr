import { useRef, useState, type DragEvent, type ImgHTMLAttributes, type ReactNode } from 'react';
import { FileText, ImageOff, Trash2, UploadCloud } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { api, fileSrc, type UploadedFile } from '@/lib/api';
import { Spinner } from './States';

export interface FileUploadProps {
  /** File kind per API (photo | document | payment_proof | ad_creative | banner | highlight | trust_doc | logo | business_photo) */
  kind: string;
  visibility?: 'PUBLIC' | 'MEMBERS' | 'PRIVATE';
  value?: UploadedFile | null;
  onChange: (f: UploadedFile | null) => void;
  label?: ReactNode;
  hint?: ReactNode;
  required?: boolean;
  accept?: string;
  maxMb?: number;
  error?: string;
  className?: string;
  disabled?: boolean;
}

/** Drag/drop + tap upload with preview and progress. Calls POST /api/files; value is {id,url}. */
export function FileUpload({ kind, visibility = 'PRIVATE', value, onChange, label, hint, required, accept = 'image/jpeg,image/png,image/webp,application/pdf', maxMb = 10, error, className, disabled }: FileUploadProps) {
  const { t } = useTranslation('common');
  const input = useRef<HTMLInputElement>(null);
  const [pct, setPct] = useState<number | null>(null);
  const [localErr, setLocalErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; isImage: boolean; name: string } | null>(null);
  const [over, setOver] = useState(false);

  async function handle(file: File | undefined) {
    if (!file) return;
    setLocalErr(null);
    if (file.size > maxMb * 1024 * 1024) { setLocalErr(`Maximum size is ${maxMb} MB`); return; }
    const isImage = file.type.startsWith('image/');
    setPreview({ url: isImage ? URL.createObjectURL(file) : '', isImage, name: file.name });
    setPct(0);
    try {
      const up = await api.upload(file, { kind, visibility, onProgress: setPct });
      onChange(up);
    } catch (e) {
      setPreview(null);
      setLocalErr((e as Error).message);
    } finally {
      setPct(null);
      if (input.current) input.current.value = '';
    }
  }
  const drop = (e: DragEvent) => { e.preventDefault(); setOver(false); if (!disabled) void handle(e.dataTransfer.files[0]); };
  const shown = value ? preview ?? { url: value.mime?.startsWith('image/') || !value.mime ? fileSrc(value.url) ?? '' : '', isImage: value.mime?.startsWith('image/') ?? true, name: `#${value.id}` } : null;
  const err = error ?? localErr;
  const uploading = pct !== null;

  return (
    <div className={className}>
      {label ? <div className="mb-1.5 text-sm font-semibold text-ink/80">{label}{required ? <span className="ml-0.5 text-danger" aria-hidden>*</span> : null}</div> : null}
      {shown && !uploading ? (
        <div className="flex items-center gap-3 rounded-theme-sm border-[1.5px] border-line bg-surface p-3">
          {shown.isImage && shown.url ? <img src={shown.url} alt="" className="h-16 w-16 rounded-lg object-cover" /> : <span className="grid h-16 w-16 place-items-center rounded-lg bg-accent-soft text-accent"><FileText size={26} aria-hidden /></span>}
          <div className="min-w-0 flex-1"><p className="truncate font-medium">{shown.name}</p><p className="text-sm text-success">{t('forms.uploaded')}</p></div>
          <button type="button" disabled={disabled} onClick={() => { onChange(null); setPreview(null); }} aria-label={t('actions.remove')} className="grid h-11 w-11 place-items-center rounded-full text-danger hover:bg-danger-soft"><Trash2 size={20} aria-hidden /></button>
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); if (!disabled) setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop}
          className={cn('relative rounded-theme-sm border-2 border-dashed transition-colors', over ? 'border-primary bg-accent-soft' : error || localErr ? 'border-danger' : 'border-line bg-surface')}
        >
          <button type="button" disabled={disabled || uploading} onClick={() => input.current?.click()} className="flex min-h-[112px] w-full flex-col items-center justify-center gap-1.5 px-4 py-5 text-center disabled:opacity-60">
            {uploading ? <><Spinner size={26} className="text-primary" /><span className="font-medium">{t('forms.uploading')} {pct}%</span>
              <span className="h-1.5 w-40 overflow-hidden rounded-full bg-ink/10"><span className="block h-full bg-primary transition-all" style={{ width: `${pct}%` }} /></span></>
              : <><UploadCloud size={28} className="text-primary" aria-hidden /><span className="font-semibold">{t('forms.chooseFile')}</span><span className="text-sm text-muted">{t('forms.dragDrop')}</span></>}
          </button>
          <input ref={input} type="file" accept={accept} className="sr-only" tabIndex={-1} onChange={(e) => void handle(e.target.files?.[0])} />
        </div>
      )}
      {err ? <p role="alert" className="mt-1.5 text-sm text-danger">{err}</p> : hint ? <p className="mt-1.5 text-sm text-muted">{hint}</p> : null}
    </div>
  );
}

/** <img> that adds the access token for /files/:id URLs and shows a neutral placeholder on error. */
export function ImageWithFallback({ src, alt, className, fallbackClassName, ...rest }: ImgHTMLAttributes<HTMLImageElement> & { src?: string | null; alt: string; fallbackClassName?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return <div role="img" aria-label={alt} className={cn('grid place-items-center bg-accent-soft text-accent', className, fallbackClassName)}><ImageOff size={24} aria-hidden /></div>;
  }
  return <img src={fileSrc(src)} alt={alt} className={className} loading="lazy" onError={() => setFailed(true)} {...rest} />;
}
