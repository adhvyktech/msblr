import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { Button, IconButton } from './Button';

const FOCUSABLE = 'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])';

/** Shared behaviour: Esc to close, body scroll lock, focus trap, restore focus. */
function useOverlay(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>('[data-autofocus]') ?? el?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? el)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
      if (e.key !== 'Tab' || !el) return;
      const f = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null);
      if (!f.length) return;
      const a = f[0]!, z = f[f.length - 1]!;
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; prev?.focus?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return ref;
}

export function Modal({ open, onClose, title, children, footer, size = 'md', dismissible = true }: {
  open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg'; dismissible?: boolean;
}) {
  const { t } = useTranslation('common');
  const ref = useOverlay(open, () => dismissible && onClose());
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 animate-[fade-in_.15s] bg-black/50" onClick={dismissible ? onClose : undefined} aria-hidden />
      <div
        ref={ref} role="dialog" aria-modal="true" tabIndex={-1}
        className={cn('relative flex max-h-[92vh] w-full animate-[pop-in_.18s] flex-col rounded-t-3xl bg-surface shadow-pop sm:rounded-theme',
          size === 'sm' && 'sm:max-w-sm', size === 'md' && 'sm:max-w-lg', size === 'lg' && 'sm:max-w-3xl')}
      >
        {title ? (
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
            <h2 className="text-lg">{title}</h2>
            {dismissible ? <IconButton icon={X} label={t('actions.close')} size="sm" onClick={onClose} /> : null}
          </div>
        ) : null}
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({ open, onClose, title, children, side = 'left', width = 288 }: {
  open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; side?: 'left' | 'right'; width?: number;
}) {
  const { t } = useTranslation('common');
  const ref = useOverlay(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[70]">
      <div className="absolute inset-0 animate-[fade-in_.15s] bg-black/50" onClick={onClose} aria-hidden />
      <div
        ref={ref} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} tabIndex={-1}
        style={{ width: `min(${width}px, 86vw)` }}
        className={cn('absolute top-0 flex h-full flex-col bg-surface shadow-pop', side === 'left' ? 'left-0 animate-[slide-left_.2s]' : 'right-0 animate-[slide-right_.2s]')}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="font-head text-lg">{title}</div>
          <IconButton icon={X} label={t('actions.close')} size="sm" onClick={onClose} />
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel, cancelLabel, danger, loading }: {
  open: boolean; onClose: () => void; onConfirm: () => void; title: ReactNode; message?: ReactNode;
  confirmLabel?: string; cancelLabel?: string; danger?: boolean; loading?: boolean;
}) {
  const { t } = useTranslation('common');
  return (
    <Modal
      open={open} onClose={onClose} title={title} size="sm"
      footer={<>
        <Button variant="ghost" onClick={onClose} disabled={loading}>{cancelLabel ?? t('actions.cancel')}</Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading} data-autofocus>{confirmLabel ?? t('actions.confirm')}</Button>
      </>}
    >
      {message ? <div className="text-base text-ink/80">{message}</div> : null}
    </Modal>
  );
}
