'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { formatDateTimePR } from '../../lib/datetimeLocal';

// Envío programado por email (facturas y estimados). El diálogo de cada
// documento pone <ScheduleSendPicker> debajo de los CC y, al enviar en modo
// "schedule", llama a scheduleSend(). <ScheduledSendBadges> muestra los envíos
// pendientes junto a los botones, con una ✕ para cancelarlos.
// API: app/api/scheduled-emails. Cron: app/api/scheduled-emails/run.

// Puerto Rico no cambia de hora (UTC-4 todo el año), así que la fecha y hora
// que se escogen se interpretan siempre como hora de PR, sin importar la zona
// del navegador.
const PR_OFFSET = '-04:00';
export const DEFAULT_SEND_TIME = '08:00';

export function todayPR() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Puerto_Rico', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function addDays(ymd, n) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function nextMondayPR() {
  const today = todayPR();
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay(); // 0 = domingo
  return addDays(today, ((8 - dow) % 7) || 7);
}

const prToIso = (date, time) => new Date(`${date}T${time}:00${PR_OFFSET}`).toISOString();

// Estado del selector para un diálogo de envío.
export function useScheduleSend() {
  const [mode, setMode] = useState('now');
  const [date, setDate] = useState('');
  const [time, setTime] = useState(DEFAULT_SEND_TIME);
  return { mode, setMode, date, setDate, time, setTime, reset: () => setMode('now') };
}

// Programa el envío. `doc` es { invoiceId } o { estimateId }.
// Devuelve { ok: true } o { ok: false, error } con el mensaje ya traducido.
export async function scheduleSend(schedule, doc, toEmail, cc, t) {
  if (!schedule.date || !schedule.time) return { ok: false, error: t('missing') };
  const sendAt = prToIso(schedule.date, schedule.time);
  if (new Date(sendAt).getTime() <= Date.now() + 60_000) return { ok: false, error: t('past') };
  const res = await fetch('/api/scheduled-emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...doc, toEmail, cc, sendAt }),
  });
  const data = await res.json().catch(() => ({}));
  return data.success ? { ok: true } : { ok: false, error: data.error ?? `HTTP ${res.status}` };
}

export function ScheduleSendPicker({ schedule }) {
  const t = useTranslations('scheduleSend');
  const { mode, setMode, date, setDate, time, setTime } = schedule;
  const pick = d => { setDate(d); setTime(DEFAULT_SEND_TIME); };
  const presets = [
    { key: 'tomorrow', date: addDays(todayPR(), 1) },
    { key: 'nextMonday', date: nextMondayPR() },
  ];
  return (
    <div className="form-group" style={{ marginBottom: 20 }}>
      <label>{t('when')}</label>
      <div style={{ display: 'flex', gap: 6 }}>
        {['now', 'schedule'].map(m => (
          <button key={m} type="button" aria-pressed={mode === m}
            onClick={() => { setMode(m); if (m === 'schedule' && !date) pick(nextMondayPR()); }}
            style={{ flex: 1, padding: '9px 10px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', border: `1.5px solid ${mode === m ? 'var(--navy)' : 'var(--border)'}`, background: mode === m ? 'var(--navy)' : 'var(--surface)', color: mode === m ? '#fff' : 'var(--text)' }}>
            {m === 'now' ? `⚡ ${t('now')}` : `📅 ${t('schedule')}`}
          </button>
        ))}
      </div>
      {mode === 'schedule' && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {presets.map(p => (
              <button key={p.key} type="button" onClick={() => pick(p.date)}
                className="btn btn-ghost" style={{ fontSize: 12.5, padding: '6px 10px', borderColor: date === p.date && time === DEFAULT_SEND_TIME ? 'var(--navy)' : undefined }}>
                {t(`preset.${p.key}`)}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="date" value={date} min={todayPR()} onChange={e => setDate(e.target.value)} required style={{ flex: 3 }} />
            <input type="time" value={time} onChange={e => setTime(e.target.value)} step={900} required style={{ flex: 2 }} />
          </div>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '8px 0 0' }}>{t('hint')}</p>
        </div>
      )}
    </div>
  );
}

export function ScheduledSendBadges({ items = [] }) {
  const t = useTranslations('scheduleSend');
  const locale = useLocale();
  const router = useRouter();
  const [cancellingId, setCancellingId] = useState(null);

  async function cancel(id) {
    if (!confirm(t('confirmCancel'))) return;
    setCancellingId(id);
    const res = await fetch(`/api/scheduled-emails?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    setCancellingId(null);
    if (!data.success) alert(t('error', { error: data.error ?? `HTTP ${res.status}` }));
    router.refresh();
  }

  return items.map(s => (
    <span key={s.id} className="badge" title={s.to_email} style={{ padding: '6px 8px 6px 14px', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--info-tint)', color: 'var(--navy)' }}>
      📅 {t('badge', { when: formatDateTimePR(s.send_at, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }, locale === 'en' ? 'en-US' : 'es-PR') })}
      <button type="button" onClick={() => cancel(s.id)} disabled={cancellingId === s.id} aria-label={t('cancel')} title={t('cancel')}
        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--muted)', padding: '0 4px' }}>✕</button>
    </span>
  ));
}
