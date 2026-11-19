import type { ReactNode } from 'react';
import { Button, Card } from '@/components/ui';
import { useT } from '@/lib/useT';

/** A titled settings section with its own Save button. */
export function SettingCard({ id, title, description, children, onSave, saving, dirty = true }: {
  id: string; title: string; description?: string; children: ReactNode; onSave?: () => void; saving?: boolean; dirty?: boolean;
}) {
  const { tc } = useT('settings');
  return (
    <Card id={id} className="scroll-mt-24">
      <h2 className="text-lg">{title}</h2>
      {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      <div className="mt-4 space-y-4">{children}</div>
      {onSave ? (
        <div className="mt-5">
          <Button loading={saving} disabled={!dirty} onClick={onSave}>{tc('actions.save')}</Button>
        </div>
      ) : null}
    </Card>
  );
}
