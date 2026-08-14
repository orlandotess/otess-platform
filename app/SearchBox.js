'use client';
import { useTranslations } from 'next-intl';

export default function SearchBox({ value, onChange, placeholder, style }) {
  const t = useTranslations('shared.searchBox');
  return (
    <div style={{ position: 'relative', maxWidth: 280, ...style }}>
      <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'var(--muted)', pointerEvents: 'none' }}>🔍</span>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? t('placeholderDefault')}
        style={{ padding: '8px 12px 8px 32px', fontSize: 13, width: '100%' }}
      />
    </div>
  );
}
