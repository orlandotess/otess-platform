'use client';
import { useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

export default function TechnicianAssign({ ticketId, technicians = [], technicianId }) {
  const t = useTranslations('boletos.technicianAssign');
  const router = useRouter();
  const [techId, setTechId] = useState(technicianId ?? '');
  const [saving, setSaving] = useState(false);

  async function assign(val) {
    setTechId(val);
    setSaving(true);
    await supabase.from('service_tickets').update({ technician_id: val || null, updated_at: new Date().toISOString() }).eq('id', ticketId);
    setSaving(false);
    router.refresh();
  }

  return (
    <select
      value={techId}
      onChange={e => assign(e.target.value)}
      disabled={saving}
      style={{ width: '100%', padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', color: 'var(--text)', background: 'var(--surface)', outline: 'none' }}
    >
      <option value="">{t('unassigned')}</option>
      {technicians.map(tech => (
        <option key={tech.id} value={tech.id}>{tech.name}</option>
      ))}
    </select>
  );
}
