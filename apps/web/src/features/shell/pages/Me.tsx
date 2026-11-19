import { Link, useNavigate } from 'react-router-dom';
import { Briefcase, ChevronRight, Lock, LogOut, Megaphone, ShieldCheck, Users, Wallet, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/auth';
import { fmtDate, formatMobile } from '@/lib/format';
import { Avatar, StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, PageHeader } from '@/components/ui/Card';
import { LangSwitch } from '@/components/ui/LangSwitch';

const LINKS: { to: string; key: string; icon: LucideIcon }[] = [
  { to: '/me/family', key: 'family', icon: Users },
  { to: '/me/privacy', key: 'privacy', icon: Lock },
  { to: '/me/subscription', key: 'subscription', icon: Wallet },
  { to: '/me/business', key: 'business', icon: Briefcase },
  { to: '/advertise', key: 'advertise', icon: Megaphone },
];

export default function Me() {
  const { t } = useTranslation('shell');
  const { t: tc } = useTranslation('common');
  const { me, isStaff, logout } = useAuth();
  const nav = useNavigate();
  if (!me) return null;
  const f = me.family;
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t('me.title')} />
      <Card className="mb-5 flex items-center gap-4">
        <Avatar name={me.user.name} src={me.person?.photoUrl} size={64} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xl">{me.user.name}</h2>
          <p className="text-muted">{formatMobile(me.user.mobile)}</p>
          {f ? (
            <p className="mt-1 text-sm text-muted">
              {f.membershipNo}{f.zone ? ` · ${f.zone}` : ''} · {me.isHead ? t('me.head') : t('me.member')}
            </p>
          ) : null}
        </div>
      </Card>

      {f ? (
        <Card className="mb-5 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-muted">{t('me.subscription')}</p>
            <div className="mt-1 flex items-center gap-2"><StatusBadge status={f.subscriptionStatus} />{f.subscriptionValidUntil ? <span className="text-sm text-muted">{t('me.validUntil', { date: fmtDate(f.subscriptionValidUntil) })}</span> : null}</div>
          </div>
          {f.subscriptionStatus !== 'ACTIVE' ? <Link to="/me/subscription"><Button size="sm">{t('me.payNow')}</Button></Link> : null}
        </Card>
      ) : null}

      <Card className="mb-5 flex items-center justify-between gap-4">
        <div><p className="font-semibold">{tc('lang.switch')}</p><p className="text-sm text-muted">{t('me.languageHint')}</p></div>
        <LangSwitch />
      </Card>

      <Card padded={false} className="mb-5 overflow-hidden">
        <ul>
          {LINKS.filter((l) => (l.key === 'family' || l.key === 'privacy' || l.key === 'subscription') ? !!f : true).map(({ to, key, icon: Icon }) => (
            <li key={to} className="border-b border-line last:border-0">
              <Link to={to} className="flex min-h-[56px] items-center gap-3 px-4 hover:bg-ink/5">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft text-accent"><Icon size={20} aria-hidden /></span>
                <span className="flex-1 font-medium">{t(`me.links.${key}`)}</span>
                <ChevronRight size={20} className="text-muted" aria-hidden />
              </Link>
            </li>
          ))}
          {isStaff ? (
            <li className="border-t border-line">
              <Link to="/admin" className="flex min-h-[56px] items-center gap-3 px-4 hover:bg-ink/5">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><ShieldCheck size={20} aria-hidden /></span>
                <span className="flex-1 font-medium">{tc('menu.adminPanel')}</span>
                <ChevronRight size={20} className="text-muted" aria-hidden />
              </Link>
            </li>
          ) : null}
        </ul>
      </Card>

      <Button variant="outline" fullWidth icon={LogOut} onClick={async () => { await logout(); nav('/login', { replace: true }); }}>{tc('actions.logout')}</Button>
    </div>
  );
}
