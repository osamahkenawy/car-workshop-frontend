/**
 * Car damage diagram — the clickable part of the Vehicle Inspection Form.
 *
 * Five schematic views (top, both sides, front, rear). Pick a damage code from
 * the legend, click anywhere on a view, and a marker is dropped there.
 *
 * Marker coordinates are stored NORMALISED (x/y between 0 and 1, relative to
 * the view's own box) rather than in pixels, so a form filled in on a tablet
 * still renders correctly on a desktop, in the print layout, or at any zoom.
 */

/* Damage legend, from the printed walk-around sheet. Two deliberate fixes:
   the paper form used "GC" for BOTH Glass Chip and Gouges/Crease, which makes
   a marker ambiguous once it's on the diagram — Gouges/Crease is "GO" here.
   "Pant Chip" on the sheet is a typo for Paint Chip. */
export const DAMAGE_CODES = {
  SH: 'Swirls/Holograms',
  WS: 'Water Spots',
  OX: 'Oxidation',
  CF: 'Clearcoat Failure',
  DS: 'Deep Scratch',
  BD: 'Bird Dropping',
  RP: 'Rough Paint',
  UD: 'Unknown Defect',
  PT: 'Paint Transfer',
  PC: 'Paint Chip',
  GS: 'Glass Scratch',
  GC: 'Glass Chip',
  DD: 'Dents/Dings',
  SS: 'Side Swipe',
  CR: 'Curb Rash',
  WD: 'Wheel Damage',
  GO: 'Gouges/Crease',
  LM: 'Loose Molding',
};

const BODY = { fill: '#f8fafc', stroke: '#1e3a6b', strokeWidth: 2 };
const GLASS = { fill: '#e0f2fe', stroke: '#1e3a6b', strokeWidth: 1.5 };
const TRIM = { fill: 'none', stroke: '#94a3b8', strokeWidth: 1.5 };
const WHEEL = { fill: '#334155', stroke: '#1e293b', strokeWidth: 1.5 };

/* ── The five views. Each owns its coordinate box; markers are x*w, y*h. ── */
const VIEWS = [
  {
    key: 'top',
    label: 'Top / Roof',
    // Roughly 1:2.3 body proportions — a car is about 1.8m x 4.5m seen from
    // above, and a narrower box makes the roof panel hard to click accurately.
    w: 260, h: 430,
    art: (
      <>
        {/* wheels sit under the body edges */}
        <rect x="30" y="100"  width="26" height="58" rx="7" {...WHEEL} />
        <rect x="204" y="100" width="26" height="58" rx="7" {...WHEEL} />
        <rect x="30" y="308"  width="26" height="58" rx="7" {...WHEEL} />
        <rect x="204" y="308" width="26" height="58" rx="7" {...WHEEL} />
        {/* body */}
        <path d="M130,16 C102,16 80,32 72,60 L60,106 C50,142 48,192 48,252
                 C48,312 52,362 60,394 C66,414 94,422 130,422 C166,422 194,414 200,394
                 C208,362 212,312 212,252 C212,192 210,142 200,106 L188,60
                 C180,32 158,16 130,16 Z" {...BODY} />
        {/* windscreen, roof, rear screen */}
        <path d="M84,124 L176,124 L186,166 L74,166 Z" {...GLASS} />
        <rect x="74" y="166" width="112" height="112" rx="8" {...TRIM} />
        <path d="M74,278 L186,278 L176,320 L84,320 Z" {...GLASS} />
        {/* bonnet + boot shut lines */}
        <path d="M78,64 L182,64" {...TRIM} />
        <path d="M82,372 L178,372" {...TRIM} />
        {/* mirrors */}
        <path d="M50,158 L32,150 L29,160 L48,168 Z" {...BODY} />
        <path d="M210,158 L228,150 L231,160 L212,168 Z" {...BODY} />
      </>
    ),
  },
  {
    key: 'left',
    label: "Driver Side (Left)",
    w: 420, h: 170,
    art: <SideArt />,
  },
  {
    key: 'right',
    label: 'Passenger Side (Right)',
    w: 420, h: 170,
    // same profile, mirrored, so the nose points the other way
    art: <g transform="translate(420,0) scale(-1,1)"><SideArt /></g>,
  },
  {
    key: 'front',
    label: 'Front',
    w: 220, h: 180,
    art: (
      <>
        <rect x="20" y="136" width="18" height="28" rx="5" {...WHEEL} />
        <rect x="182" y="136" width="18" height="28" rx="5" {...WHEEL} />
        <path d="M30,150 L30,96 C30,74 41,60 60,54 L76,32 C82,24 92,20 110,20
                 C128,20 138,24 144,32 L160,54 C179,60 190,74 190,96 L190,150 Z" {...BODY} />
        <path d="M74,56 L146,56 L133,29 L87,29 Z" {...GLASS} />
        <rect x="36" y="98" width="36" height="17" rx="7" {...GLASS} />
        <rect x="148" y="98" width="36" height="17" rx="7" {...GLASS} />
        <rect x="76" y="106" width="68" height="20" rx="4" {...TRIM} />
        <rect x="30" y="130" width="160" height="20" rx="7" {...TRIM} />
      </>
    ),
  },
  {
    key: 'rear',
    label: 'Rear',
    w: 220, h: 180,
    art: (
      <>
        <rect x="20" y="136" width="18" height="28" rx="5" {...WHEEL} />
        <rect x="182" y="136" width="18" height="28" rx="5" {...WHEEL} />
        <path d="M30,150 L30,96 C30,74 41,60 60,54 L74,32 C80,24 92,20 110,20
                 C128,20 140,24 146,32 L160,54 C179,60 190,74 190,96 L190,150 Z" {...BODY} />
        <path d="M76,54 L144,54 L136,29 L84,29 Z" {...GLASS} />
        <rect x="34" y="96" width="38" height="20" rx="5" {...GLASS} />
        <rect x="148" y="96" width="38" height="20" rx="5" {...GLASS} />
        {/* number plate */}
        <rect x="82" y="104" width="56" height="20" rx="3" {...TRIM} />
        <rect x="30" y="130" width="160" height="20" rx="7" {...TRIM} />
      </>
    ),
  },
];

