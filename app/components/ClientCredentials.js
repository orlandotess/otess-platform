'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { supabase } from '../../lib/supabase';
import { formatDateTimePR } from '../../lib/datetimeLocal';

// Credenciales del cliente (NVR, cámaras, wifi…). Todo pasa por las funciones
// RPC de migrations/2026-11-22-client-credentials.sql: la contraseña está
// cifrada en Supabase Vault y solo se pide al servidor al tocar Mostrar/Copiar,
// lo que deja registro de quién la vio. Lo usan la ficha del cliente (oficina)
// y la crew app (dentro de un trabajo).

const KINDS = ['nvr', 'camara', 'wifi', 'alarma', 'router', 'porton', 'otro'];
const KIND_ICON = { nvr: '📼', camara: '📷', wifi: '📶', alarma: '🚨', router: '🌐', porton: '🚪', otro: '🔑' };
const REVEAL_SECONDS = 30;
const MASK = '••••••••';

const PALETTES = {
  admin: {
    card: 'var(--surface)', cardBorder: 'var(--border)', text: 'var(--text)', muted: 'var(--muted)',
    accent: 'var(--navy)', soft: 'var(--navy-tint)', danger: 'var(--warn)', ok: 'var(--ok)',
    input: 'var(--surface)', inputBorder: 'var(--border)', primary: 'var(--navy)', primaryText: 'var(--surface)',
  },
  crew: {
    card: '#fff', cardBorder: '#dde1e7', text: '#1d2433', muted: '#888', accent: '#16223d', soft: '#eef1f6',
    danger: '#b5471b', ok: '#1a7a4a', input: '#fff', inputBorder: '#cfd5de', primary: '#E05C2A', primaryText: '#fff',
  },
};

const EMPTY_FORM = { id: null, kind: 'nvr', label: '', property_id: '', username: '', host: '', notes: '', secret: '' };

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const el = document.createElement('textarea');
      el.value = text;
      el.setAttribute('readonly', '');
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(el);
      return ok;
    } catch { return false; }
  }
}

