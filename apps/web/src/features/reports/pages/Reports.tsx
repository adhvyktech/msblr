import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BadgeIndianRupee, Building2, CalendarDays, FileSpreadsheet, FileText, History, Megaphone, Repeat, Sheet, Smartphone, UserPlus, Users, type LucideIcon } from 'lucide-react';
import { Button, Card, EmptyState, ErrorState, Input, PageHeader, Table, useToast, type Column } from '@/components/ui';
import { api, downloadFile } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/useT';
import { fmtNumber } from '@/lib/format';

const TYPES: { id: string; icon: LucideIcon; period: 'range' | 'month' }[] = [
  { id: 'members', icon: Users, period: 'range' },
  { id: 'subscriptions', icon: Repeat, period: 'range' },
  { id: 'receipts', icon: BadgeIndianRupee, period: 'range' },
  { id: 'registrations', icon: UserPlus, period: 'range' },
  { id: 'businesses', icon: Building2, period: 'range' },
  { id: 'events', icon: CalendarDays, period: 'range' },
  { id: 'ads', icon: Megaphone, period: 'range' },
  { id: 'usage', icon: Smartphone, period: 'range' },
  { id: 'monthly-changes', icon: History, period: 'month' },
];
const NO_DATE = new Set(['subscriptions']);

interface ReportData {
  type: string;
  title: string;
  columns: { key: string; header: string; num?: boolean }[];
  rows: Record<string, string | number | null>[];
  totals: Record<string, string | number>;
}
type Row = Record<string, string | number | null> & { __total?: boolean };

const thisMonth = () => new Date().toISOString().slice(0, 7);

export default function Reports() {
  const { t } = useT('reports');
  const toast = useToast();
  const [type, setType] = useState<string | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [month, setMonth] = useState(thisMonth());
  const [busy, setBusy] = useState<string | null>(null);
  const def = TYPES.find((x) => x.id === type);

  const params: Record<string, string> = def?.period === 'month' ? { month } : NO_DATE.has(type ?? '') ? {} : { from, to };
  const q = useQuery({
    enabled: !!type,
    queryKey: ['report', type, params],
    queryFn: () => api.get<ReportData>(`/api/reports/${type}`, { params }),
  });

  async function exportAs(format: 'xlsx' | 'csv' | 'pdf') {
    setBusy(format);
    try {
      const qs = new URLSearchParams({ format });
      for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
      await downloadFile(`/api/reports/${type}?${qs.toString()}`, `${type}.${format}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const cols: Column<Row>[] = (q.data?.columns ?? []).map((c) => ({
    key: c.key,
    header: t(`cols.${c.key}`, { defaultValue: c.header }),
    align: c.num ? 'right' : 'left',
    render: (r) => {
      const v = r[c.key];
      const shown = typeof v === 'number' ? fmtNumber(v) : v === null || v === undefined || v === '' ? '—' : String(v);
      return r.__total ? <strong>{shown}</strong> : <>{shown}</>;
    },
  }));
  const rows: Row[] = q.data ? [...q.data.rows, ...(Object.keys(q.data.totals).length ? [{ ...q.data.totals, __total: true } as Row] : [])] : [];

  return (
    <div>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" role="group" aria-label={t('pick')}>
        {TYPES.map((x) => {
          const on = x.id === type;
          return (
            <button
              key={x.id} type="button" aria-pressed={on} onClick={() => setType(x.id)}
              className={cn('flex min-h-[88px] flex-col items-start gap-2 rounded-theme border-2 p-3 text-left transition-colors sm:p-4', on ? 'border-primary bg-accent-soft' : 'border-line bg-surface hover:border-primary/40')}
            >
              <x.icon size={22} className="text-primary" aria-hidden />
              <span className="font-semibold leading-tight">{t(`types.${x.id}.name`)}</span>
              <span className="hidden text-xs text-muted sm:block">{t(`types.${x.id}.desc`)}</span>
            </button>
          );
        })}
      </div>

      {!type ? (
        <div className="mt-6"><EmptyState icon={FileText} title={t('chooseTitle')} description={t('chooseBody')} /></div>
      ) : (
        <Card className="mt-6">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-wrap items-end gap-3">
              {def?.period === 'month' ? (
                <Input type="month" label={t('month')} value={month} max={thisMonth()} onChange={(e) => e.target.value && setMonth(e.target.value)} wrapperClassName="w-44" />
              ) : NO_DATE.has(type) ? (
                <p className="text-sm text-muted">{t('currentSnapshot')}</p>
              ) : (
                <>
                  <Input type="date" label={t('from')} value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} wrapperClassName="w-44" />
                  <Input type="date" label={t('to')} value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} wrapperClassName="w-44" />
                  {from || to ? <Button variant="ghost" onClick={() => { setFrom(''); setTo(''); }}>{t('allTime')}</Button> : null}
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" icon={FileSpreadsheet} loading={busy === 'xlsx'} onClick={() => void exportAs('xlsx')}>Excel</Button>
              <Button variant="outline" size="sm" icon={Sheet} loading={busy === 'csv'} onClick={() => void exportAs('csv')}>CSV</Button>
              <Button variant="outline" size="sm" icon={FileText} loading={busy === 'pdf'} onClick={() => void exportAs('pdf')}>PDF</Button>
            </div>
          </div>
          {q.isError ? (
            <ErrorState onRetry={() => void q.refetch()} />
          ) : (
            <Table columns={cols} rows={rows} rowKey={(r) => (r.__total ? 'total' : JSON.stringify(r))} loading={q.isLoading} emptyText={t('empty')} caption={t(`types.${type}.name`)} />
          )}
          {q.data ? <p className="mt-3 text-sm text-muted">{t('rowCount', { count: q.data.rows.length })}</p> : null}
        </Card>
      )}
    </div>
  );
}
