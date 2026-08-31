'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../../../lib/supabase';
import { useRouter } from 'next/navigation';
import Sidebar from '../../../Sidebar';
import LineItemRow from '../../../LineItemRow';
import LineItemPicker from '../../../LineItemPicker';
import ClientCombobox from '../../nueva/ClientCombobox';
import TaxBreakdown from '../../../TaxBreakdown';
import { calcularIVU } from '../../../../lib/tax';
import { useTranslations } from 'next-intl';

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

export default function NuevaFacturaRecurrenteForm() {
  const router = useRouter();
  const t = useTranslations('facturas.newRecurringForm');
  const [clients, setClients] = useState([]);
  const [taxRules, setTaxRules] = useState([]);
  const [catalogItems, setCatalogItems] = useState([]);
  const [form, setForm] = useState({
    client_id: '', bill_to: 'person', notes: '', terms: '',
    frequency: 'monthly', next_run_date: todayISO(), due_days: 15,
  });
  const [items, setItems] = useState([{ type: 'labor', tax_category: 'labor', description: '', note: '', quantity: 1, unit_price: '', exempt: false }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.from('clients').select('id, name, company, client_type, email, report_name_source').order('name').then(({ data }) => setClients(data ?? []));
    supabase.from('tax_rules').select('client_type, line_item_type, rate').then(({ data }) => setTaxRules(data ?? []));
    supabase.from('catalog_items').select('*').order('item_code').then(({ data }) => setCatalogItems(data ?? []));
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const selectedClient = clients.find(c => c.id === form.client_id);
  const clientType = selectedClient?.client_type ?? 'final';
  const hasCompany = !!selectedClient?.company;

  const addItem = () => setItems(i => [...i, { type: 'labor', tax_category: 'labor', description: '', quantity: 1, unit_price: '', exempt: false }]);
  const addFromCatalog = catalogItem => setItems(i => [...i, {
    type: catalogItem.type, tax_category: catalogItem.tax_category,
    description: catalogItem.description, quantity: 1, unit_price: catalogItem.price ?? '', exempt: false,
  }]);
  const removeItem = idx => setItems(i => i.filter((_, n) => n !== idx));
  const setItem = (idx, k, v) => setItems(i => i.map((it, n) => n === idx ? { ...it, [k]: v } : it));
  const setItemType = (idx, type) => setItems(i => i.map((it, n) => n === idx ? { ...it, type, tax_category: type === 'fee' ? (it.tax_category || 'labor') : type } : it));

  const taxCalc = calcularIVU(items, clientType, taxRules);
  const fmt = n => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.client_id) { setError(t('errors.selectClient')); return; }
    if (!form.next_run_date) { setError(t('errors.selectNextRunDate')); return; }
    if (!items.some(i => i.description.trim())) { setError(t('errors.addLine')); return; }
    setSaving(true); setError('');

    const runDate = new Date(form.next_run_date + 'T00:00:00');

    const { data: recurring, error: err } = await supabase.from('recurring_invoices').insert([{
      client_id: form.client_id,
      bill_to: form.bill_to,
      frequency: form.frequency,
      day_of_month: form.frequency === 'weekly' ? null : runDate.getDate(),
      day_of_week: form.frequency === 'weekly' ? runDate.getDay() : null,
      due_days: parseInt(form.due_days) || 15,
      notes: form.notes || null,
      terms: form.terms || null,
      next_run_date: form.next_run_date,
      active: true,
    }]).select().single();

    if (err) { setError(err.message); setSaving(false); return; }

    const lineItems = items.filter(i => i.description.trim()).map((i, idx) => ({
      recurring_invoice_id: recurring.id, type: i.type, tax_category: i.tax_category || i.type, description: i.description, note: i.note?.trim() || null,
      quantity: parseFloat(i.quantity) || 1, unit_price: parseFloat(i.unit_price) || 0,
      exempt: i.exempt, sort_order: idx,
    }));

    await supabase.from('recurring_invoice_items').insert(lineItems);
    router.push('/facturas/recurrentes');
  }

  const periodKey = form.frequency === 'weekly' ? 'periodWeek' : 'periodMonth';

  return (
    <div className="admin-shell ds-facturas">
      <Sidebar />
      <main className="main-content">
        <div className="page-header"><div className="page-title">{t('title')}</div></div>
        <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {error && <p style={{ color: 'var(--warn)', fontSize: 14 }}>{error}</p>}

            <div className="card">
              <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 16 }}>{t('generalInfo')}</p>
              <div className="form-group">
                <label>{t('clientLabel')}</label>
                <ClientCombobox clients={clients} value={form.client_id} onChange={v => { const c = clients.find(cl => cl.id === v); set('client_id', v); set('bill_to', c?.report_name_source === 'company' ? 'company' : 'person'); }} />
              </div>

              {hasCompany && (
                <div className="form-group" style={{ marginTop: 4 }}>
                  <label>{t('billTo')}</label>
                  <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' }}>
                      <input type="radio" name="bill_to" value="person" checked={form.bill_to === 'person'} onChange={() => set('bill_to', 'person')} />
                      {selectedClient?.name}
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' }}>
                      <input type="radio" name="bill_to" value="company" checked={form.bill_to === 'company'} onChange={() => set('bill_to', 'company')} />
                      {selectedClient?.company}
                    </label>
                  </div>
                </div>
              )}

              {selectedClient && !selectedClient.email && (
                <p style={{ fontSize: 12.5, color: 'var(--warn)', marginTop: 4 }}>
                  {t('noEmailWarning')}
                </p>
              )}

              <div className="form-group">
                <label>{t('notesLabel')}</label>
                <textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder={t('notesPlaceholder')} />
              </div>
            </div>

            <div className="card">
              <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 16 }}>{t('recurrence')}</p>
              <div className="form-row">
                <div className="form-group">
                  <label>{t('freqLabel')}</label>
                  <select value={form.frequency} onChange={e => set('frequency', e.target.value)}>
                    <option value="weekly">{t('freq.weekly')}</option>
                    <option value="monthly">{t('freq.monthly')}</option>
                    <option value="quarterly">{t('freq.quarterly')}</option>
                    <option value="yearly">{t('freq.yearly')}</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>{t('nextRunLabel')}</label>
                  <input type="date" value={form.next_run_date} onChange={e => set('next_run_date', e.target.value)} />
                </div>
              </div>
              <div className="form-group" style={{ maxWidth: 200 }}>
                <label>{t('dueDaysLabel')}</label>
                <input type="number" min="0" value={form.due_days} onChange={e => set('due_days', e.target.value)} />
              </div>
              <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--muted)' }}>
                {t('autoSendText', { period: t(periodKey) })}
              </div>
            </div>

            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)' }}>{t('lineItems')}</p>
                <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }} onClick={addItem}>{t('addLine')}</button>
              </div>
              <div style={{ marginBottom: 16 }}>
                <LineItemPicker catalogOptions={catalogItems} onSelect={addFromCatalog} placeholder={t('catalogPlaceholder')} />
              </div>

              {items.map((item, idx) => (
                <LineItemRow
                  key={idx}
                  type={item.type}
                  onTypeChange={v => setItemType(idx, v)}
                  description={item.description}
                  onDescriptionChange={v => setItem(idx, 'description', v)}
                  note={item.note}
                  onNoteChange={v => setItem(idx, 'note', v)}
                  quantity={item.quantity}
                  onQuantityChange={v => setItem(idx, 'quantity', v)}
                  unitPrice={item.unit_price}
                  onUnitPriceChange={v => setItem(idx, 'unit_price', v)}
                  exempt={item.exempt}
                  onExemptChange={v => setItem(idx, 'exempt', v)}
                  fmt={fmt}
                  actions={
                    <button type="button" onClick={() => removeItem(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16 }}>×</button>
                  }
                />
              ))}
            </div>

            <div className="card">
              <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 16 }}>{t('projectTerms')}</p>
              <div className="form-group">
                <textarea value={form.terms} onChange={e => set('terms', e.target.value)} rows={4} style={{ fontSize: 13, lineHeight: 1.6 }} />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card">
              <TaxBreakdown
                lineas={items} clientType={clientType} taxRules={taxRules} title={t('taxSummaryTitle')}
                note={clientType === 'b2b' && (
                  <div style={{ background: 'var(--info-tint)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: 'var(--info)', fontWeight: 600 }}>
                    {t('b2bNote')}
                  </div>
                )}
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={saving} style={{ width: '100%', justifyContent: 'center', padding: '12px' }}>
              {saving ? t('saving') : t('saveRecurring')}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => router.back()} style={{ width: '100%', justifyContent: 'center' }}>{t('cancel')}</button>
          </div>
        </form>
      </main>
    </div>
  );
}
