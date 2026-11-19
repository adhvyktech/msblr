import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell, LayoutDashboard, LogOut, Smartphone, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/cn';
import { Avatar } from '@/components/ui/Badge';
import { IconButton } from '@/components/ui/Button';
import { useLogo } from '@/app/theme';

export function Brand({ size = 44, showText = false, className, to = '/' }: { size?: number; showText?: boolean; className?: string; to?: string }) {
  const logo = useLogo();
  const { t } = useTranslation('common');
  return (
    <Link to={to} className={cn('inline-flex items-center gap-3 rounded-xl', className)} aria-label={t('appName')}>
      <img src={logo} alt="" width={size} height={size} className="shrink-0 rounded-[22%]" style={{ width: size, height: size }} />
      {showText ? (
        <span className="leading-tight">
          <span className="block font-head text-base" style={{ fontWeight: 'var(--hw)' }}>{t('appName')}</span>
          <span className="block text-xs text-muted">{t('sabhaName')}</span>
        </span>
      ) : null}
    </Link>
  );
}

/** Bell with unread count. Tolerates /api/notifications/unread-count being absent (404 → 0). */
export function NotificationBell() {
  const { t } = useTranslation('common');
  const { status } = useAuth();
  const { data = 0 } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    enabled: status === 'authed',
    retry: false,
    refetchInterval: 60_000,
    queryFn: async () => {
      try {
        const r = await api.get<number | { count: number }>('/api/notifications/unread-count');
        return typeof r === 'number' ? r : r?.count ?? 0;
      } catch {
        return 0;
      }
    },
  });
  const nav = useNavigate();
  return (
    <IconButton
      icon={Bell} badge={data} onClick={() => nav('/notifications')}
      label={data ? `${t('notifications.bell')} — ${t('notifications.unread', { count: data })}` : t('notifications.bell')}
    />
  );
}

export function AvatarMenu({ inAdmin = false }: { inAdmin?: boolean }) {
  const { t } = useTranslation('common');
  const { me, isStaff, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const nav = useNavigate();
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [open]);
  const item = 'flex min-h-[44px] w-full items-center gap-3 px-4 text-left text-base hover:bg-ink/5';
  return (
    <div className="relative" ref={ref}>
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label={t('menu.account')} onClick={() => setOpen((o) => !o)} className="grid h-11 w-11 place-items-center rounded-full">
        <Avatar name={me?.user.name} src={me?.person?.photoUrl} size={40} />
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 top-12 z-50 w-64 animate-[pop-in_.15s] overflow-hidden rounded-theme-sm border border-line bg-surface py-1 shadow-pop">
          <div className="border-b border-line px-4 py-3">
            <p className="truncate font-semibold">{me?.user.name}</p>
            <p className="truncate text-sm text-muted">{me?.family?.membershipNo ?? me?.user.mobile}</p>
          </div>
          <Link role="menuitem" to="/me" className={item} onClick={() => setOpen(false)}><User size={18} aria-hidden />{t('menu.profile')}</Link>
          {isStaff && !inAdmin ? <Link role="menuitem" to="/admin" className={item} onClick={() => setOpen(false)}><LayoutDashboard size={18} aria-hidden />{t('menu.adminPanel')}</Link> : null}
          {inAdmin ? <Link role="menuitem" to="/" className={item} onClick={() => setOpen(false)}><Smartphone size={18} aria-hidden />{t('menu.memberApp')}</Link> : null}
          <button role="menuitem" type="button" className={cn(item, 'text-danger')} onClick={async () => { setOpen(false); await logout(); nav('/login', { replace: true }); }}>
            <LogOut size={18} aria-hidden />{t('actions.logout')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
