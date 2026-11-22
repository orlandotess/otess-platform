'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';

// Palabras que indican una credencial dentro de una línea de la nota
// ("Nvr: admin pass: 1234", "Cam password: abc", "clave wifi = xyz").
// Se oculta lo que va DESPUÉS de la palabra clave; el resto de la línea queda visible.
const SECRET_RE = /(\b(?:pass(?:word|wd|code)?|pwd|contrase(?:ñ|n)a|clave|pin|c[oó]digo|code)\b[^\S\n]*[:=]?[^\S\n]*)(\S[^\n]*)$/i;

const MASK = '••••••';

function maskLine(line) {
  const m = line.match(SECRET_RE);
  if (!m) return { text: line, masked: false };
  // "Clave wifi: xyz" → conserva "wifi:" y oculta solo lo que sigue al separador.
  const sep = m[2].search(/[:=]/);
  if (sep >= 0) {
    const label = m[2].slice(0, sep + 1);
    const secret = m[2].slice(sep + 1).trim();
    if (!secret) return { text: line, masked: false };
    return { text: line.slice(0, m.index) + m[1] + label + ' ' + MASK, masked: true };
  }
  return { text: line.slice(0, m.index) + m[1] + MASK, masked: true };
}

const isVideo = url => /\.(mp4|mov|webm|avi)(\?|$)/i.test(url);
const isPdf = url => /\.pdf(\?|$)/i.test(url);

function NoteCard({ note, onOpenPhoto, t }) {
  const [revealed, setRevealed] = useState(false);
  const lines = (note.note ?? '').split('\n').map(maskLine);
  const hasSecrets = lines.some(l => l.masked);
  const shownText = revealed ? note.note : lines.map(l => l.text).join('\n');

  const photos = note.photo_urls?.length ? note.photo_urls : (note.photo_url ? [note.photo_url] : []);
  const thumbs = note.thumb_urls?.length ? note.thumb_urls : (note.thumb_url ? [note.thumb_url] : []);

  return (
    <div style={{ background: '#fff8ec', border: '1.5px solid #f0b45a', borderRadius: 14, padding: '14px 16px', marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: shownText || photos.length ? 8 : 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#16223d', textTransform: 'uppercase' }}>📌 {t('label')}</div>
        {hasSecrets && (
          <button
            type="button"
            onClick={() => setRevealed(r => !r)}
            aria-pressed={revealed}
            style={{ background: '#fff', border: '1px solid #f0b45a', borderRadius: 8, padding: '4px 10px', fontSize: 12, fontWeight: 700, color: '#16223d', cursor: 'pointer', flexShrink: 0 }}
          >
            {revealed ? `🙈 ${t('hide')}` : `👁 ${t('show')}`}
          </button>
        )}
      </div>
      {shownText && (
        <p style={{ fontSize: 14, color: '#1d2433', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', userSelect: revealed ? 'text' : 'none', marginBottom: photos.length ? 10 : 0 }}>
          {shownText}
        </p>
      )}
      {photos.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {photos.map((url, idx) => {
            if (!url) return null;
            if (isPdf(url)) return (
              <a key={idx} href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: '#fff', borderRadius: 8, textDecoration: 'none', border: '1px solid #dde1e7', fontSize: 12, fontWeight: 600, color: '#16223d' }}>📄 PDF</a>
            );
            if (isVideo(url)) return (
              <video key={idx} src={url} controls style={{ width: 90, height: 90, objectFit: 'cover', borderRadius: 8, background: '#000' }} />
            );
            return (
              <img key={idx} src={thumbs[idx] ?? url} alt={t('photoAlt')} onClick={() => onOpenPhoto(photos.filter(u => u && !isPdf(u) && !isVideo(u)), url)}
                style={{ width: 90, height: 90, objectFit: 'cover', borderRadius: 8, cursor: 'zoom-in' }} />
            );
          })}
        </div>
      )}
    </div>
  );
}

// Notas fijadas (📌) del cliente, solo lectura, arriba de la pestaña Info del trabajo.
export default function PinnedClientNotes({ notes, onOpenPhoto }) {
  const t = useTranslations('crew.app.jobDetail.clientNote');
  if (!notes?.length) return null;
  return notes.map(n => <NoteCard key={n.id} note={n} onOpenPhoto={onOpenPhoto} t={t} />);
}
