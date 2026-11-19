import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Download, FileUp } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, PageHeader, Table, useToast, type Column } from '@/components/ui';
import { importCsv, type ImportResult } from '../api';

const TEMPLATE = [
  'membershipNo,headName,relation,name,dob,anniversary,mobile,email,zone,address,area',
  'MSB-0901,Mohan Daga,SELF,Mohan Daga,1970-05-12,1995-02-10,9810000001,mohan@example.com,Zone 1,12 5th Cross,Chickpet',
  'MSB-0901,Mohan Daga,SPOUSE,Sunita Daga,1974-08-20,1995-02-10,9810000002,,,,',
  'MSB-0901,Mohan Daga,SON,Rohit Daga,2001-01-15,,,,,,',
].join('\r\n');

export default function ImportPage() {
  const { t } = useTranslation('members');
  const toast = useToast();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<ImportResult | null>(null);

  const template = () => {
    const url = URL.createObjectURL(new Blob(['﻿' + TEMPLATE], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'msblr-members-template.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  };
  const run = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const r = await importCsv(file);
      setRes(r);
      void qc.invalidateQueries({ queryKey: ['members'] });
      (r.summary.errors ? toast.info : toast.success)(t('import.done', { created: r.summary.created, errors: r.summary.errors }));
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  const columns: Column<ImportResult['results'][number]>[] = [
    { key: 'line', header: t('import.line'), render: (r) => r.line },
    { key: 'no', header: t('admin.membershipNo'), render: (r) => r.membershipNo || '—' },
    { key: 'name', header: t('import.name'), render: (r) => r.name || '—' },
    { key: 'status', header: t('admin.status'), render: (r) => <Badge tone={r.status === 'created' ? 'success' : r.status === 'skipped' ? 'warning' : 'danger'}>{t(`import.s_${r.status}`)}</Badge> },
    { key: 'msg', header: t('import.message'), render: (r) => r.message },
  ];

  return (
    <div>
      <Link to="/admin/members" className="mb-2 inline-flex min-h-[44px] items-center gap-1.5 font-semibold text-primary"><ArrowLeft size={18} aria-hidden />{t('admin.back')}</Link>
      <PageHeader title={t('import.title')} subtitle={t('import.subtitle')} actions={<Button variant="outline" icon={Download} onClick={template}>{t('import.template')}</Button>} />
      <Card className="mb-5">
        <ul className="mb-4 list-disc space-y-1 pl-5 text-[15px] text-muted">
          <li>{t('import.rule1')}</li><li>{t('import.rule2')}</li><li>{t('import.rule3')}</li>
        </ul>
        <div className="flex flex-wrap items-center gap-3">
          <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" aria-label={t('import.choose')} onChange={(e) => { setFile(e.target.files?.[0] ?? null); setRes(null); }} />
          <Button variant="outline" icon={FileUp} onClick={() => input.current?.click()}>{t('import.choose')}</Button>
          <span className="text-muted">{file ? file.name : t('import.noFile')}</span>
          <Button className="ml-auto" disabled={!file} loading={busy} onClick={() => void run()}>{t('import.upload')}</Button>
        </div>
      </Card>
      {res ? (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            <Badge tone="neutral">{t('import.total', { n: res.summary.total })}</Badge>
            <Badge tone="success">{t('import.created', { n: res.summary.created })}</Badge>
            <Badge tone="warning">{t('import.skipped', { n: res.summary.skipped })}</Badge>
            <Badge tone="danger">{t('import.errors', { n: res.summary.errors })}</Badge>
          </div>
          <Table columns={columns} rows={res.results} rowKey={(r) => `${r.line}-${r.name}`} caption={t('import.title')} />
        </>
      ) : null}
    </div>
  );
}
