import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { BellRing, MessageCircle, Plus, Trash2, X } from 'lucide-react';
import {
  Badge, Button, Card, ChipGroup, ConfirmDialog, EmptyState, ErrorState, IconButton, Input, Modal, PageHeader, Pagination, SearchInput, Section, Select, Table, Tabs, Textarea, Toggle, useToast,
  type Column,
} from '@/components/ui';
import { api } from '@/lib/api';
import { fmtDateTime, formatMobile, whatsappLink } from '@/lib/format';
import { useT } from '@/lib/useT';

type Audience = 'ALL' | 'ZONE' | 'LIST' | 'SINGLE';
interface Recipient { userId: number; name: string; mobile: string; membershipNo: string | null; zone?: string | null }
interface Template { id: number; name: string; title: string; body: string }
interface Sent {
  id: number; title: string; audience: Audience; scheduledAt: string | null; sentAt: string | null; status: 'SENT' | 'SCHEDULED';
  recipients: number; read: number; pushSent: number; pushFailed: number; noToken: number;
}

function Compose() {
  const { t } = useT('notifications');
  const toast = useToast();
  const qc = useQueryClient();
  const [audience, setAudience] = useState<Audience>('ALL');
  const [zoneId, setZoneId] = useState('');
  const [picked, setPicked] = useState<Recipient[]>([]);
  const [search, setSearch] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [hi, setHi] = useState(false);
  const [titleHi, setTitleHi] = useState('');
  const [bodyHi, setBodyHi] = useState('');
  const [schedule, setSchedule] = useState(false);
  const [when, setWhen] = useState(dayjs().add(1, 'hour').format('YYYY-MM-DDTHH:mm'));
  const [confirm, setConfirm] = useState(false);
  const [saveTpl, setSaveTpl] = useState(false);
  const [tplName, setTplName] = useState('');
  const [showAll, setShowAll] = useState(false);

  const zones = useQuery({ queryKey: ['notifications', 'zones'], queryFn: () => api.get<{ id: number; name: string }[]>('/api/notifications/zones'), staleTime: 300_000 });
  const templates = useQuery({ queryKey: ['notifications', 'templates'], queryFn: () => api.get<Template[]>('/api/notifications/templates') });
  const found = useQuery({
    queryKey: ['notifications', 'recipients', search], enabled: search.length >= 2,
    queryFn: () => api.get<Recipient[]>('/api/notifications/recipients', { params: { q: search } }),
  });

  const ref = audience === 'ZONE' ? zoneId : audience === 'LIST' ? picked.map((p) => p.userId).join(',') : audience === 'SINGLE' ? String(picked[0]?.userId ?? '') : '';
  const audienceReady = audience === 'ALL' || !!ref;
  const audienceBody = { audience, audienceRef: ref || undefined };
  const count = useQuery({
    queryKey: ['notifications', 'count', audience, ref], enabled: audienceReady,
    queryFn: () => api.post<{ count: number }>('/api/notifications/preview-count', audienceBody),
  });
  const wa = useQuery({
    queryKey: ['notifications', 'wa', audience, ref], enabled: audienceReady,
    queryFn: () => api.get<Recipient[]>('/api/notifications/whatsapp-list', { params: audienceBody }),
  });

  const when_ = schedule ? new Date(when) : null;
  const scheduleOk = !schedule || (when_ !== null && !Number.isNaN(when_.getTime()) && when_.getTime() > Date.now() + 60_000);
  const valid = audienceReady && title.trim().length > 0 && body.trim().length > 0 && scheduleOk && (count.data?.count ?? 0) > 0;

  const send = useMutation({
    mutationFn: () => api.post<{ recipients: number; scheduled: boolean }>('/api/notifications/send', {
      ...audienceBody, title: title.trim(), body: body.trim(),
      ...(hi && titleHi.trim() && bodyHi.trim() ? { titleHi: titleHi.trim(), bodyHi: bodyHi.trim() } : {}),
      ...(schedule && when_ ? { scheduledAt: when_.toISOString() } : {}),
    }),
    onSuccess: (r) => {
      setConfirm(false);
      toast.success(r.scheduled ? t('scheduledOk', { count: r.recipients }) : t('sentOk', { count: r.recipients }));
      setTitle(''); setBody(''); setTitleHi(''); setBodyHi(''); setSchedule(false);
      void qc.invalidateQueries({ queryKey: ['notifications', 'sent'] });
    },
    onError: (e: Error) => { setConfirm(false); toast.error(e.message); },
  });
  const addTpl = useMutation({
    mutationFn: () => api.post('/api/notifications/templates', { name: tplName.trim(), title: title.trim(), body: body.trim() }),
    onSuccess: () => { toast.success(t('tplSaved')); setSaveTpl(false); setTplName(''); void qc.invalidateQueries({ queryKey: ['notifications', 'templates'] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const delTpl = useMutation({
    mutationFn: (id: number) => api.delete(`/api/notifications/templates/${id}`),
    onSuccess: () => { toast.success(t('tplDeleted')); void qc.invalidateQueries({ queryKey: ['notifications', 'templates'] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const pick = (r: Recipient) => {
    setPicked((cur) => (audience === 'SINGLE' ? [r] : cur.some((x) => x.userId === r.userId) ? cur : [...cur, r]));
  };
  const waText = `${title.trim()}\n\n${body.trim()}`.trim();
  const waRows = useMemo(() => (showAll ? wa.data ?? [] : (wa.data ?? []).slice(0, 25)), [wa.data, showAll]);
  const audienceLabel = audience === 'ALL' ? t('aud.ALL') : audience === 'ZONE' ? `${t('aud.ZONE')}: ${zones.data?.find((z) => String(z.id) === zoneId)?.name ?? ''}` : t('audPicked', { count: picked.length });

  return (
    <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-5">
        <Card className="space-y-4">
          <h2 className="text-lg">{t('who')}</h2>
          <ChipGroup
            label={t('who')} value={audience} onChange={(v) => { setAudience(v); setPicked((cur) => (v === 'SINGLE' ? cur.slice(0, 1) : cur)); }}
            options={(['ALL', 'ZONE', 'LIST', 'SINGLE'] as Audience[]).map((a) => ({ value: a, label: t(`aud.${a}`) }))}
          />
          {audience === 'ZONE' ? (
            <Select label={t('zone')} value={zoneId} onChange={(e) => setZoneId(e.target.value)} placeholder={t('zonePh')} options={(zones.data ?? []).map((z) => ({ value: z.id, label: z.name }))} />
          ) : null}
          {audience === 'LIST' || audience === 'SINGLE' ? (
            <div className="space-y-3">
              <SearchInput onSearch={setSearch} placeholder={t('searchPh')} aria-label={t('searchPh')} />
              {search.length >= 2 ? (
                found.isLoading ? <p className="text-sm text-muted">{t('searching')}</p> : !found.data?.length ? <p className="text-sm text-muted">{t('noMatch')}</p> : (
                  <ul className="divide-y divide-line rounded-theme-sm border border-line">
                    {found.data.map((r) => (
                      <li key={r.userId} className="flex items-center justify-between gap-3 px-3 py-2">
                        <span className="min-w-0"><span className="block truncate font-semibold">{r.name}</span><span className="text-xs text-muted">{r.membershipNo ?? ''} {r.zone ? `· ${r.zone}` : ''} · {formatMobile(r.mobile)}</span></span>
                        <Button size="sm" variant="outline" icon={Plus} onClick={() => pick(r)}>{t('add')}</Button>
                      </li>
                    ))}
                  </ul>
                )
              ) : null}
              {picked.length ? (
                <ul className="flex flex-wrap gap-2" aria-label={t('selected')}>
                  {picked.map((p) => (
                    <li key={p.userId} className="inline-flex items-center gap-1 rounded-full bg-accent-soft py-1 pl-3 pr-1 text-sm font-medium">
                      {p.name}
                      <IconButton icon={X} size="sm" label={t('removeRecipient', { name: p.name })} onClick={() => setPicked((c) => c.filter((x) => x.userId !== p.userId))} />
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-muted">{t('nobodyPicked')}</p>}
            </div>
          ) : null}
          <p className="rounded-theme-sm bg-accent-soft px-3 py-2 text-sm" aria-live="polite">
            {audienceReady ? (count.isLoading ? t('counting') : <>{t('willReach')} <b>{count.data?.count ?? 0}</b> {t('people')}</>) : t('pickAudience')}
          </p>
        </Card>

        <Card className="space-y-4">
          <h2 className="text-lg">{t('message')}</h2>
          {templates.data?.length ? (
            <div>
              <p className="mb-2 text-sm font-semibold text-ink/80">{t('templates')}</p>
              <div className="flex flex-wrap gap-2">
                {templates.data.map((tp) => (
                  <span key={tp.id} className="inline-flex items-center overflow-hidden rounded-full border border-line bg-surface">
                    <button type="button" className="min-h-[40px] px-4 text-sm font-medium hover:bg-accent-soft" onClick={() => { setTitle(tp.title); setBody(tp.body); }}>{tp.name}</button>
                    <button type="button" aria-label={t('tplDelete', { name: tp.name })} className="grid min-h-[40px] w-9 place-items-center text-muted hover:text-danger" onClick={() => delTpl.mutate(tp.id)}><Trash2 size={14} aria-hidden /></button>
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          <Input label={t('titleLabel')} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required />
          <Textarea label={t('bodyLabel')} value={body} onChange={(e) => setBody(e.target.value)} maxLength={1000} rows={4} required hint={`${body.length}/1000`} />
          <Toggle checked={hi} onChange={setHi} label={t('addHindi')} description={t('addHindiHint')} />
          {hi ? (
            <>
              <Input label={t('titleHi')} value={titleHi} onChange={(e) => setTitleHi(e.target.value)} maxLength={120} lang="hi" />
              <Textarea label={t('bodyHi')} value={bodyHi} onChange={(e) => setBodyHi(e.target.value)} maxLength={1000} rows={3} lang="hi" />
            </>
          ) : null}
          <Toggle checked={schedule} onChange={setSchedule} label={t('schedule')} description={t('scheduleHint')} />
          {schedule ? <Input label={t('sendAt')} type="datetime-local" value={when} min={dayjs().format('YYYY-MM-DDTHH:mm')} onChange={(e) => setWhen(e.target.value)} error={scheduleOk ? undefined : t('scheduleError')} /> : null}
          <div className="flex flex-wrap gap-2">
            <Button icon={BellRing} size="lg" disabled={!valid} onClick={() => setConfirm(true)}>{schedule ? t('scheduleBtn') : t('sendBtn')}</Button>
            <Button variant="outline" size="lg" disabled={!title.trim() || !body.trim()} onClick={() => setSaveTpl(true)}>{t('saveTpl')}</Button>
          </div>
        </Card>
      </div>

      <div className="space-y-5">
        <Card>
          <h2 className="mb-3 text-lg">{t('phonePreview')}</h2>
          <div className="mx-auto w-[260px] rounded-[28px] border-[5px] border-ink/80 bg-bg p-3">
            <p className="mb-2 text-center text-[11px] text-muted">{dayjs().format('h:mm A')}</p>
            <div className="rounded-2xl border border-line bg-surface p-3 shadow-card">
              <div className="mb-1 flex items-center gap-1.5 text-[11px] text-muted"><span className="h-3.5 w-3.5 rounded bg-primary" aria-hidden />{t('appName')} · {t('now')}</div>
              <p className="text-sm font-semibold">{title || t('titlePh')}</p>
              <p className="whitespace-pre-line text-[13px] text-ink/80">{body || t('bodyPh')}</p>
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="mb-1 flex items-center gap-2 text-lg"><MessageCircle size={20} aria-hidden />{t('wa.title')}</h2>
          <p className="mb-3 text-sm text-muted">{t('wa.hint')}</p>
          {!audienceReady ? <p className="text-sm text-muted">{t('pickAudience')}</p> : wa.isLoading ? <p className="text-sm text-muted">{t('searching')}</p> : !wa.data?.length ? <p className="text-sm text-muted">{t('wa.none')}</p> : (
            <>
              {!waText ? <p className="mb-2 text-sm text-warning">{t('wa.writeFirst')}</p> : null}
              <ul className="divide-y divide-line rounded-theme-sm border border-line">
                {waRows.map((r) => (
                  <li key={r.userId} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="min-w-0"><span className="block truncate text-sm font-semibold">{r.name}</span><span className="text-xs text-muted">{formatMobile(r.mobile)}</span></span>
                    {waText ? (
                      <a href={whatsappLink(r.mobile, waText)} target="_blank" rel="noopener noreferrer" aria-label={`${t('wa.open')}: ${r.name}`}
                        className="inline-flex min-h-[36px] items-center rounded-theme-sm border-[1.5px] border-primary px-3 text-sm font-semibold text-primary hover:bg-primary/10">{t('wa.open')}</a>
                    ) : <Button size="sm" variant="outline" disabled>{t('wa.open')}</Button>}
                  </li>
                ))}
              </ul>
              {(wa.data?.length ?? 0) > 25 && !showAll ? <Button variant="ghost" size="sm" className="mt-2" onClick={() => setShowAll(true)}>{t('wa.showAll', { count: wa.data!.length })}</Button> : null}
            </>
          )}
        </Card>
      </div>

      <ConfirmDialog
        open={confirm} onClose={() => setConfirm(false)} onConfirm={() => send.mutate()} loading={send.isPending}
        title={schedule ? t('confirmScheduleTitle') : t('confirmTitle')} confirmLabel={schedule ? t('scheduleBtn') : t('sendBtn')}
        message={<div className="space-y-2"><p>{t('confirmBody', { count: count.data?.count ?? 0, who: audienceLabel })}</p><p className="rounded-theme-sm bg-accent-soft p-3 text-sm"><b>{title}</b><br />{body}</p>{schedule && when_ ? <p className="text-sm">{t('confirmWhen', { when: fmtDateTime(when_) })}</p> : null}</div>}
      />
      <Modal open={saveTpl} onClose={() => setSaveTpl(false)} title={t('saveTpl')} size="sm"
        footer={<><Button variant="ghost" onClick={() => setSaveTpl(false)}>{t('cancel')}</Button><Button loading={addTpl.isPending} disabled={!tplName.trim()} onClick={() => addTpl.mutate()}>{t('save')}</Button></>}>
        <Input label={t('tplName')} value={tplName} onChange={(e) => setTplName(e.target.value)} maxLength={60} required data-autofocus />
      </Modal>
    </div>
  );
}

function History() {
  const { t } = useT('notifications');
  const toast = useToast();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['notifications', 'sent', page], queryFn: () => api.list<Sent>('/api/notifications/sent', { page, pageSize: 20 }) });
  const cancel = useMutation({
    mutationFn: (id: number) => api.delete(`/api/notifications/sent/${id}`),
    onSuccess: () => { toast.success(t('cancelled')); void qc.invalidateQueries({ queryKey: ['notifications', 'sent'] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const cols: Column<Sent>[] = [
    { key: 'title', header: t('titleLabel'), render: (r) => <span className="font-semibold">{r.title}</span> },
    { key: 'aud', header: t('who'), hideOnMobile: true, render: (r) => t(`aud.${r.audience}`) },
    { key: 'when', header: t('when'), render: (r) => (r.status === 'SCHEDULED' ? <Badge tone="warning">{t('scheduledFor', { when: fmtDateTime(r.scheduledAt) })}</Badge> : fmtDateTime(r.sentAt)) },
    { key: 'rec', header: t('recipients'), align: 'right', render: (r) => r.recipients },
    { key: 'read', header: t('read'), align: 'right', hideOnMobile: true, render: (r) => r.read },
    { key: 'push', header: t('push'), align: 'right', hideOnMobile: true, render: (r) => t('pushLine', { sent: r.pushSent, none: r.noToken }) },
    { key: 'act', header: '', align: 'right', render: (r) => (r.status === 'SCHEDULED' ? <Button size="sm" variant="ghost" className="text-danger" loading={cancel.isPending && cancel.variables === r.id} onClick={() => cancel.mutate(r.id)}>{t('cancel')}</Button> : null) },
  ];
  if (q.isError) return <ErrorState onRetry={() => void q.refetch()} />;
  if (!q.isLoading && !q.data?.data.length) return <EmptyState icon={BellRing} title={t('histEmptyTitle')} description={t('histEmptyBody')} />;
  return (
    <>
      <Table columns={cols} rows={q.data?.data ?? []} rowKey={(r) => r.id} loading={q.isLoading} caption={t('tabHistory')} />
      <Pagination className="mt-3" page={page} pageSize={20} total={q.data?.total ?? 0} onPage={setPage} />
    </>
  );
}

export default function Composer() {
  const { t } = useT('notifications');
  const [tab, setTab] = useState<'compose' | 'history'>('compose');
  return (
    <div>
      <PageHeader title={t('adminTitle')} subtitle={t('adminSubtitle')} />
      <Tabs label={t('adminTitle')} value={tab} onChange={(v) => setTab(v as typeof tab)} className="mb-5" items={[{ id: 'compose', label: t('tabCompose') }, { id: 'history', label: t('tabHistory') }]} />
      <Section className="mb-0">{tab === 'compose' ? <Compose /> : <History />}</Section>
    </div>
  );
}
