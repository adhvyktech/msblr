import { useState } from 'react';
import { PageHeader, Tabs } from '@/components/ui';
import { useT } from '@/lib/useT';
import { StaffTab } from '../components/StaffTab';
import { PermissionsTab } from '../components/PermissionsTab';
import { HandoverTab } from '../components/HandoverTab';

export default function Roles() {
  const { t } = useT('roles');
  const [tab, setTab] = useState('staff');
  return (
    <div>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <Tabs label={t('title')} value={tab} onChange={setTab} items={[{ id: 'staff', label: t('tabs.staff') }, { id: 'roles', label: t('tabs.roles') }, { id: 'handover', label: t('tabs.handover') }]} />
      <div className="pt-5">
        {tab === 'staff' ? <StaffTab /> : tab === 'roles' ? <PermissionsTab /> : <HandoverTab />}
      </div>
    </div>
  );
}
