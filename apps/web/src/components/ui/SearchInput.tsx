import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';

/** Debounced search box. onSearch fires `delay` ms after typing stops (and on Enter / clear). */
export function SearchInput({ value, onSearch, placeholder, delay = 350, className, rounded = false, autoFocus, 'aria-label': ariaLabel }: {
  value?: string; onSearch: (q: string) => void; placeholder?: string; delay?: number; className?: string; rounded?: boolean; autoFocus?: boolean; 'aria-label'?: string;
}) {
  const { t } = useTranslation('common');
  const [text, setText] = useState(value ?? '');
  const last = useRef(value ?? '');
  useEffect(() => { if (value !== undefined && value !== last.current) { setText(value); last.current = value; } }, [value]);
  useEffect(() => {
    if (text === last.current) return;
    const id = setTimeout(() => { last.current = text; onSearch(text.trim()); }, delay);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, delay]);
  const fire = (q: string) => { last.current = q; onSearch(q.trim()); };
  return (
    <form
      role="search" onSubmit={(e) => { e.preventDefault(); fire(text); }}
      className={cn('relative flex min-h-[48px] items-center border-[1.5px] border-line bg-surface focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/25', rounded ? 'rounded-full' : 'rounded-theme-sm', className)}
    >
      <Search size={18} className="pointer-events-none ml-3.5 shrink-0 text-muted" aria-hidden />
      <input
        type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder ?? t('actions.search')} autoFocus={autoFocus}
        aria-label={ariaLabel ?? placeholder ?? t('actions.search')} enterKeyHint="search"
        className="min-w-0 flex-1 bg-transparent px-3 py-2 text-base text-ink placeholder:text-muted/70 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      {text ? (
        <button type="button" aria-label={t('actions.clear')} onClick={() => { setText(''); fire(''); }} className="mr-1.5 grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-ink/5">
          <X size={18} aria-hidden />
        </button>
      ) : null}
    </form>
  );
}
