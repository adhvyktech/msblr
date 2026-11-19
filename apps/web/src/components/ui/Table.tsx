import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { Skeleton } from './States';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render?: (row: T) => ReactNode;
  sortable?: boolean;
  className?: string;
  /** hide below the lg breakpoint */
  hideOnMobile?: boolean;
  align?: 'left' | 'right' | 'center';
}
export interface SortState { key: string; dir: 'asc' | 'desc' }

export function Table<T>({ columns, rows, rowKey, sort, onSort, loading, emptyText, onRowClick, caption, className }: {
  columns: Column<T>[]; rows: T[]; rowKey: (r: T) => string | number; sort?: SortState | null; onSort?: (s: SortState) => void;
  loading?: boolean; emptyText?: ReactNode; onRowClick?: (r: T) => void; caption?: string; className?: string;
}) {
  const { t } = useTranslation('common');
  const next = (key: string) => onSort?.({ key, dir: sort?.key === key && sort.dir === 'asc' ? 'desc' : 'asc' });
  return (
    <div className={cn('overflow-x-auto rounded-theme border border-line bg-surface', className)}>
      <table className="w-full border-collapse text-left text-[15px]">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((c) => {
              const active = sort?.key === c.key;
              return (
                <th
                  key={c.key} scope="col" aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  className={cn('border-b border-line bg-bg px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted', c.hideOnMobile && 'hidden lg:table-cell',
                    c.align === 'right' && 'text-right', c.align === 'center' && 'text-center', c.className)}
                >
                  {c.sortable ? (
                    <button type="button" onClick={() => next(c.key)} className="inline-flex min-h-[32px] items-center gap-1 uppercase hover:text-ink">
                      {c.header}
                      {active ? (sort!.dir === 'asc' ? <ArrowUp size={14} aria-hidden /> : <ArrowDown size={14} aria-hidden />) : <ChevronsUpDown size={14} aria-hidden className="opacity-50" />}
                    </button>
                  ) : c.header}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: 5 }).map((_, i) => (
                <tr key={`s${i}`}>{columns.map((c) => <td key={c.key} className={cn('border-b border-line px-3 py-3', c.hideOnMobile && 'hidden lg:table-cell')}><Skeleton className="h-4 w-full" /></td>)}</tr>
              ))
            : rows.length === 0
              ? <tr><td colSpan={columns.length} className="px-3 py-10 text-center text-muted">{emptyText ?? t('table.rowsEmpty')}</td></tr>
              : rows.map((r) => (
                  <tr
                    key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined}
                    className={cn('border-b border-line last:border-0', onRowClick && 'cursor-pointer hover:bg-accent-soft/60')}
                  >
                    {columns.map((c) => (
                      <td key={c.key} className={cn('px-3 py-3 align-middle', c.hideOnMobile && 'hidden lg:table-cell', c.align === 'right' && 'text-right', c.align === 'center' && 'text-center', c.className)}>
                        {c.render ? c.render(r) : String((r as Record<string, unknown>)[c.key] ?? '—')}
                      </td>
                    ))}
                  </tr>
                ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPage, className }: { page: number; pageSize: number; total: number; onPage: (p: number) => void; className?: string }) {
  const { t } = useTranslation('common');
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return total ? <p className={cn('text-sm text-muted', className)}>{t('table.total', { count: total })}</p> : null;
  const btn = 'inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-theme-sm border border-line bg-surface px-3 font-semibold hover:bg-ink/5 disabled:opacity-40';
  return (
    <nav aria-label="Pagination" className={cn('flex flex-wrap items-center justify-between gap-3', className)}>
      <p className="text-sm text-muted">{t('table.total', { count: total })} · {t('table.page', { page, pages })}</p>
      <div className="flex gap-2">
        <button type="button" className={btn} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label={t('table.prev')}><ChevronLeft size={18} aria-hidden /><span className="hidden sm:inline">{t('table.prev')}</span></button>
        <button type="button" className={btn} disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label={t('table.next')}><span className="hidden sm:inline">{t('table.next')}</span><ChevronRight size={18} aria-hidden /></button>
      </div>
    </nav>
  );
}
