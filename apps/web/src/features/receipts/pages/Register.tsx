import { useMemo, useRef, useState } from 'react';
import { Download, FileSpreadsheet, FileText, Upload } from 'lucide-react';
import { useT } from '@/lib/useT';
import { useAuth } from '@/lib/auth';
import { downloadFile } from '@/lib/api';
import { fmtDate, fmtINR, fyOf } from '@/lib/format';
import {
  Badge, Button, Card, DateInput, ErrorState, IconButton, Input, Modal, PageHeader, Pagination, SearchInput, Select, Table, useToast, type Column,
} from '@/components/ui';
import { emptyFilters, filterParams, useImport, useRegister, type ImportSummary, type ReceiptItem, type RegisterFilters } from '../api';

const TEMPLATE = 'serialNo,date,memberName,membershipNo,amount,purpose,utr\r\nR/25-26/0001,2025-04-12,Ramesh Rathi,MSB-0412,1100,Subscription 2025–26,\r\nR/25-26/0002,12/05/2025,Kavita Daga,,1100,Subscription 2025–26,431277120098\r\n';
const fyOptions = () => {
  const [a] = fyOf().split('-');
  const start = 2000 + Number(a);
  return Array.from({ length: 9 }, (_, i) => {
    const y = start - i;
    return { value: `${String(y % 100).padStart(2, '0')}-${String((y + 1) % 100).padStart(2, '0')}`, label: `${y}–${String((y + 1) % 100).padStart(2, '0')}` };
  });
};

function ImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, tc } = useT('receipts');
  const toast = useToast();
  const imp = useImport();
  const input = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [csv, setCsv] = useState('');
  const [res, setRes] = useState<ImportSummary | null>(null);

  const close = () => { setFileName(''); setCsv(''); setRes(null); imp.reset(); onClose(); };
  function template() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + TEMPLATE], { type: 'text/csv;charset=utf-8' }));
    a.download = 'receipts-import-template.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  }
  async function pick(f?: File) {
    if (!f) return;
    if (f.size > 1.8 * 1024 * 1024) { toast.error(t('import.tooBig')); return; }
    setFileName(f.name); setCsv(await f.text()); setRes(null);
  }
  async function run() {
    try { setRes(await imp.mutateAsync(csv)); } catch (e) { toast.error((e as Error).message); }
  }
  const problems = res?.results.filter((r) => r.status !== 'imported') ?? [];
  return (
    <Modal
      open={open} onClose={close} title={t('import.title')} size="lg"
      footer={res ? <Button onClick={close}>{tc('actions.close')}</Button> : (
        <><Button variant="ghost" onClick={close}>{tc('actions.cancel')}</Button><Button icon={Upload} disabled={!csv} loading={imp.isPending} onClick={() => void run()}>{t('import.run')}</Button></>
      )}
    >
      {res ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge tone="success">{t('import.imported', { count: res.imported })}</Badge>
            <Badge tone="warning">{t('import.skipped', { count: res.skipped })}</Badge>
            <Badge tone={res.errors ? 'danger' : 'neutral'}>{t('import.errors', { count: res.errors })}</Badge>
          </div>
          {problems.length ? (
            <ul className="max-h-64 divide-y divide-line overflow-y-auto rounded-theme-sm border border-line text-sm">
              {problems.map((r) => (
                <li key={r.row} className="flex gap-3 px-3 py-2"><span className="w-14 shrink-0 text-muted">{t('import.row', { n: r.row })}</span><span className="min-w-0 flex-1 break-words"><b>{r.serialNo || '—'}</b> · {r.message}</span></li>
              ))}
            </ul>
          ) : <p className="text-success">{t('import.allGood')}</p>}
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-muted">{t('import.intro')}</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            <li>{t('import.rule1')}</li><li>{t('import.rule2')}</li><li>{t('import.rule3')}</li>
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" icon={Download} onClick={template}>{t('import.template')}</Button>
            <Button variant="outline" icon={FileText} onClick={() => input.current?.click()}>{fileName || t('import.choose')}</Button>
            <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" tabIndex={-1} aria-label={t('import.choose')} onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
        </div>
      )}
    </Modal>
  );
}

