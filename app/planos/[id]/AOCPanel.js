'use client';

// Equipment types that support an Area-of-Coverage (FOV) cone.
export const AOC_SUPPORTED_TYPES = new Set(['camera', 'access_point', 'motion_sensor']);

/**
 * AOCPanel — controls section rendered inside the marker popup for elements
 * that support Area of Coverage (cameras, WAPs, motion sensors): toggle,
 * direction/angle/radius sliders, color override, opacity.
 */
export default function AOCPanel({ equipmentType, systemColor, aoc, onChange }) {
  if (!AOC_SUPPORTED_TYPES.has(equipmentType)) return null;

  const displayColor = aoc.color ?? systemColor ?? '#e0972c';

  return (
    <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 12 }}>📐 Área de cobertura</span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={aoc.visible}
            onChange={e => onChange({ visible: e.target.checked })}
            style={{ accentColor: displayColor, width: 15, height: 15 }}
          />
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>{aoc.visible ? 'Visible' : 'Oculta'}</span>
        </label>
      </div>

      {aoc.visible && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <label style={{ fontSize: 11, color: 'var(--muted)' }}>Dirección</label>
              <span style={{ fontSize: 11, fontWeight: 600 }}>{Math.round(aoc.direction)}°</span>
            </div>
            <input
              type="range" min={0} max={359} step={1}
              value={Math.round(aoc.direction)}
              onChange={e => onChange({ direction: Number(e.target.value) })}
              style={{ width: '100%', accentColor: displayColor }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--muted)', marginTop: 1 }}>
              <span>0°→</span><span>↓90°</span><span>←180°</span><span>↑270°</span>
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <label style={{ fontSize: 11, color: 'var(--muted)' }}>Ángulo FOV</label>
              <span style={{ fontSize: 11, fontWeight: 600 }}>{Math.round(aoc.angle)}°</span>
            </div>
            <input
              type="range" min={5} max={360} step={1}
              value={Math.round(aoc.angle)}
              onChange={e => onChange({ angle: Number(e.target.value) })}
              style={{ width: '100%', accentColor: displayColor }}
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <label style={{ fontSize: 11, color: 'var(--muted)' }}>Radio</label>
              <span style={{ fontSize: 11, fontWeight: 600 }}>{Math.round(aoc.radius)}</span>
            </div>
            <input
              type="range" min={20} max={600} step={5}
              value={Math.round(aoc.radius)}
              onChange={e => onChange({ radius: Number(e.target.value) })}
              style={{ width: '100%', accentColor: displayColor }}
            />
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div>
              <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>Color</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                  type="color"
                  value={displayColor}
                  onChange={e => onChange({ color: e.target.value })}
                  style={{ width: 28, height: 24, padding: 0, border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}
                />
                <button
                  type="button"
                  onClick={() => onChange({ color: null })}
                  title="Restaurar color del sistema"
                  style={{ fontSize: 9, padding: '2px 5px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', color: 'var(--muted)' }}
                >
                  Reset
                </button>
              </div>
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <label style={{ fontSize: 11, color: 'var(--muted)' }}>Opacidad</label>
                <span style={{ fontSize: 11, fontWeight: 600 }}>{Math.round(aoc.opacity * 100)}%</span>
              </div>
              <input
                type="range" min={0} max={1} step={0.05}
                value={aoc.opacity}
                onChange={e => onChange({ opacity: Number(e.target.value) })}
                style={{ width: '100%', accentColor: displayColor }}
              />
            </div>
          </div>

          <div style={{ height: 6, borderRadius: 4, background: displayColor, opacity: aoc.opacity, border: '1px solid var(--border)' }} />

        </div>
      )}
    </div>
  );
}
