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

// Shapes reused across several element names that are the same real-world
// thing under different system prefixes (e.g. "ACS Power Supply" and "VSS
// Power Supply" are both just an equipment PSU) — one shape each,
// disambiguated on screen by the name label next to the icon.
const powerSupplyIcon = <>
  <rect x="4" y="6" width="16" height="12" rx="1.5" />
  <path d="M9 12 h1.5 l1.5 -3 l2 6 l1.5 -3 h1.5" />
</>;
const controllerIcon = <>
  <rect x="4" y="4" width="16" height="16" rx="1.5" />
  <rect x="9" y="9" width="6" height="6" rx="1" />
  <path d="M9 6 V4 M15 6 V4 M9 20 V18 M15 20 V18 M4 9 H2 M4 15 H2 M22 9 H20 M22 15 H20" />
</>;
const softwareIcon = <>
  <rect x="3" y="4" width="18" height="14" rx="1.5" />
  <path d="M3 8 H21" />
  <circle cx="6" cy="6" r="0.6" fill="currentColor" stroke="none" />
</>;

// Distinct icons for individual catalog elements, keyed by exact element
// name, for cases where the category icon alone is too generic to tell
// elements apart at a glance (e.g. Infrastructure's Battery vs Junction Box
// vs Cable Path). Not every element needs one — anything missing here falls
// back to its icon_key (a reused EQUIPMENT_TYPES icon) or its category icon.
export const ELEMENT_ICONS = {
  'Cable Path': <>
    <circle cx="5" cy="19" r="1.6" fill="currentColor" stroke="none" />
    <path d="M5 19 L5 9 L19 9" />
    <circle cx="19" cy="9" r="1.6" fill="currentColor" stroke="none" />
  </>,
  'Flex Cable Path': <>
    <circle cx="5" cy="19" r="1.6" fill="currentColor" stroke="none" />
    <path d="M5 19 L19 5" />
    <circle cx="19" cy="5" r="1.6" fill="currentColor" stroke="none" />
  </>,
  'Cable Balun': <>
    <rect x="2.5" y="9" width="7" height="6" rx="1" />
    <path d="M9.5 12 H14" />
    <circle cx="17" cy="12" r="3" />
  </>,
  'Network Surge Protector': <>
    <rect x="4" y="7" width="12" height="10" rx="1.5" />
    <path d="M8 7 V4 M12 7 V4" />
    <path d="M20 8 L16.5 13 H19.5 L16 18" />
  </>,
  'PoE Injector': <>
    <rect x="3" y="7" width="14" height="10" rx="1.5" />
    <path d="M17 10 H21 M17 14 H21" />
    <circle cx="7.5" cy="12" r="1" fill="currentColor" stroke="none" />
  </>,
  'Multimedia Outlet': <>
    <rect x="5" y="3" width="14" height="18" rx="1.5" />
    <circle cx="12" cy="9" r="2" />
    <path d="M9 15 H15 M9 18 H15" />
  </>,
  'Junction Box': <>
    <rect x="4" y="4" width="16" height="16" rx="1.5" />
    <path d="M12 4 V2 M12 22 V20 M4 12 H2 M22 12 H20" />
  </>,
  'UPS Power Unit': <>
    <rect x="3" y="8" width="14" height="9" rx="1.5" />
    <path d="M17 11 H21 V14 H17" />
    <path d="M7 8 V6 M11 8 V6" />
  </>,
  'Network Patch Panel': <>
    <rect x="2.5" y="8" width="19" height="7" rx="1" />
    <circle cx="6" cy="11.5" r="0.8" fill="currentColor" stroke="none" />
    <circle cx="10" cy="11.5" r="0.8" fill="currentColor" stroke="none" />
    <circle cx="14" cy="11.5" r="0.8" fill="currentColor" stroke="none" />
    <circle cx="18" cy="11.5" r="0.8" fill="currentColor" stroke="none" />
  </>,
  'Network Jack': <>
    <rect x="7" y="4" width="10" height="16" rx="1.5" />
    <rect x="10" y="9" width="4" height="6" rx="0.5" />
  </>,
  'Enclosure': <>
    <rect x="4" y="3" width="16" height="18" rx="1.5" />
    <line x1="4" y1="8" x2="20" y2="8" />
    <circle cx="17" cy="5.5" r="0.7" fill="currentColor" stroke="none" />
  </>,
  'Structured Media Cabinet': <>
    <rect x="4" y="3" width="16" height="18" rx="1.5" />
    <line x1="4" y1="9" x2="20" y2="9" />
    <line x1="4" y1="15" x2="20" y2="15" />
  </>,
  'Wireless Receiver Hub': <>
    <rect x="9" y="17" width="6" height="4" rx="1" />
    <path d="M9 14 a4.2 4.2 0 0 1 6 0" />
    <path d="M6.5 11 a8 8 0 0 1 11 0" />
  </>,
  'Battery': <>
    <rect x="3" y="8" width="16" height="9" rx="1.5" />
    <rect x="19" y="11.5" width="2" height="3" rx="0.5" />
    <path d="M8 12.5 h2 l1.5 -3 l2 6 l1.5 -3 h2" />
  </>,
  'Generator': <>
    <rect x="3" y="9" width="18" height="9" rx="1.5" />
    <circle cx="8" cy="13.5" r="2.2" />
    <path d="M13 13.5 H18" />
    <path d="M6 9 V6 M18 9 V6" />
  </>,
  'General Component': <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 8 V16 M8 12 H16" />
  </>,
  'General Assembly': <>
    <path d="M12 2.5 L20 7.5 V16.5 L12 21.5 L4 16.5 V7.5 Z" />
    <path d="M12 9 V15 M9 12 H15" />
  </>,

  // ── Power supplies — same real-world thing (an equipment PSU) under
  // different system prefixes; one shape, disambiguated by the name label.
  'ACS Power Supply': powerSupplyIcon,
  'IDS Power Supply': powerSupplyIcon,
  'VSS Power Supply': powerSupplyIcon,
  'Intercom Power Supply': powerSupplyIcon,

  // ── Controllers / expansion modules / control panels — circuit-board glyph.
  'ACS Controller': controllerIcon,
  'ACS Expansion Module': controllerIcon,
  'IDS Control Panel': controllerIcon,
  'IDS Expander Module': controllerIcon,
  'BMS Controller': controllerIcon,
  'HVAC Controller': controllerIcon,
  'DSP Processor': controllerIcon,

  // ── Software — browser/window glyph.
  'ACS Software': softwareIcon,
  'IDS Software': softwareIcon,
  'VMS Software': softwareIcon,
  'General Software': softwareIcon,

  // ── Networking
  'Network Switch': <>
    <rect x="2.5" y="8" width="19" height="8" rx="1.5" />
    <circle cx="6" cy="12" r="0.8" fill="currentColor" stroke="none" />
    <circle cx="9" cy="12" r="0.8" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="0.8" fill="currentColor" stroke="none" />
    <circle cx="15" cy="12" r="0.8" fill="currentColor" stroke="none" />
    <circle cx="18" cy="12" r="0.8" fill="currentColor" stroke="none" />
  </>,
  'Network Router': <>
    <rect x="4" y="11" width="16" height="8" rx="1.5" />
    <path d="M9 11 a3 3 0 0 1 6 0" />
    <path d="M12 3 V6" />
  </>,
  'Network Firewall': <>
    <rect x="4" y="4" width="16" height="16" rx="1.5" />
    <line x1="4" y1="9" x2="20" y2="9" />
    <line x1="4" y1="14" x2="20" y2="14" />
    <line x1="9" y1="4" x2="9" y2="9" />
    <line x1="15" y1="9" x2="15" y2="14" />
    <line x1="12" y1="14" x2="12" y2="19" />
  </>,
  'Server': <>
    <rect x="4" y="4" width="16" height="16" rx="1.5" />
    <line x1="4" y1="10" x2="20" y2="10" />
    <line x1="4" y1="16" x2="20" y2="16" />
    <circle cx="17" cy="7" r="0.7" fill="currentColor" stroke="none" />
  </>,
  'User Workstation': <>
    <rect x="4" y="4" width="16" height="10" rx="1.5" />
    <path d="M8 18 h8 M12 14 v4" />
    <rect x="6" y="19" width="12" height="2" rx="1" />
  </>,
  'Computer': <>
    <rect x="6" y="3" width="12" height="18" rx="1.5" />
    <circle cx="12" cy="8" r="1" fill="currentColor" stroke="none" />
    <line x1="8" y1="14" x2="16" y2="14" />
  </>,
  'Data Storage Array': <>
    <rect x="4" y="4" width="16" height="4" rx="1" />
    <rect x="4" y="10" width="16" height="4" rx="1" />
    <rect x="4" y="16" width="16" height="4" rx="1" />
    <circle cx="17" cy="6" r="0.6" fill="currentColor" stroke="none" />
  </>,
  'Universal Transmitter': <>
    <rect x="8" y="12" width="8" height="8" rx="1" />
    <path d="M12 12 V4" />
    <path d="M9 7 a4 4 0 0 1 6 0" />
  </>,
  'Cellular Communicator': <>
    <rect x="7" y="9" width="10" height="10" rx="1.5" />
    <path d="M12 9 V4" />
    <path d="M9 6 a4.5 4.5 0 0 1 6 0" />
    <path d="M6.5 3.5 a8.5 8.5 0 0 1 11 0" />
  </>,

  // ── Doors & door hardware
  'Single Door': <>
    <rect x="7" y="2" width="12" height="20" rx="1" />
    <path d="M17 3 L21 2 V22 L17 21" />
    <circle cx="15" cy="12" r="0.8" fill="currentColor" stroke="none" />
  </>,
  'Double Door': <>
    <rect x="3" y="2" width="9" height="20" rx="1" />
    <rect x="12" y="2" width="9" height="20" rx="1" />
    <circle cx="10" cy="12" r="0.7" fill="currentColor" stroke="none" />
    <circle cx="14" cy="12" r="0.7" fill="currentColor" stroke="none" />
  </>,
  'Overhead Door': <>
    <rect x="4" y="4" width="16" height="16" rx="1.5" />
    <line x1="4" y1="8" x2="20" y2="8" />
    <line x1="4" y1="12" x2="20" y2="12" />
    <line x1="4" y1="16" x2="20" y2="16" />
  </>,
  'Garage Door Operator': <>
    <rect x="6" y="7" width="12" height="13" rx="1" />
    <line x1="6" y1="11" x2="18" y2="11" />
    <line x1="6" y1="15" x2="18" y2="15" />
    <rect x="9" y="3" width="6" height="4" rx="1" />
  </>,
  'Pedestrian Entry': <>
    <rect x="8" y="4" width="10" height="18" rx="1" />
    <rect x="5" y="3" width="4" height="3" rx="1" />
    <path d="M9 4.5 H5" />
  </>,
  'Automatic Door Operator': <>
    <rect x="8" y="4" width="10" height="18" rx="1" />
    <rect x="5" y="3" width="4" height="3" rx="1" />
    <path d="M9 4.5 H5" />
  </>,
  'Vehicle Gate Operator': <>
    <rect x="2" y="14" width="20" height="3" rx="1" />
    <rect x="3" y="6" width="4" height="8" rx="1" />
    <path d="M7 8 H20" />
  </>,
  'Vehicle Entry Control Point': <>
    <rect x="2" y="14" width="20" height="3" rx="1" />
    <rect x="3" y="6" width="4" height="8" rx="1" />
    <path d="M7 8 H20" />
  </>,
  'Elec Lockset': <>
    <rect x="6" y="2" width="10" height="20" rx="1" />
    <circle cx="13" cy="12" r="1.3" fill="currentColor" stroke="none" />
    <path d="M16 2 L20 3 V21 L16 22" />
  </>,
  'Electric Strike': <>
    <rect x="6" y="2" width="12" height="20" rx="1" />
    <rect x="14" y="10" width="4" height="4" rx="0.5" />
  </>,
  'Magnetic Lock': <>
    <rect x="4" y="9" width="8" height="6" rx="1" />
    <rect x="12" y="9" width="8" height="6" rx="1" />
    <path d="M12 9 V15" />
  </>,
  'Elec Exit Device': <>
    <rect x="4" y="4" width="16" height="16" rx="1.5" />
    <line x1="4" y1="12" x2="20" y2="12" strokeWidth="3" />
  </>,
  'Request to Exit': <>
    <rect x="8" y="2" width="8" height="14" rx="1.5" />
    <path d="M12 16 a4 4 0 0 0 4 4" />
  </>,
  'Door Prop Alarm': <>
    <rect x="8" y="2" width="8" height="12" rx="1" />
    <path d="M9 17 a3 3 0 0 0 6 0" />
    <path d="M6 17 V13 a6 6 0 0 1 12 0 v4 z" />
  </>,
  'Door Holdback': <>
    <rect x="8" y="2" width="8" height="16" rx="1" />
    <circle cx="6" cy="20" r="2" />
  </>,
  'Turnstile': <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3 V12 L18 15 M12 12 L6 15" />
  </>,
  'Pedestrian Metal Detector': <>
    <path d="M4 21 V9 a8 8 0 0 1 16 0 v12" />
  </>,
  'Power Transfer Device': <>
    <rect x="2" y="8" width="7" height="8" rx="1" />
    <rect x="15" y="8" width="7" height="8" rx="1" />
    <path d="M9 12 H15 M13 10 L15 12 L13 14" />
  </>,
  'Handicap Push Button': <>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
  </>,
  'Long Range Reader': <>
    <rect x="8" y="9" width="8" height="10" rx="1.5" />
    <path d="M6 12 a8 8 0 0 1 0 6 M18 12 a8 8 0 0 0 0 6" />
  </>,

  // ── Alarms / detectors
  'Alarm Sounder': <>
    <path d="M6 15 V10 a6 6 0 0 1 12 0 v5 z" />
    <path d="M9 15 a3 3 0 0 0 6 0" />
    <path d="M4 7 a10 10 0 0 1 2 -4 M20 7 a10 10 0 0 0 -2 -4" />
  </>,
  'Siren': <>
    <path d="M6 15 V10 a6 6 0 0 1 12 0 v5 z" />
    <path d="M9 15 a3 3 0 0 0 6 0" />
    <path d="M4 7 a10 10 0 0 1 2 -4 M20 7 a10 10 0 0 0 -2 -4" />
  </>,
  'Siren Strobe': <>
    <path d="M6 15 V10 a6 6 0 0 1 12 0 v5 z" />
    <path d="M9 15 a3 3 0 0 0 6 0" />
    <path d="M12 2 V0" />
    <path d="M4 4 l1.5 1.5 M20 4 l-1.5 1.5" />
  </>,
  'Tamper Switch': <>
    <rect x="7" y="7" width="10" height="10" rx="1.5" />
    <path d="M12 3 L14 7 H10 Z" />
  </>,
  'End of Line': <>
    <path d="M2 12 H7 L9 8 L12 16 L15 8 L17 12 H22" />
  </>,
  'Glass Break Detector': <>
    <circle cx="12" cy="12" r="7" />
    <path d="M12 6 L10 12 L14 12 L11 18" />
  </>,
  'Dual Technology Detector': <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 4 V2 M12 22 V20 M4 12 H2 M20 12 H22" />
  </>,
  'Passive IR Detector': <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 4 V2 M12 22 V20 M4 12 H2 M20 12 H22" />
  </>,
  'Vibration Sensor': <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 4 V2 M12 22 V20 M4 12 H2 M20 12 H22" />
  </>,
  'Perimeter Beam': <>
    <circle cx="4" cy="12" r="2" />
    <circle cx="20" cy="12" r="2" />
    <line x1="6" y1="12" x2="18" y2="12" strokeDasharray="2 2" />
  </>,
  'Occupancy Sensor': <>
    <circle cx="12" cy="7" r="3" />
    <path d="M6 21 C6 15 8.5 13 12 13 C15.5 13 18 15 18 21" />
  </>,
  'Temperature Sensor': <>
    <rect x="10" y="3" width="4" height="12" rx="2" />
    <circle cx="12" cy="18" r="3" />
  </>,
  'Humidity Sensor': <>
    <path d="M12 3 C16 9 18 12.5 18 15.5 A6 6 0 0 1 6 15.5 C6 12.5 8 9 12 3 Z" />
  </>,
  'Thermostat': <>
    <circle cx="12" cy="13" r="8" />
    <path d="M12 13 L15.5 9.5" />
    <path d="M12 4 V6.5" />
  </>,
  'General Multi-Sensor Device': <>
    <circle cx="12" cy="12" r="7" />
    <circle cx="12" cy="6" r="1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="18" r="1" fill="currentColor" stroke="none" />
    <circle cx="6" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="18" cy="12" r="1" fill="currentColor" stroke="none" />
  </>,
  'Keypad': <>
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
  'Light Keypad': <>
    <rect x="6" y="2.5" width="12" height="19" rx="2" />
    <circle cx="9.3" cy="7.5" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="12" cy="7.5" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="14.7" cy="7.5" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="9.3" cy="11" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="12" cy="11" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="14.7" cy="11" r="0.9" fill="currentColor" stroke="none" />
  </>,
  'Panic Button': <>
    <circle cx="12" cy="12" r="9" />
    <line x1="12" y1="7" x2="12" y2="13" />
    <circle cx="12" cy="16.5" r="0.9" fill="currentColor" stroke="none" />
  </>,
  'Emergency Call Station': <>
    <rect x="5" y="3" width="14" height="18" rx="1.5" />
    <circle cx="12" cy="12" r="4" />
  </>,
  'Emergency Door Release': <>
    <rect x="5" y="3" width="14" height="18" rx="1.5" />
    <circle cx="12" cy="12" r="4" />
  </>,
  'Light Switch': <>
    <rect x="7" y="3" width="10" height="18" rx="1.5" />
    <rect x="9.5" y="6" width="5" height="8" rx="1.5" />
  </>,
  'Utility Meter': <>
    <circle cx="12" cy="13" r="8" />
    <path d="M12 13 L16 9" />
    <path d="M8 6 L9 8 M16 6 L15 8" />
  </>,

  // ── Cards / ID / scanners
  'Biometric Reader': <>
    <rect x="5" y="3" width="14" height="18" rx="2" />
    <path d="M12 8 a3 3 0 0 1 3 3 v3 a3 3 0 0 1 -3 3 a3 3 0 0 1 -3 -3 v-1" />
  </>,
  'ID Scanner': <>
    <rect x="3" y="6" width="18" height="12" rx="1.5" />
    <line x1="3" y1="11" x2="21" y2="11" />
    <circle cx="7" cy="14.5" r="1" fill="currentColor" stroke="none" />
  </>,
  'License Plate Reader': <>
    <rect x="2" y="9" width="14" height="6" rx="1" />
    <circle cx="19" cy="12" r="3" />
  </>,
  'Badging Printer': <>
    <rect x="4" y="8" width="16" height="8" rx="1.5" />
    <path d="M7 8 V4 h10 v4" />
    <rect x="8" y="16" width="8" height="4" />
  </>,
  'Printer': <>
    <rect x="4" y="8" width="16" height="8" rx="1.5" />
    <path d="M7 8 V4 h10 v4" />
    <rect x="8" y="16" width="8" height="4" />
  </>,
  'Visitor Kiosk': <>
    <rect x="7" y="2" width="10" height="14" rx="1.5" />
    <rect x="4" y="18" width="16" height="4" rx="1" />
  </>,
  'Health Scan Kiosk': <>
    <rect x="7" y="2" width="10" height="14" rx="1.5" />
    <rect x="4" y="18" width="16" height="4" rx="1" />
  </>,

  // ── Cameras / video (VSS)
  'PTZ Camera': <>
    <circle cx="12" cy="13" r="6" />
    <circle cx="12" cy="13" r="2" />
    <path d="M12 3 v3 M19 6 l-2 2 M5 6 l2 2" />
  </>,
  'Multi-Lens Camera': <>
    <rect x="2" y="9" width="20" height="7" rx="1.5" />
    <circle cx="7" cy="12.5" r="1.8" />
    <circle cx="12" cy="12.5" r="1.8" />
    <circle cx="17" cy="12.5" r="1.8" />
  </>,
  'Analog Video Encoder': <>
    <rect x="3" y="7" width="18" height="10" rx="1.5" />
    <path d="M6 12 l2 -3 l2 5 l2 -4 l2 3 l2 -2 l2 1" />
  </>,
  'IR Illuminator': <>
    <circle cx="12" cy="11" r="5" />
    <path d="M12 2 V4 M12 22 V20 M3 11 H5 M19 11 H21 M6 5 l1.4 1.4 M16.6 16.6 L18 18 M18 5 l-1.4 1.4 M7.4 16.6 L6 18" />
  </>,
  'Video Monitor': <>
    <rect x="3" y="4" width="18" height="12" rx="1.5" />
    <path d="M9 20 h6 M12 16 v4" />
  </>,
  'Video Wall': <>
    <rect x="2" y="3" width="9" height="7" rx="1" />
    <rect x="13" y="3" width="9" height="7" rx="1" />
    <rect x="2" y="13" width="9" height="7" rx="1" />
    <rect x="13" y="13" width="9" height="7" rx="1" />
  </>,
  'Display': <>
    <rect x="4" y="3" width="16" height="11" rx="1.5" />
    <path d="M9 19 h6 M12 14 v5" />
  </>,
  'Television': <>
    <rect x="4" y="6" width="16" height="12" rx="1.5" />
    <path d="M9 6 L6 2 M15 6 L18 2" />
  </>,
  'TV Monitor Lift': <>
    <rect x="6" y="3" width="12" height="9" rx="1" />
    <path d="M9 12 V18 M15 12 V18" />
    <rect x="4" y="18" width="16" height="3" rx="1" />
  </>,
  'Projection Screen': <>
    <rect x="4" y="3" width="16" height="10" rx="1" />
    <path d="M6 13 L6 20 M18 13 L18 20" />
  </>,
  'Projector': <>
    <rect x="3" y="8" width="14" height="8" rx="1.5" />
    <circle cx="19" cy="12" r="3" />
  </>,
  'Video Conference System': <>
    <rect x="3" y="5" width="18" height="11" rx="1.5" />
    <circle cx="12" cy="10.5" r="1.6" />
  </>,
  'Streaming Device': <>
    <rect x="7" y="14" width="10" height="4" rx="1" />
    <path d="M9 11 a4.5 4.5 0 0 1 6 0" />
    <path d="M6.5 8 a9 9 0 0 1 11 0" />
  </>,
  'Amplifier': <>
    <rect x="3" y="7" width="18" height="10" rx="1.5" />
    <path d="M7 14 v-4 M10 14 v-6 M13 14 v-2 M16 14 v-5" />
  </>,
  'Public Address Amp': <>
    <rect x="3" y="7" width="18" height="10" rx="1.5" />
    <path d="M7 14 v-4 M10 14 v-6 M13 14 v-2 M16 14 v-5" />
  </>,
  'Microphone': <>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M6 11 a6 6 0 0 0 12 0 M12 17 v4 M9 21 h6" />
  </>,
  'Microphone Outlet': <>
    <rect x="6" y="3" width="12" height="18" rx="1.5" />
    <rect x="9" y="8" width="6" height="8" rx="3" />
  </>,
  'Public Address Speaker': <>
    <path d="M4 10 L10 7 V17 L4 14 Z" />
    <path d="M10 7 L18 4 V20 L10 17" />
  </>,

  // ── Intercom / comms
  'Intercom Master Station': <>
    <rect x="4" y="2" width="16" height="20" rx="1.5" />
    <rect x="7" y="5" width="10" height="6" rx="1" />
    <circle cx="12" cy="16" r="1.5" />
  </>,
  'Intercom End Point': <>
    <rect x="6" y="4" width="12" height="16" rx="1.5" />
    <circle cx="12" cy="10" r="2" />
    <circle cx="12" cy="16" r="1" fill="currentColor" stroke="none" />
  </>,
  'Two-Way Radio': <>
    <rect x="8" y="5" width="8" height="16" rx="2" />
    <path d="M11 5 V2 M13 5 V2" />
    <circle cx="12" cy="10" r="1" fill="currentColor" stroke="none" />
  </>,
  'Relay': <>
    <rect x="4" y="8" width="10" height="8" rx="1" />
    <path d="M14 10 H20 M14 14 H20" />
  </>,
  'Video Doorbell': <>
    <rect x="8" y="2" width="8" height="16" rx="2" />
    <circle cx="12" cy="8" r="2" />
    <circle cx="12" cy="15" r="1" fill="currentColor" stroke="none" />
  </>,
};

// Resolves the icon/color to render for a catalog element (a row from
// element_types): a dedicated ELEMENT_ICONS entry first, then the matching
// hand-drawn EQUIPMENT_TYPES icon when the element has an icon_key,
// otherwise fall back to its category icon.
export function getElementIcon(element) {
  if (!element) return null;
  if (ELEMENT_ICONS[element.name]) {
    return { icon: ELEMENT_ICONS[element.name], color: element.system_color };
  }
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
