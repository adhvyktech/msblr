import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Lock, FileSpreadsheet, FileText, Sheet } from 'lucide-react';
import { Badge, Button, DateInput, Drawer, ErrorState, PageHeader, Pagination, SearchInput, Select, Table, useToast, type Column } from '@/components/ui';
import { api, downloadFile } from '@/lib/api';
import { useT } from '@/lib/useT';
import { fmtDateTime } from '@/lib/format';
import { diffChanges, showValue } from '../diff';

interface Row {
  id: number; at: string; actorUserId: number | null; actorName: string | null; actorRole: string | null; action: string;
  entity: string | null; entityId: string | null; summary: string | null; before: unknown; after: unknown; ip: string | null; userAgent: string | null;
}
interface Filters { from: string; to: string; role: string; action: string; entity: string; q: string }
const EMPTY: Filters = { from: '', to: '', role: '', action: '', entity: '', q: '' };
const ROLES = ['super_admin', 'admin', 'finance', 'content', 'ad_manager', 'head', 'family_viewer', 'advertiser'];
const PAGE_SIZE = 25;

function Changes({ row, max = 3 }: { row: Row; max?: number }) {
  const { t } = useT('audit');
  const ch = useMemo(() => diffChanges(row.before, row.after), [row.before, row.after]);
  if (!ch.length) return null;
  const shown = ch.slice(0, max);
  return (
    <ul className="mt-1 space-y-0.5 text-sm">
      {shown.map((c) => (
        <li key={c.field} className="break-words">
          {c.field ? <span className="text-muted">{c.field}: </span> : null}
          {c.before !== undefined && c.before !== null ? <del className="text-muted">{showValue(c.before)}</del> : null}
          {c.before !== undefined && c.before !== null && c.after !== undefined && c.after !== null ? <span aria-hidden> → </span> : null}
          {c.after !== undefined && c.after !== null ? <strong>{showValue(c.after)}</strong> : <span className="text-muted">{t('removed')}</span>}
        </li>
      ))}
      {ch.length > max ? <li className="text-xs text-muted">{t('moreChanges', { count: ch.length - max })}</li> : null}
    </ul>
  );
}

function Json({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="mt-4">
      <h4 className="mb-1.5 text-sm font-semibold">{title}</h4>
      <pre className="max-h-64 overflow-auto rounded-theme-sm border border-line bg-bg p-3 text-xs leading-relaxed">{value == null ? '—' : JSON.stringify(value, null, 2)}</pre>
    </div>
  );
}

