/**
 * Fine-line, self-contained Victorian/Edwardian instrument icons.
 * Decorative SVG must be aria-hidden: the adjoining text is the label.
 * One stroke family replaces the unrelated Unicode emoji/glyphs in the HUD
 * and selected-square inspector.
 */
export type VintageIcon =
  | 'progress' | 'community' | 'safety' | 'income'
  | 'beauty' | 'noise' | 'crime' | 'road-safety';

const paths: Record<VintageIcon,string> = {
  progress:
    '<path d="M14.5 2h3l.7 3.8 2.9 1.2 3.2-2.2 2.1 2.1-2.2 3.2 1.2 2.9 3.8.7v3l-3.8.7-1.2 2.9 2.2 3.2-2.1 2.1-3.2-2.2-2.9 1.2-.7 3.8h-3l-.7-3.8-2.9-1.2-3.2 2.2-2.1-2.1 2.2-3.2-1.2-2.9L3 16.5v-3l3.8-.7L8 9.9 5.8 6.7l2.1-2.1 3.2 2.2L14 5.6Z"/>' +
    '<circle cx="16" cy="15" r="5.4"/><circle cx="16" cy="15" r="1.25" class="v-icon-ink"/>',
  community:
    '<circle cx="16" cy="8.5" r="4.1"/><circle cx="6.9" cy="12" r="3.15"/><circle cx="25.1" cy="12" r="3.15"/>' +
    '<path d="M9.1 28v-6.2q0-5.8 6.9-5.8t6.9 5.8V28M1.7 28v-8.3q0-4.3 5.2-4.3h2.6M30.3 28v-8.3q0-4.3-5.2-4.3h-2.6M5 27.8h22"/>',
  safety:
    '<path d="M16 2.5 28 7v8.6q0 8.3-12 14Q4 23.9 4 15.6V7Z"/>' +
    '<path d="M16 6.4 24.2 9.5v6.1q0 5.3-8.2 10"/>' +
    '<path d="m10.4 16.1 4.3 4.1 7.1-8.3"/>',
  income:
    '<ellipse cx="11" cy="8" rx="8" ry="3.2"/><path d="M3 8v5.7q0 3.3 8 3.3c2.5 0 4.3-.3 5.5-.9"/>' +
    '<path d="M3 13.5q1.5 3 8 3M3 17.4v4.7q0 3.1 8 3.1h3.3"/>' +
    '<ellipse cx="22.4" cy="18.2" rx="7.3" ry="3.1"/><path d="M15.1 18.2v6.6q0 3.1 7.3 3.1t7.3-3.1v-6.6"/>' +
    '<path d="M15.1 23.1q1.3 2.8 7.3 2.8t7.3-2.8M8 6.5l5-1.1"/>',
  beauty:
    '<circle cx="16" cy="16" r="3.6"/>' +
    '<path d="M13 11.9Q6 2.5 12.3 2q4.2 0 3.7 9.1M19 11.9Q26 2.5 19.7 2q-4.2 0-3.7 9.1M20.1 13.1Q29.5 6 30 12.3q0 4.2-9.1 3.7M20.1 18.9Q29.5 26 30 19.7q0-4.2-9.1-3.7M19 20.1Q26 29.5 19.7 30q-4.2 0-3.7-9.1M13 20.1Q6 29.5 12.3 30q4.2 0 3.7-9.1M11.9 18.9Q2.5 26 2 19.7q0-4.2 9.1-3.7M11.9 13.1Q2.5 6 2 12.3q0 4.2 9.1 3.7"/>',
  noise:
    '<path d="M3 13h6l7-6v18l-7-6H3Z"/>' +
    '<path d="M20.2 10.2q5.3 5.8 0 11.6M23.7 6.7q8.8 9.3 0 18.6M26.8 3.8q11.6 12.2 0 24.4"/>',
  crime:
    '<path d="M3.5 9.5 16 5l12.5 4.5v11q0 7-12.5 9-12.5-2-12.5-9Z"/>' +
    '<path d="M8 16q3-3 6.8 0M17.2 16q3.8-3 6.8 0M11.2 20.4q4.8 2.7 9.6 0"/>' +
    '<path d="M11 13.7l4.2 1M21 13.7l-4.2 1"/>',
  'road-safety':
    '<path d="M9 2 4 30M23 2l5 28M10 2h12M7 17h18M5 30h22"/>' +
    '<path d="M16 4v5M16 13v5M16 22v6"/>' +
    '<path d="M21 4.5 27 6.5v4q0 4-6 6-6-2-6-6v-4Z" stroke-width="1.1"/>'
};

export function vintageIcon(id: VintageIcon): string {
  return '<svg class="vintage-icon vintage-icon-' + id + '" viewBox="0 0 32 32" ' +
    'xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" ' +
    'stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" ' +
    'aria-hidden="true" focusable="false">' + paths[id] + '</svg>';
}

const corner =
  '<path d="M1.5 38V19Q1.5 1.5 19 1.5H38"/>' +
  '<path d="M6 34V20Q6 6 20 6H34" stroke-width=".6" opacity=".65"/>' +
  '<path d="M9 15q7 5 12-4q6 7 13 3M15 9q-1 4 3 6M9 27l-6 3" stroke-width=".85"/>' +
  '<path d="M2 2l5 6M20 2l4 5M3 18l5 3" stroke-width=".65"/>';
const locations = ['tl','tr','br','bl'] as const;

/** Decorative corner engravings have no layout or pointer hit area. */
export function vintageFrameCorners(): string {
  return '<span class="vintage-frame-corners" aria-hidden="true">' +
    locations.map(place =>
      '<svg class="vintage-frame-corner corner-' + place + '" ' +
      'viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" ' +
      'fill="none" stroke="currentColor" stroke-width="1.35" ' +
      'stroke-linecap="round" stroke-linejoin="round" ' +
      'focusable="false">' + corner + '</svg>'
    ).join('') + '</span>';
}
