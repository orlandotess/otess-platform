// Built-in equipment types for the Planos floor-plan editor. Each icon is a
// set of SVG child elements in a 24x24 viewBox, matching the line-icon style
// used in Sidebar.js's ICON_PATHS, so it can be dropped into an SVG <g> at
// any marker position/scale.
export const EQUIPMENT_TYPES = [
  {
    key: 'camera',
    label: 'Cámara',
    color: '#2a4cb5',
    icon: <>
      <path d="M3 8 h11 a2 2 0 0 1 2 2 v6 a2 2 0 0 1 -2 2 H3 a2 2 0 0 1 -2 -2 v-6 a2 2 0 0 1 2 -2 z" />
      <path d="M16 10.5 L21.5 7.5 v9 L16 13.5" />
      <circle cx="8.5" cy="13" r="2.3" />
    </>,
  },
  {
    key: 'access_control',
    label: 'Control de Acceso',
    color: '#1a7a4a',
    icon: <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <circle cx="12" cy="10" r="2.6" />
      <path d="M8 18 a4 4 0 0 1 8 0" />
    </>,
  },
  {
    key: 'access_point',
    label: 'Punto de Acceso (AP)',
    color: '#e0972c',
    icon: <>
      <circle cx="12" cy="18" r="1.4" fill="currentColor" stroke="none" />
      <path d="M8.5 15 a5 5 0 0 1 7 0" />
      <path d="M5.5 12 a9.5 9.5 0 0 1 13 0" />
      <path d="M2.5 9 a14 14 0 0 1 19 0" />
    </>,
  },
  {
    key: 'door_contact',
    label: 'Contacto de Puerta',
    color: '#8e44ad',
    icon: <>
      <rect x="5" y="3" width="12" height="18" rx="1" />
      <path d="M17 6 L21 5 v14 l-4 -1" />
      <circle cx="13.5" cy="12" r="1" fill="currentColor" stroke="none" />
    </>,
  },
  {
    key: 'keypad',
    label: 'Teclado',
    color: '#c0392b',
    icon: <>
      <rect x="6" y="2.5" width="12" height="19" rx="2" />
      <circle cx="9.3" cy="7.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="12" cy="7.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="14.7" cy="7.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="9.3" cy="11" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="12" cy="11" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="14.7" cy="11" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="9.3" cy="14.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="12" cy="14.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="14.7" cy="14.5" r="0.9" fill="currentColor" stroke="none" />
      <line x1="9" y1="18" x2="15" y2="18" />
    </>,
  },
  {
    key: 'nvr_dvr',
    label: 'NVR / DVR',
    color: '#16223d',
    icon: <>
      <rect x="2.5" y="7" width="19" height="10" rx="1.5" />
      <line x1="2.5" y1="11" x2="21.5" y2="11" />
      <circle cx="18.5" cy="9" r="0.7" fill="currentColor" stroke="none" />
    </>,
  },
  {
    key: 'motion_sensor',
    label: 'Sensor de Movimiento',
    color: '#e05c2a',
    icon: <>
      <path d="M12 3 a7 7 0 0 1 7 7 c0 4.5 -7 11 -7 11 s-7 -6.5 -7 -11 a7 7 0 0 1 7 -7 z" />
      <circle cx="12" cy="10" r="2.4" />
    </>,
  },
  {
    key: 'speaker',
    label: 'Bocina',
    color: '#0891b2',
    icon: <>
      <path d="M11 5 L6 9 H2 v6 h4 l5 4 z" />
      <path d="M15.5 8.5 a5 5 0 0 1 0 7" />
      <path d="M19 5 a10 10 0 0 1 0 14" />
    </>,
  },
  {
    key: 'rack',
    label: 'Rack',
    color: '#4b5563',
    icon: <>
      <rect x="4" y="2" width="16" height="20" rx="1.5" />
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
      <circle cx="17.3" cy="4.5" r="0.75" fill="currentColor" stroke="none" />
      <circle cx="17.3" cy="9.5" r="0.75" fill="currentColor" stroke="none" />
      <circle cx="17.3" cy="14.5" r="0.75" fill="currentColor" stroke="none" />
      <circle cx="17.3" cy="19.5" r="0.75" fill="currentColor" stroke="none" />
    </>,
  },
];

export function getEquipmentType(key) {
  return EQUIPMENT_TYPES.find(t => t.key === key) || null;
}

export function EquipmentIcon({ typeKey, size = 24, color }) {
  const type = getEquipmentType(typeKey);
  if (!type) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || type.color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {type.icon}
    </svg>
  );
}

// One fallback icon per Add Element category (see element_types table / the
// "Add Element" catalog), keyed by system_abbr. Used for any catalog element
// that doesn't reuse one of the hand-drawn EQUIPMENT_TYPES icons above via
// its icon_key.
export const CATEGORY_ICONS = {
  VSS: <>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="3" />
    <path d="M12 4 V2" />
  </>,
  ACS: <>
    <path d="M12 2 L20 5 V11 C20 16 16.5 20 12 22 C7.5 20 4 16 4 11 V5 Z" />
    <rect x="9" y="11" width="6" height="5" rx="1" />
    <path d="M10.5 11 V9.5 a1.5 1.5 0 0 1 3 0 V11" />
  </>,
  IDS: <>
    <path d="M6 16 V11 a6 6 0 0 1 12 0 v5 l2 2.5 H4 Z" />
    <path d="M10 19.5 a2 2 0 0 0 4 0" />
  </>,
  INFRA: <>
    <circle cx="5" cy="6" r="2" />
    <circle cx="19" cy="6" r="2" />
    <circle cx="12" cy="18" r="2" />
    <path d="M5 8 C5 14 8 14 12 16" />
    <path d="M19 8 C19 14 16 14 12 16" />
  </>,
  IT: <>
    <rect x="3" y="4" width="18" height="12" rx="1.5" />
    <path d="M8 20 h8" />
    <path d="M12 16 v4" />
  </>,
  AV: <>
    <rect x="3" y="4" width="18" height="14" rx="1.5" />
    <path d="M10 8.5 L15 11 L10 13.5 Z" />
  </>,
  COMM: <>
    <path d="M12 21 V11" />
    <path d="M8 8 a5.5 5.5 0 0 1 8 0" />
    <path d="M5 5 a10 10 0 0 1 14 0" />
    <circle cx="12" cy="11" r="1.4" fill="currentColor" stroke="none" />
  </>,
  BMS: <>
    <circle cx="12" cy="13" r="7" />
    <path d="M12 13 L15.5 9.5" />
    <path d="M12 4 V6.5" />
  </>,
};

// Resolves the icon/color to render for a catalog element (a row from
// element_types): reuse the matching hand-drawn EQUIPMENT_TYPES icon when
// the element has an icon_key, otherwise fall back to its category icon.
export function getElementIcon(element) {
  if (!element) return null;
  if (element.icon_key) {
    const legacy = getEquipmentType(element.icon_key);
    if (legacy) return { icon: legacy.icon, color: element.system_color || legacy.color };
  }
  const icon = CATEGORY_ICONS[element.system_abbr];
  return icon ? { icon, color: element.system_color } : null;
}

export function ElementIcon({ element, size = 24, color }) {
  const resolved = getElementIcon(element);
  if (!resolved) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || resolved.color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {resolved.icon}
    </svg>
  );
}
