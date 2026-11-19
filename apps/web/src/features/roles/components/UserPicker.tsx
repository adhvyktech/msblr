import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { Avatar, SearchInput, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/useT';
import { formatMobile } from '@/lib/format';
import type { PickUser } from '../api';

/** Search by name / mobile / membership no, pick one user. */
export function UserPicker({ value, onChange, label, excludeId }: { value: PickUser | null; onChange: (u: PickUser | null) => void; label: string; excludeId?: number }) {
  const { t } = useT('roles');
  const [q, setQ] = useState('');
  const res = useQuery({
    enabled: q.length >= 2 && !value,
    queryKey: ['roles', 'user-search', q],
    queryFn: () => api.get<PickUser[]>('/api/roles/users/search', { params: { q } }),
  });
  if (value) {
    return (
      <div>
        <p className="mb-1.5 text-sm font-semibold text-ink/80">{label}</p>
        <div className="flex items-center gap-3 rounded-theme-sm border-[1.5px] border-primary bg-accent-soft p-3">
          <Avatar name={value.name} size={40} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{value.name}</p>
            <p className="truncate text-sm text-muted">{formatMobile(value.mobile)}{value.membershipNo ? ` · ${value.membershipNo}` : ''}</p>
          </div>
          <button type="button" onClick={() => { onChange(null); setQ(''); }} aria-label={t('picker.change')} className="grid h-11 w-11 place-items-center rounded-full hover:bg-ink/10"><X size={18} aria-hidden /></button>
        </div>
      </div>
    );
  }
  const list = (res.data ?? []).filter((u) => u.id !== excludeId);
  return (
    <div>
      <p className="mb-1.5 text-sm font-semibold text-ink/80">{label}</p>
      <SearchInput onSearch={setQ} placeholder={t('picker.placeholder')} />
      <div className="mt-2" aria-live="polite">
        {q.length < 2 ? <p className="text-sm text-muted">{t('picker.hint')}</p> : res.isLoading ? <Spinner className="text-primary" /> : res.isError ? (
          <p role="alert" className="text-sm text-danger">{t('picker.error')}</p>
        ) : list.length === 0 ? <p className="text-sm text-muted">{t('picker.none')}</p> : (
          <ul className="max-h-60 divide-y divide-line overflow-y-auto rounded-theme-sm border border-line bg-surface">
            {list.map((u) => (
              <li key={u.id}>
                <button type="button" onClick={() => onChange(u)} className="flex min-h-[56px] w-full items-center gap-3 px-3 py-2 text-left hover:bg-accent-soft">
                  <Avatar name={u.name} size={36} />
                  <span className="min-w-0"><span className="block truncate font-semibold">{u.name}</span><span className="block truncate text-sm text-muted">{formatMobile(u.mobile)}{u.membershipNo ? ` · ${u.membershipNo}` : ''}</span></span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
