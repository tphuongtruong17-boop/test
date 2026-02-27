'use client';
// components/SlotGrid.tsx

import { SlotInfo } from '@/hooks/useOpnetWallet';

interface Props {
  slots: SlotInfo[];
  selected: number | null;
  onSelect: (id: number) => void;
  loading?: boolean;
}

export default function SlotGrid({ slots, selected, onSelect, loading }: Props) {
  if (loading) {
    return (
      <div className="slot-grid">
        {Array(100).fill(0).map((_, i) => (
          <div key={i} className="skeleton" style={{ aspectRatio: '1', borderRadius: 0 }} />
        ))}
      </div>
    );
  }

  return (
    <div className="slot-grid">
      {slots.map((slot) => {
        const isSelected = selected === slot.id;
        const isHot = !slot.isEmpty && slot.price > 5000n;

        let bg = 'var(--s1)';
        let borderColor = isSelected ? 'var(--acc)' : 'var(--border)';

        if (!slot.isEmpty) {
          bg = slot.ismine ? 'rgba(245,255,0,.07)' : 'rgba(0,255,170,.05)';
          borderColor = isSelected
            ? 'var(--acc)'
            : slot.ismine ? 'rgba(245,255,0,.22)' : 'rgba(0,255,170,.12)';
        }

        return (
          <div
            key={slot.id}
            onClick={() => onSelect(slot.id)}
            title={`Slot #${slot.id}${slot.isEmpty ? ' (empty)' : ` — ${slot.price} SAT`}`}
            style={{
              aspectRatio: '1',
              border: `1px solid ${borderColor}`,
              background: bg,
              cursor: 'pointer',
              position: 'relative',
              transition: '.12s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: "'Space Mono', monospace",
              fontSize: 8,
              color: 'transparent',
              animation: isHot ? 'pulse-slot 1.8s infinite' : undefined,
              transform: isSelected ? 'scale(1.06)' : undefined,
              zIndex: isSelected ? 2 : undefined,
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'scale(1.06)';
              e.currentTarget.style.zIndex = '2';
              e.currentTarget.style.color = 'var(--muted)';
              if (!isSelected) e.currentTarget.style.borderColor = 'var(--acc)';
            }}
            onMouseLeave={e => {
              if (!isSelected) {
                e.currentTarget.style.transform = '';
                e.currentTarget.style.zIndex = '';
                e.currentTarget.style.color = 'transparent';
                e.currentTarget.style.borderColor = borderColor;
              }
            }}
          >
            {slot.id}
            {slot.ismine && (
              <span style={{
                position: 'absolute', bottom: 2, right: 2,
                fontSize: 6, color: 'var(--acc)',
              }}>★</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