function SideArt() {
  return (
    <>
      <path d="M18,132 L20,104 C22,88 34,78 56,74 L104,66 C126,44 150,32 186,29 L252,29
               C292,31 316,44 336,68 L372,78 C392,84 400,96 402,114 L402,132 Z" {...BODY} />
      {/* glass */}
      <path d="M120,66 L182,41 L182,66 Z" {...GLASS} />
      <rect x="190" y="41" width="52" height="25" {...GLASS} />
      <path d="M250,41 L288,41 L308,66 L250,66 Z" {...GLASS} />
      {/* door shut lines + handles */}
      <path d="M186,66 L186,130 M246,66 L246,130" {...TRIM} />
      <rect x="196" y="78" width="20" height="5" rx="2" {...TRIM} />
      <rect x="256" y="78" width="20" height="5" rx="2" {...TRIM} />
      {/* sill + wheels */}
      <path d="M120,130 L300,130" {...TRIM} />
      <circle cx="92" cy="130" r="28" {...WHEEL} />
      <circle cx="92" cy="130" r="13" fill="#cbd5e1" />
      <circle cx="330" cy="130" r="28" {...WHEEL} />
      <circle cx="330" cy="130" r="13" fill="#cbd5e1" />
      <path d="M8,160 L412,160" stroke="#cbd5e1" strokeWidth="2" fill="none" />
    </>
  );
}

/**
 * @param {Array}   marks          [{id, view, code, x, y, note}]
 * @param {string}  activeCode     currently selected legend code ('' = none)
 * @param {string}  selectedMarkId highlighted marker
 * @param {Func}    onAddMark      (view, x, y) — omit to make the diagram read-only
 * @param {Func}    onSelectMark   (markId)
 */
export default function CarDamageDiagram({
  marks = [], activeCode = '', selectedMarkId = '',
  onAddMark, onSelectMark, compact = false,
}) {
  const readOnly = typeof onAddMark !== 'function';

  const handleClick = (view) => (e) => {
    if (readOnly || !activeCode) return;
    const r = e.currentTarget.getBoundingClientRect();
    // The SVG is rendered at its natural aspect ratio (width:100%, height:auto),
    // so the element box maps 1:1 onto the viewBox — no letterboxing to correct.
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    onAddMark(view.key, x, y);
  };

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: compact ? '1fr' : 'repeat(auto-fit, minmax(210px, 1fr))',
      gap: 12, alignItems: 'start',
    }}>
      {VIEWS.map(view => {
        const viewMarks = marks.filter(m => m.view === view.key);
        return (
          <div key={view.key} className="vi-view-panel" style={{
            border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff', padding: 8,
          }}>
            <div style={{
              fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase',
              letterSpacing: 0.4, marginBottom: 6, display: 'flex', justifyContent: 'space-between',
            }}>
              <span>{view.label}</span>
              {viewMarks.length > 0 && (
                <span style={{ color: '#dc2626' }}>{viewMarks.length}</span>
              )}
            </div>
            <svg
              viewBox={`0 0 ${view.w} ${view.h}`}
              onClick={handleClick(view)}
              style={{
                width: '100%', height: 'auto', display: 'block',
                cursor: !readOnly && activeCode ? 'crosshair' : 'default',
                touchAction: 'manipulation',
              }}
            >
              {view.art}
              {viewMarks.map(m => {
                const cx = m.x * view.w;
                const cy = m.y * view.h;
                const on = m.id === selectedMarkId;
                return (
                  <g
                    key={m.id}
                    onClick={(e) => { e.stopPropagation(); onSelectMark && onSelectMark(m.id); }}
                    style={{ cursor: onSelectMark ? 'pointer' : 'default' }}
                  >
                    <circle cx={cx} cy={cy} r={on ? 15 : 13}
                      fill="#fff" stroke={on ? '#b91c1c' : '#dc2626'} strokeWidth={on ? 3 : 2} />
                    <text x={cx} y={cy + 3.5} textAnchor="middle"
                      style={{ fontSize: 10, fontWeight: 800, fill: '#b91c1c', userSelect: 'none' }}>
                      {m.code}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        );
      })}
    </div>
  );
}
