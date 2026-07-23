'use client';

import { useState, useEffect } from 'react';

export default function FaseDetalle({ phaseGroups }) {
  const labels = Object.keys(phaseGroups);
  const [activeLabel, setActiveLabel] = useState(labels[0]);
  const [printMode, setPrintMode] = useState(false);

  // The "Descargar PDF" button snapshots whatever is on screen, but the
  // selector only shows one phase at a time — expand every phase for the
  // duration of the capture so the PDF still has the full report.
  useEffect(() => {
    function expand() { setPrintMode(true); }
    function restore() { setPrintMode(false); }
    window.addEventListener('otess:print-start', expand);
    window.addEventListener('otess:print-end', restore);
    return () => {
      window.removeEventListener('otess:print-start', expand);
      window.removeEventListener('otess:print-end', restore);
    };
  }, []);

  function renderNotes(notesInGroup) {
    return (
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        {notesInGroup.map(n => (
          <li key={n.id} style={{ fontSize: 14, color: '#444', lineHeight: 1.7, marginBottom: 4 }}>
            <span>
              {n.title && <strong style={{ color: '#16223d' }}>{n.title}{n.note ? ': ' : ''}</strong>}
              {n.note}
            </span>
          </li>
        ))}
      </ul>
    );
  }

  if (printMode) {
    return (
      <div>
        {Object.entries(phaseGroups).map(([label, notesInGroup]) => (
          <div key={label} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', background: '#16223d', display: 'inline-block', padding: '4px 12px', borderRadius: 20, marginBottom: 10 }}>{label}</div>
            {renderNotes(notesInGroup)}
          </div>
        ))}
      </div>
    );
  }

  const activeNotes = phaseGroups[activeLabel] ?? [];

  return (
    <div>
      {labels.length > 1 && (
        <div data-html2canvas-ignore="true" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          {labels.map(label => (
            <button key={label} type="button" onClick={() => setActiveLabel(label)}
              style={{
                fontSize: 13, fontWeight: 700, padding: '4px 12px', borderRadius: 20, border: 'none', cursor: 'pointer',
                background: activeLabel === label ? '#16223d' : '#f0f0f0',
                color: activeLabel === label ? '#fff' : '#666',
              }}>
              {label}
            </button>
          ))}
        </div>
      )}
      {labels.length <= 1 && activeLabel && (
        <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', background: '#16223d', display: 'inline-block', padding: '4px 12px', borderRadius: 20, marginBottom: 10 }}>{activeLabel}</div>
      )}
      {renderNotes(activeNotes)}
    </div>
  );
}
