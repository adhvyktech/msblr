import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@/app/i18n';
import { fyOf } from '@/lib/format';
import { Button } from './Button';
import { ChipGroup } from './forms';
import { Badge } from './Badge';

describe('fyOf', () => {
  it('uses the Indian financial year (April start)', () => {
    expect(fyOf('2026-05-01')).toBe('26-27');
    expect(fyOf('2027-03-31')).toBe('26-27');
    expect(fyOf('2026-03-31')).toBe('25-26');
  });
});

describe('ui kit', () => {
  it('Button fires onClick and is disabled while loading', () => {
    const fn = vi.fn();
    const { rerender } = render(<Button onClick={fn}>Save</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(fn).toHaveBeenCalledTimes(1);
    rerender(<Button loading onClick={fn}>Save</Button>);
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('ChipGroup supports multi select', () => {
    const fn = vi.fn();
    render(<ChipGroup multiple value={['a']} onChange={fn} options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'B' }));
    expect(fn).toHaveBeenCalledWith(['a', 'b']);
  });

  it('Badge renders its text', () => {
    render(<Badge tone="success">Active</Badge>);
    expect(screen.getByText('Active')).toBeTruthy();
  });
});
