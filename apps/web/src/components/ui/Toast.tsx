import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';

type Tone = 'success' | 'error' | 'info';
interface ToastItem { id: number; tone: Tone; message: string }
interface ToastApi {
  success: (m: string) => void;
  error: (m: string) => void;
  info: (m: string) => void;
}
const Ctx = createContext<ToastApi | null>(null);

/** const toast = useToast(); toast.success('Saved'); toast.error(err.message) */
export function useToast(): ToastApi {
  const c = useContext(Ctx);
  if (!c) throw new Error('useToast must be used inside <ToastProvider>');
  return c;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation('common');
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const dismiss = useCallback((id: number) => setItems((l) => l.filter((x) => x.id !== id)), []);
  const push = useCallback((tone: Tone, message: string) => {
    const id = ++seq.current;
    setItems((l) => [...l.slice(-3), { id, tone, message }]);
    setTimeout(() => dismiss(id), tone === 'error' ? 6000 : 3500);
  }, [dismiss]);
  const api = useMemo<ToastApi>(() => ({ success: (m) => push('success', m), error: (m) => push('error', m), info: (m) => push('info', m) }), [push]);
  const icon = { success: CheckCircle2, error: AlertCircle, info: Info };
  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[100] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:items-end lg:pr-6" aria-live="polite" aria-atomic="false">
        {items.map((i) => {
          const Icon = icon[i.tone];
          return (
            <div
              key={i.id} role={i.tone === 'error' ? 'alert' : 'status'}
              className={cn('pointer-events-auto flex w-full max-w-sm animate-[pop-in_.2s] items-start gap-3 rounded-theme-sm border bg-surface p-3.5 shadow-pop',
                i.tone === 'success' && 'border-success/40', i.tone === 'error' && 'border-danger/50', i.tone === 'info' && 'border-info/40')}
            >
              <Icon size={20} className={cn('mt-0.5 shrink-0', i.tone === 'success' && 'text-success', i.tone === 'error' && 'text-danger', i.tone === 'info' && 'text-info')} aria-hidden />
              <p className="flex-1 text-[15px]">{i.message}</p>
              <button type="button" onClick={() => dismiss(i.id)} aria-label={t('actions.close')} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted hover:bg-ink/5"><X size={16} aria-hidden /></button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}