export default function ActivityLog() {
  const { t, tc } = useT('audit');
  const toast = useToast();
  const [f, setF] = useState<Filters>(EMPTY);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<Row | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const set = (patch: Partial<Filters>) => { setF((x) => ({ ...x, ...patch })); setPage(1); };

  const params = { from: f.from, to: f.to, role: f.role, action: f.action, entity: f.entity, q: f.q };
  const list = useQuery({ queryKey: ['audit', params, page], queryFn: () => api.list<Row>('/api/audit', { ...params, page, pageSize: PAGE_SIZE }), placeholderData: (p) => p });
  const opts = useQuery({ queryKey: ['audit', 'actions'], queryFn: async () => {
    const r = await api.list<never>('/api/audit/actions');
    return r as unknown as { data: string[]; entities: string[] };
  }, staleTime: 60_000 });

  async function exportAs(format: 'xlsx' | 'csv' | 'pdf') {
    setBusy(format);
    try {
      const qs = new URLSearchParams({ format });
      for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
      await downloadFile(`/api/audit/export?${qs.toString()}`, `activity-log.${format}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const cols: Column<Row>[] = [
    { key: 'at', header: t('when'), render: (r) => <span className="whitespace-nowrap text-sm">{fmtDateTime(r.at)}</span> },
    {
      key: 'who', header: t('who'),
      render: (r) => (<div className="min-w-[110px]"><div className="font-semibold">{r.actorName ?? t('system')}</div>{r.actorRole ? <div className="text-xs text-muted">{r.actorRole}</div> : null}</div>),
    },
    { key: 'what', header: t('what'), render: (r) => (<div className="min-w-[200px]"><Badge tone="info">{r.action}</Badge>{r.summary ? <div className="mt-1 text-sm">{r.summary}</div> : null}<Changes row={r} /></div>) },
    { key: 'entity', header: t('record'), hideOnMobile: true, render: (r) => (r.entity ? <span className="whitespace-nowrap text-sm text-muted">{r.entity}{r.entityId ? ` #${r.entityId}` : ''}</span> : '—') },
  ];

  const hasFilter = Object.values(f).some(Boolean);
  const ex = (format: 'xlsx' | 'csv' | 'pdf', label: string, icon: typeof Sheet) => (
    <Button key={format} variant="outline" size="sm" icon={icon} loading={busy === format} onClick={() => void exportAs(format)}>{label}</Button>
  );

  return (
    <div>
      <PageHeader
        title={t('title')} subtitle={t('subtitle')}
        actions={<>{ex('xlsx', 'Excel', FileSpreadsheet)}{ex('csv', 'CSV', Sheet)}{ex('pdf', 'PDF', FileText)}</>}
      />
      <div className="mb-4 grid gap-3 rounded-theme border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-6">
        <SearchInput value={f.q} onSearch={(q) => set({ q })} placeholder={t('searchPh')} className="sm:col-span-2" />
        <DateInput label={t('from')} value={f.from} max={f.to || undefined} onChange={(e) => set({ from: e.target.value })} />
        <DateInput label={t('to')} value={f.to} min={f.from || undefined} onChange={(e) => set({ to: e.target.value })} />
        <Select label={t('role')} value={f.role} onChange={(e) => set({ role: e.target.value })} placeholder={t('any')} options={ROLES.map((r) => ({ value: r, label: r }))} />
        <Select label={t('action')} value={f.action} onChange={(e) => set({ action: e.target.value })} placeholder={t('any')} options={(opts.data?.data ?? []).map((a) => ({ value: a, label: a }))} />
        <Select label={t('record')} value={f.entity} onChange={(e) => set({ entity: e.target.value })} placeholder={t('any')} options={(opts.data?.entities ?? []).map((a) => ({ value: a, label: a }))} />
        {hasFilter ? <div className="flex items-end"><Button variant="ghost" onClick={() => { setF(EMPTY); setPage(1); }}>{t('clear')}</Button></div> : null}
      </div>

      {list.isError ? (
        <ErrorState onRetry={() => void list.refetch()} />
      ) : (
        <>
          <Table columns={cols} rows={list.data?.data ?? []} rowKey={(r) => r.id} loading={list.isLoading} onRowClick={setOpen} emptyText={t('empty')} caption={t('title')} />
          <Pagination className="mt-4" page={page} pageSize={PAGE_SIZE} total={list.data?.total ?? 0} onPage={setPage} />
        </>
      )}
      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted"><Lock size={14} aria-hidden />{t('readOnly')}</p>

      <Drawer open={!!open} onClose={() => setOpen(null)} side="right" width={480} title={t('detail')}>
        {open ? (
          <div className="p-4">
            <Badge tone="info">{open.action}</Badge>
            <p className="mt-2 font-semibold">{open.summary ?? '—'}</p>
            <dl className="mt-3 grid grid-cols-[110px_1fr] gap-y-1.5 text-sm">
              <dt className="text-muted">{t('when')}</dt><dd>{fmtDateTime(open.at)}</dd>
              <dt className="text-muted">{t('who')}</dt><dd>{open.actorName ?? t('system')}{open.actorRole ? ` (${open.actorRole})` : ''}</dd>
              <dt className="text-muted">{t('record')}</dt><dd>{open.entity ? `${open.entity}${open.entityId ? ` #${open.entityId}` : ''}` : '—'}</dd>
              <dt className="text-muted">IP</dt><dd>{open.ip ?? '—'}</dd>
              <dt className="text-muted">{t('device')}</dt><dd className="break-words">{open.userAgent ?? '—'}</dd>
            </dl>
            <h4 className="mb-1 mt-4 text-sm font-semibold">{t('changes')}</h4>
            {diffChanges(open.before, open.after).length ? <Changes row={open} max={100} /> : <p className="text-sm text-muted">{t('noChanges')}</p>}
            <Json title={t('before')} value={open.before} />
            <Json title={t('after')} value={open.after} />
            <Button className="mt-5" variant="ghost" onClick={() => setOpen(null)}>{tc('actions.close')}</Button>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
