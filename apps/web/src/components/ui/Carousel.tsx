import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { fileSrc } from '@/lib/api';

export interface CarouselItem {
  id: string | number;
  kind?: 'image' | 'video' | 'gradient';
  src?: string | null;
  kicker?: string;
  title?: string;
  subtitle?: string;
  href?: string;
  /** auto-advance delay for this slide (images); videos advance when they end */
  durationMs?: number;
  /** shows the "AD" tag */
  ad?: boolean;
  /** full custom slide content (overrides default text overlay) */
  content?: ReactNode;
}

/** Auto-advancing banner → ad → video carousel. Pauses on hover/focus, dots, prev/next, reduced-motion aware. */
export function Carousel({ items, className, height = 220, autoPlay = true, label = 'Highlights' }: {
  items: CarouselItem[]; className?: string; height?: number | string; autoPlay?: boolean; label?: string;
}) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const n = items.length;
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const go = useCallback((d: number) => setI((x) => (n ? (x + d + n) % n : 0)), [n]);

  useEffect(() => { if (i >= n) setI(0); }, [n, i]);
  useEffect(() => {
    if (!autoPlay || paused || n < 2 || reduce) return;
    const cur = items[i];
    if (cur?.kind === 'video') return; // advances onEnded
    timer.current = setTimeout(() => go(1), cur?.durationMs ?? 6000);
    return () => clearTimeout(timer.current);
  }, [i, paused, n, autoPlay, items, go, reduce]);

  if (!n) return null;
  return (
    <div
      className={cn('relative overflow-hidden rounded-theme bg-primary text-white', className)} style={{ height }}
      role="region" aria-roledescription="carousel" aria-label={label}
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}
    >
      {items.map((it, idx) => {
        const active = idx === i;
        const body = (
          <>
            {it.kind === 'video' && it.src ? (
              <video src={fileSrc(it.src)} className="absolute inset-0 h-full w-full object-cover" muted playsInline autoPlay={active} loop={n < 2} onEnded={() => go(1)} aria-hidden />
            ) : it.src ? (
              <img src={fileSrc(it.src)} alt="" className="absolute inset-0 h-full w-full object-cover" loading={idx === 0 ? 'eager' : 'lazy'} />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary-2 to-accent" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
            {it.ad ? <span className="absolute right-2 top-2 z-10 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold tracking-wider">AD</span> : null}
            {it.content ?? (
              <div className="absolute inset-x-5 bottom-5 pr-16">
                {it.kicker ? <div className="text-[11px] font-bold uppercase tracking-[0.12em] opacity-90">{it.kicker}</div> : null}
                {it.title ? <div className="font-head text-xl leading-tight sm:text-2xl" style={{ fontWeight: 'var(--hw)' }}>{it.title}</div> : null}
                {it.subtitle ? <div className="mt-0.5 text-sm opacity-90">{it.subtitle}</div> : null}
              </div>
            )}
          </>
        );
        const cls = cn('absolute inset-0 transition-opacity duration-500', active ? 'opacity-100' : 'pointer-events-none opacity-0');
        return it.href ? (
          <Link key={it.id} to={it.href} className={cls} aria-hidden={!active} tabIndex={active ? 0 : -1}>{body}</Link>
        ) : (
          <div key={it.id} className={cls} aria-hidden={!active} aria-roledescription="slide">{body}</div>
        );
      })}
      {n > 1 ? (
        <>
          <button type="button" aria-label="Previous slide" onClick={() => go(-1)} className="absolute left-2 top-1/2 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/35 text-white hover:bg-black/55 sm:grid"><ChevronLeft size={20} aria-hidden /></button>
          <button type="button" aria-label="Next slide" onClick={() => go(1)} className="absolute right-2 top-1/2 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/35 text-white hover:bg-black/55 sm:grid"><ChevronRight size={20} aria-hidden /></button>
          <div className="absolute bottom-3.5 right-4 flex gap-1.5">
            {items.map((it, idx) => (
              <button key={it.id} type="button" aria-label={`Go to slide ${idx + 1}`} aria-current={idx === i} onClick={() => setI(idx)} className="grid h-6 place-items-center">
                <span className={cn('block h-[7px] rounded-full bg-white transition-all', idx === i ? 'w-5' : 'w-[7px] opacity-55')} />
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