export default function ClientCredentials({
  clientId,
  jobId = null,
  propertyId = null,
  properties: propsProperties = null,
  variant = 'admin',
  canDelete = false,
  showLog = false,
  hideWhenNoAccess = false,
}) {
  const t = useTranslations('clientCredentials');
  const locale = useLocale();
  const dateLocale = locale === 'en' ? 'en-US' : 'es-PR';
  const P = PALETTES[variant] ?? PALETTES.admin;

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [noAccess, setNoAccess] = useState(false);
  const [error, setError] = useState('');
  const [properties, setProperties] = useState(propsProperties ?? []);
  const [form, setForm] = useState(null); // null = cerrado; objeto = creando/editando
  const [saving, setSaving] = useState(false);
  const [revealed, setRevealed] = useState({}); // id -> texto
  const [busy, setBusy] = useState({}); // id -> true mientras pide la contraseña
  const [flash, setFlash] = useState(null); // { id, field } recién copiado
  const [logOpen, setLogOpen] = useState(false);
  const [log, setLog] = useState(null);
  const timers = useRef({});

  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), []);

  const load = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    setError('');
    const { data, error: err } = await supabase.rpc('list_client_credentials', { p_client_id: clientId });
    if (err) {
      if (err.code === '42501') setNoAccess(true);
      else setError('load');
      setItems([]);
    } else {
      setNoAccess(false);
      setItems(data ?? []);
    }
    setLoading(false);
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (propsProperties) { setProperties(propsProperties); return; }
    if (!clientId) return;
    supabase.from('client_properties').select('id, name, street, city').eq('client_id', clientId)
      .then(({ data }) => setProperties(data ?? []));
  }, [clientId, propsProperties]);

  const propertyName = id => {
    const p = properties.find(x => x.id === id);
    return p ? (p.name || [p.street, p.city].filter(Boolean).join(', ')) : null;
  };

  function hideLater(id) {
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(() => {
      setRevealed(r => { const n = { ...r }; delete n[id]; return n; });
    }, REVEAL_SECONDS * 1000);
  }

  async function fetchSecret(id) {
    if (revealed[id] !== undefined) return revealed[id];
    setBusy(b => ({ ...b, [id]: true }));
    const { data, error: err } = await supabase.rpc('reveal_client_credential', { p_id: id, p_job_id: jobId });
    setBusy(b => { const n = { ...b }; delete n[id]; return n; });
    if (err) { setError('reveal'); return null; }
    return data ?? '';
  }

  async function toggleReveal(id) {
    if (revealed[id] !== undefined) {
      clearTimeout(timers.current[id]);
      setRevealed(r => { const n = { ...r }; delete n[id]; return n; });
      return;
    }
    const secret = await fetchSecret(id);
    if (secret === null) return;
    setRevealed(r => ({ ...r, [id]: secret }));
    hideLater(id);
    if (logOpen) loadLog();
  }

  async function copy(id, field, value) {
    let text = value;
    if (field === 'secret') {
      text = await fetchSecret(id);
      if (text === null) return;
      if (logOpen) loadLog();
    }
    if (await copyText(text ?? '')) {
      setFlash({ id, field });
      setTimeout(() => setFlash(f => (f && f.id === id && f.field === field ? null : f)), 1500);
    }
  }

  function openNew() {
    setError('');
    setForm({ ...EMPTY_FORM, property_id: propertyId ?? (properties.length === 1 ? properties[0].id : '') });
  }

  function openEdit(c) {
    setError('');
    setForm({ id: c.id, kind: c.kind, label: c.label, property_id: c.property_id ?? '', username: c.username ?? '', host: c.host ?? '', notes: c.notes ?? '', secret: '', had_secret: c.has_secret, clear_secret: false });
  }

  async function save(e) {
    e.preventDefault();
    if (!form.label.trim()) { setError('labelRequired'); return; }
    setSaving(true);
    setError('');
    // Al editar: contraseña vacía = no cambiarla (null); "quitar" = ''.
    const secret = form.id
      ? (form.clear_secret ? '' : (form.secret ? form.secret : null))
      : (form.secret || null);
    const { error: err } = await supabase.rpc('save_client_credential', {
      p_id: form.id,
      p_client_id: clientId,
      p_property_id: form.property_id || null,
      p_kind: form.kind,
      p_label: form.label,
      p_username: form.username,
      p_host: form.host,
      p_notes: form.notes,
      p_secret: secret,
    });
    setSaving(false);
    if (err) { setError('save'); return; }
    if (form.id) {
      clearTimeout(timers.current[form.id]);
      setRevealed(r => { const n = { ...r }; delete n[form.id]; return n; });
    }
    setForm(null);
    load();
  }

  async function remove(c) {
    if (!window.confirm(t('confirmDelete', { label: c.label }))) return;
    const { error: err } = await supabase.rpc('delete_client_credential', { p_id: c.id });
    if (err) { setError('delete'); return; }
    load();
    if (logOpen) loadLog();
  }

  async function loadLog() {
    const { data, error: err } = await supabase.rpc('list_client_credential_views', { p_client_id: clientId });
    setLog(err ? [] : (data ?? []));
  }

  if (noAccess && hideWhenNoAccess) return null;

  // En un trabajo con propiedad, primero las de esa propiedad (y las generales).
  const sorted = propertyId
    ? [...items].sort((a, b) => {
        const rank = c => (c.property_id === propertyId ? 0 : c.property_id ? 2 : 1);
        return rank(a) - rank(b);
      })
    : items;

  const S = {
    wrap: { background: P.card, border: `1px solid ${P.cardBorder}`, borderRadius: 14, padding: variant === 'crew' ? '16px 18px' : 20, marginBottom: 12, color: P.text, boxShadow: variant === 'crew' ? '0 1px 4px rgba(0,0,0,0.06)' : undefined },
    title: { fontSize: variant === 'crew' ? 12 : 13, fontWeight: 700, color: variant === 'crew' ? P.muted : P.accent, textTransform: variant === 'crew' ? 'uppercase' : undefined },
    item: { border: `1px solid ${P.cardBorder}`, borderRadius: 12, padding: '12px 14px', marginTop: 10 },
    row: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, marginTop: 6, flexWrap: 'wrap' },
    key: { color: P.muted, fontSize: 12, fontWeight: 600, minWidth: 82 },
    mono: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', wordBreak: 'break-all' },
    btn: { background: P.soft, color: P.accent, border: 'none', borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 },
    ghost: { background: 'none', border: `1px solid ${P.cardBorder}`, color: P.accent, borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
    primary: { background: P.primary, color: P.primaryText, border: 'none', borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
    input: { width: '100%', padding: '9px 11px', fontSize: 14, borderRadius: 8, border: `1px solid ${P.inputBorder}`, background: P.input, color: P.text, boxSizing: 'border-box' },
    label: { display: 'block', fontSize: 12, fontWeight: 600, color: P.muted, margin: '10px 0 4px' },
  };

  const copied = (id, field) => flash && flash.id === id && flash.field === field;

  return (
    <div style={S.wrap}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={S.title}>🔐 {t('title')}</div>
        {!noAccess && !form && (
          <button type="button" style={S.ghost} onClick={openNew}>+ {t('add')}</button>
        )}
      </div>

      {error && <div role="alert" style={{ color: P.danger, fontSize: 13, marginTop: 8 }}>{t(`errors.${error}`)}</div>}

      {form && (
        <form onSubmit={save} style={{ ...S.item, background: P.soft }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{form.id ? t('form.editTitle') : t('form.newTitle')}</div>
          <label style={S.label} htmlFor="cc-kind">{t('form.kind')}</label>
          <select id="cc-kind" style={S.input} value={form.kind} onChange={e => setForm(f => ({ ...f, kind: e.target.value }))}>
            {KINDS.map(k => <option key={k} value={k}>{KIND_ICON[k]} {t(`kinds.${k}`)}</option>)}
          </select>
          <label style={S.label} htmlFor="cc-label">{t('form.label')}</label>
          <input id="cc-label" style={S.input} value={form.label} placeholder={t('form.labelPlaceholder')} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} autoFocus />
          {properties.length > 0 && (
            <>
              <label style={S.label} htmlFor="cc-prop">{t('form.property')}</label>
              <select id="cc-prop" style={S.input} value={form.property_id} onChange={e => setForm(f => ({ ...f, property_id: e.target.value }))}>
                <option value="">{t('form.allProperties')}</option>
                {properties.map(p => <option key={p.id} value={p.id}>{propertyName(p.id)}</option>)}
              </select>
            </>
          )}
          <label style={S.label} htmlFor="cc-user">{t('form.username')}</label>
          <input id="cc-user" style={S.input} value={form.username} autoComplete="off" autoCapitalize="off" spellCheck={false} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
          <label style={S.label} htmlFor="cc-secret">{t('form.secret')}</label>
          <input id="cc-secret" style={S.input} type="text" value={form.secret} disabled={form.clear_secret}
            autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} data-1p-ignore data-lpignore="true"
            placeholder={form.id && form.had_secret ? t('form.secretKeep') : ''}
            onChange={e => setForm(f => ({ ...f, secret: e.target.value }))} />
          {form.id && form.had_secret && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: P.muted, marginTop: 6 }}>
              <input type="checkbox" checked={form.clear_secret} onChange={e => setForm(f => ({ ...f, clear_secret: e.target.checked, secret: '' }))} />
              {t('form.clearSecret')}
            </label>
          )}
          <label style={S.label} htmlFor="cc-host">{t('form.host')}</label>
          <input id="cc-host" style={S.input} value={form.host} placeholder="192.168.1.10" autoComplete="off" autoCapitalize="off" spellCheck={false} onChange={e => setForm(f => ({ ...f, host: e.target.value }))} />
          <label style={S.label} htmlFor="cc-notes">{t('form.notes')}</label>
          <textarea id="cc-notes" style={{ ...S.input, minHeight: 60, resize: 'vertical' }} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
            <button type="button" style={S.ghost} onClick={() => { setForm(null); setError(''); }}>{t('form.cancel')}</button>
            <button type="submit" style={{ ...S.primary, opacity: saving ? 0.6 : 1 }} disabled={saving}>{saving ? t('form.saving') : t('form.save')}</button>
          </div>
        </form>
      )}

      {loading ? (
        <div style={{ color: P.muted, fontSize: 13, marginTop: 10 }}>{t('loading')}</div>
      ) : noAccess ? (
        <div style={{ color: P.muted, fontSize: 13, marginTop: 10 }}>{t('noAccess')}</div>
      ) : sorted.length === 0 && !form ? (
        <div style={{ color: P.muted, fontSize: 13, marginTop: 10 }}>{t('empty')}</div>
      ) : (
        sorted.map(c => {
          const prop = c.property_id ? propertyName(c.property_id) : null;
          const isShown = revealed[c.id] !== undefined;
          return (
            <div key={c.id} style={S.item}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14.5 }}>{KIND_ICON[c.kind] ?? '🔑'} {c.label}</div>
                  <div style={{ fontSize: 12, color: P.muted, marginTop: 2 }}>
                    {t(`kinds.${c.kind}`)}{prop ? ` · 📍 ${prop}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button type="button" style={S.ghost} onClick={() => openEdit(c)} aria-label={t('editAria', { label: c.label })}>✏️</button>
                  {canDelete && (
                    <button type="button" style={{ ...S.ghost, color: P.danger }} onClick={() => remove(c)} aria-label={t('deleteAria', { label: c.label })}>🗑</button>
                  )}
                </div>
              </div>

              {c.username && (
                <div style={S.row}>
                  <span style={S.key}>{t('fields.username')}</span>
                  <span style={{ ...S.mono, flex: 1 }}>{c.username}</span>
                  <button type="button" style={S.btn} onClick={() => copy(c.id, 'user', c.username)}>{copied(c.id, 'user') ? `✓ ${t('copied')}` : `📋 ${t('copy')}`}</button>
                </div>
              )}

              {c.has_secret && (
                <div style={S.row}>
                  <span style={S.key}>{t('fields.secret')}</span>
                  <span style={{ ...S.mono, flex: 1, userSelect: isShown ? 'text' : 'none' }}>{isShown ? revealed[c.id] : MASK}</span>
                  <button type="button" style={S.btn} disabled={busy[c.id]} aria-pressed={isShown} onClick={() => toggleReveal(c.id)}>
                    {isShown ? `🙈 ${t('hide')}` : `👁 ${t('show')}`}
                  </button>
                  <button type="button" style={S.btn} disabled={busy[c.id]} onClick={() => copy(c.id, 'secret')}>
                    {copied(c.id, 'secret') ? `✓ ${t('copied')}` : `📋 ${t('copy')}`}
                  </button>
                </div>
              )}

              {c.host && (
                <div style={S.row}>
                  <span style={S.key}>{t('fields.host')}</span>
                  <span style={{ ...S.mono, flex: 1 }}>{c.host}</span>
                  <button type="button" style={S.btn} onClick={() => copy(c.id, 'host', c.host)}>{copied(c.id, 'host') ? `✓ ${t('copied')}` : `📋 ${t('copy')}`}</button>
                </div>
              )}

              {c.notes && <div style={{ fontSize: 13, color: P.text, marginTop: 8, whiteSpace: 'pre-wrap' }}>{c.notes}</div>}
              {isShown && <div style={{ fontSize: 11, color: P.muted, marginTop: 6 }}>{t('autoHide', { seconds: REVEAL_SECONDS })}</div>}
              {variant === 'admin' && c.updated_by && (
                <div style={{ fontSize: 11, color: P.muted, marginTop: 6 }}>
                  {t('updatedBy', { name: c.updated_by, date: formatDateTimePR(c.updated_at, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }, dateLocale) })}
                </div>
              )}
            </div>
          );
        })
      )}

      {showLog && !noAccess && (
        <div style={{ marginTop: 16 }}>
          <button type="button" style={S.ghost} aria-expanded={logOpen} onClick={() => { const next = !logOpen; setLogOpen(next); if (next) loadLog(); }}>
            {logOpen ? '▾' : '▸'} {t('log.title')}
          </button>
          {logOpen && (
            log === null ? (
              <div style={{ color: P.muted, fontSize: 13, marginTop: 8 }}>{t('loading')}</div>
            ) : log.length === 0 ? (
              <div style={{ color: P.muted, fontSize: 13, marginTop: 8 }}>{t('log.empty')}</div>
            ) : (
              <div className="table-wrap" style={{ marginTop: 8 }}>
                <table>
                  <thead>
                    <tr>
                      <th>{t('log.when')}</th>
                      <th>{t('log.who')}</th>
                      <th>{t('log.credential')}</th>
                      <th>{t('log.job')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {log.map(v => (
                      <tr key={v.id}>
                        <td style={{ fontSize: 13, color: P.muted, whiteSpace: 'nowrap' }}>{formatDateTimePR(v.viewed_at, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }, dateLocale)}</td>
                        <td style={{ fontSize: 13 }}>{v.viewer_name || v.viewer_email || '—'}</td>
                        <td style={{ fontSize: 13 }}>{v.credential_label}</td>
                        <td style={{ fontSize: 13 }}>{v.job_number ? (v.job_id ? <a href={`/trabajos/${v.job_id}`}>#{v.job_number}</a> : `#${v.job_number}`) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
