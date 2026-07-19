'use client';
import { useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import SearchBox from '../SearchBox';
import { formatDatePR } from '../../lib/datetimeLocal';
import OpportunityModal, { emptyOpportunity } from './OpportunityModal';
import StagesModal from './StagesModal';

const money = v => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

function followUpBadge(opp) {
  if (!opp.next_follow_up || opp.status !== 'open') return null;
  const today = new Date(new Date().toDateString());
  const due = new Date(opp.next_follow_up + 'T00:00:00');
  const days = (due - today) / 86400000;
  if (days < 0) return { cls: 'badge-red', label: 'Seguimiento atrasado' };
  if (days === 0) return { cls: 'badge-amber', label: 'Seguimiento hoy' };
  return { cls: 'badge-blue', label: formatDatePR(opp.next_follow_up) };
}

function OppCard({ opp, dragId, setDragId, onOpen }) {
  const fu = followUpBadge(opp);
  const subtitle = opp.clients?.name || opp.company_name || opp.contact_name;
  return (
    <div
      className={`opp-card ${dragId === opp.id ? 'dragging' : ''} ${opp.status === 'won' ? 'won' : opp.status === 'lost' ? 'lost' : ''}`}
      draggable
      onDragStart={() => setDragId(opp.id)}
      onDragEnd={() => setDragId(null)}
      onClick={() => onOpen(opp)}
    >
      <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--navy)', marginBottom: subtitle ? 4 : 8 }}>{opp.name}</div>
      {subtitle && <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>{subtitle}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--navy)' }}>{money(opp.value)}</span>
        {opp.technicians?.name && <span className="badge badge-dark" style={{ fontSize: 10.5 }}>{opp.technicians.name}</span>}
      </div>
      {(opp.status !== 'open' || fu) && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          {opp.status === 'won' && <span className="badge badge-green">Ganado</span>}
          {opp.status === 'lost' && <span className="badge badge-gray">Perdido</span>}
          {fu && <span className={`badge ${fu.cls}`}>{fu.label}</span>}
        </div>
      )}
    </div>
  );
}

export default function OportunidadesBoard({ initialStages, initialOpportunities, technicians, clients }) {
  const [stages, setStages] = useState(initialStages);
  const [opportunities, setOpportunities] = useState(initialOpportunities);
  const [clientList, setClientList] = useState(clients);
  const [search, setSearch] = useState('');
  const [dragId, setDragId] = useState(null);
  const [overKey, setOverKey] = useState(null);
  const [editing, setEditing] = useState(null); // null closed, object = editing/new
  const [showStages, setShowStages] = useState(false);

  const query = search.trim().toLowerCase();
  const visible = query
    ? opportunities.filter(o =>
        (o.name ?? '').toLowerCase().includes(query) ||
        (o.company_name ?? '').toLowerCase().includes(query) ||
        (o.contact_name ?? '').toLowerCase().includes(query) ||
        (o.clients?.name ?? '').toLowerCase().includes(query))
    : opportunities;

  const byStage = useMemo(() => {
    const map = {};
    for (const s of stages) map[s.key] = [];
    for (const o of visible) (map[o.stage_key] ??= []).push(o);
    return map;
  }, [stages, visible]);

  const opportunityCounts = useMemo(() => {
    const map = {};
    for (const o of opportunities) map[o.stage_key] = (map[o.stage_key] ?? 0) + 1;
    return map;
  }, [opportunities]);

  async function handleDrop(stageKey) {
    const id = dragId;
    setDragId(null);
    setOverKey(null);
    if (!id) return;
    const current = opportunities.find(o => o.id === id);
    if (!current || current.stage_key === stageKey) return;
    setOpportunities(prev => prev.map(o => o.id === id ? { ...o, stage_key: stageKey } : o));
    const { error } = await supabase.from('opportunities').update({ stage_key: stageKey, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) {
      setOpportunities(prev => prev.map(o => o.id === id ? { ...o, stage_key: current.stage_key } : o));
      alert('No se pudo mover la oportunidad: ' + error.message);
    }
  }

  function handleSaved(row, wasNew) {
    setOpportunities(prev => wasNew ? [row, ...prev] : prev.map(o => o.id === row.id ? row : o));
    setEditing(null);
  }

  function handleDeleted(id) {
    setOpportunities(prev => prev.filter(o => o.id !== id));
    setEditing(null);
  }

  function handleClientCreated(client) {
    setClientList(prev => [...prev, client].sort((a, b) => a.name.localeCompare(b.name)));
  }

  function handleStagesSaved(freshStages) {
    setStages(freshStages);
    const validKeys = new Set(freshStages.map(s => s.key));
    setOpportunities(prev => prev.filter(o => validKeys.has(o.stage_key)));
    setShowStages(false);
  }

  return (
    <>
      <div className="page-header">
        <div className="page-title">Oportunidades</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost" onClick={() => setShowStages(true)}>⚙ Configurar Etapas</button>
          <button className="btn btn-primary" onClick={() => setEditing(emptyOpportunity(stages[0]?.key))} disabled={!stages.length}>
            + Crear Oportunidad
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 18, maxWidth: 340 }}>
        <SearchBox value={search} onChange={setSearch} placeholder="Buscar oportunidad, cliente o contacto..." />
      </div>

      {!stages.length ? (
        <div className="card">
          <div className="empty">
            <div className="empty-glyph">🎯</div>
            <h3>No hay etapas configuradas</h3>
            <p>Crea al menos una etapa para empezar a registrar oportunidades.</p>
            <button className="btn btn-primary btn-sm" onClick={() => setShowStages(true)}>Configurar Etapas</button>
          </div>
        </div>
      ) : (
        <div className="opp-board">
          {stages.map(stage => {
            const cards = byStage[stage.key] ?? [];
            const total = cards.reduce((sum, o) => sum + Number(o.value || 0), 0);
            return (
              <div
                key={stage.key}
                className={`opp-column ${overKey === stage.key ? 'drag-over' : ''}`}
                onDragOver={e => { if (dragId) { e.preventDefault(); setOverKey(stage.key); } }}
                onDragLeave={() => setOverKey(k => k === stage.key ? null : k)}
                onDrop={e => { e.preventDefault(); handleDrop(stage.key); }}
              >
                <div className="opp-column-header">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 700, color: 'var(--navy)', fontSize: 14 }}>{stage.label}</div>
                    <span className="badge badge-gray">{cards.length}</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4, fontWeight: 600 }}>{money(total)}</div>
                </div>
                <div className="opp-column-cards">
                  {cards.length === 0 ? (
                    <div style={{ fontSize: 12.5, color: 'var(--muted)', textAlign: 'center', padding: '24px 8px' }}>Sin oportunidades</div>
                  ) : (
                    cards.map(opp => (
                      <OppCard key={opp.id} opp={opp} dragId={dragId} setDragId={setDragId} onOpen={setEditing} />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <OpportunityModal
          opp={editing}
          stages={stages}
          technicians={technicians}
          clients={clientList}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
          onClientCreated={handleClientCreated}
        />
      )}

      {showStages && (
        <StagesModal
          stages={stages}
          opportunityCounts={opportunityCounts}
          onClose={() => setShowStages(false)}
          onSaved={handleStagesSaved}
        />
      )}
    </>
  );
}