export default function Register() {
  const { t, tc } = useT('receipts');
  const { can } = useAuth();
  const toast = useToast();
  const [f, setF] = useState<RegisterFilters>(emptyFilters);
  const [page, setPage] = useState(1);
  const [importing, setImporting] = useState(false);
  const q = useRegister(f, page);
  const fys = useMemo(fyOptions, []);
  const set = (patch: Partial<RegisterFilters>) => { setF((c) => ({ ...c, ...patch })); setPage(1); };
  const canExport = can('receipts.export');

  async function exportAs(format: 'xlsx' | 'csv') {
    const p = new URLSearchParams({ format });
    for (const [k, v] of Object.entries(filterParams(f))) if (v) p.set(k, String(v));
    try { await downloadFile(`/api/receipts/export?${p.toString()}`, `receipts-${new Date().toISOString().slice(0, 10)}.${format}`); }
    catch { toast.error(t('register.exportFailed')); }
  }

  const cols: Column<ReceiptItem>[] = [
    { key: 'no', header: t('register.colNo'), render: (r) => <span className="whitespace-nowrap font-semibold">{r.serialNo}</span> },
    { key: 'date', header: t('register.colDate'), render: (r) => <span className="whitespace-nowrap">{fmtDate(r.issuedAt)}</span> },
    { key: 'member', header: t('register.colMember'), render: (r) => <div><div className="font-semibold">{r.memberName}</div><div className="text-xs text-muted">{r.membershipNo ?? ''}</div></div> },
    { key: 'purpose', header: t('register.colPurpose'), render: (r) => r.purpose, hideOnMobile: true },
    { key: 'amount', header: t('register.colAmount'), align: 'right', render: (r) => <span className="whitespace-nowrap font-semibold">{fmtINR(r.amount)}</span> },
    { key: 'utr', header: 'UTR', render: (r) => <span className="text-muted">{r.utr ?? '—'}</span>, hideOnMobile: true },
    { key: 'src', header: t('register.colSource'), render: (r) => <Badge tone={r.legacy ? 'neutral' : 'accent'}>{r.legacy ? t('register.legacy') : t('register.online')}</Badge>, hideOnMobile: true },
    {
      key: 'pdf', header: '', align: 'right',
      render: (r) => (
        <IconButton
          icon={Download} label={t('register.downloadPdf', { no: r.serialNo })} size="sm"
          onClick={() => downloadFile(`/api/receipts/${r.id}/pdf`, `${r.serialNo.replace(/[^\w-]+/g, '-')}.pdf`).catch(() => toast.error(t('register.exportFailed')))}
        />
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={t('register.title')} subtitle={t('register.subtitle')}
        actions={canExport ? (
          <>
            <Button variant="outline" icon={Upload} onClick={() => setImporting(true)}>{t('register.import')}</Button>
            <Button variant="outline" icon={FileSpreadsheet} onClick={() => void exportAs('xlsx')}>Excel</Button>
            <Button variant="outline" icon={FileText} onClick={() => void exportAs('csv')}>CSV</Button>
          </>
        ) : null}
      />
      <Card className="mb-4 space-y-3">
        <SearchInput placeholder={t('register.search')} onSearch={(v) => set({ q: v })} />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Select label={t('register.fy')} value={f.fy} onChange={(e) => set({ fy: e.target.value })} options={[{ value: '', label: t('register.allYears') }, ...fys]} />
          <DateInput label={t('register.from')} value={f.from} max={f.to || undefined} onChange={(e) => set({ from: e.target.value })} />
          <DateInput label={t('register.to')} value={f.to} min={f.from || undefined} onChange={(e) => set({ to: e.target.value })} />
          <Select
            label={t('register.source')} value={f.legacy} onChange={(e) => set({ legacy: e.target.value })}
            options={[{ value: '', label: t('register.allSources') }, { value: 'false', label: t('register.online') }, { value: 'true', label: t('register.legacy') }]}
          />
          <Input label={t('register.min')} type="number" min={0} inputMode="decimal" value={f.min} onChange={(e) => set({ min: e.target.value })} />
          <Input label={t('register.max')} type="number" min={0} inputMode="decimal" value={f.max} onChange={(e) => set({ max: e.target.value })} />
          <Input label={t('register.purpose')} value={f.purpose} onChange={(e) => set({ purpose: e.target.value })} wrapperClassName="col-span-2" />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-muted">{q.data ? t('register.summary', { count: q.data.total, amount: fmtINR(q.data.totalAmount) }) : ' '}</span>
          <Button variant="ghost" size="sm" onClick={() => { setF(emptyFilters); setPage(1); }}>{tc('actions.clear')}</Button>
        </div>
      </Card>
      {q.isError ? <ErrorState onRetry={() => void q.refetch()} /> : (
        <>
          <Table columns={cols} rows={q.data?.data ?? []} rowKey={(r) => r.id} loading={q.isLoading} emptyText={t('register.empty')} caption={t('register.title')} />
          <Pagination className="mt-4" page={q.data?.page ?? 1} pageSize={q.data?.pageSize ?? 20} total={q.data?.total ?? 0} onPage={setPage} />
        </>
      )}
      {canExport ? <ImportModal open={importing} onClose={() => setImporting(false)} /> : null}
    </div>
  );
}
