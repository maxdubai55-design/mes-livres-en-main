/**
 * Pictogrammes de la bibliothèque : silhouettes simples, lisibles à 40 px,
 * dessinées dans la couleur du texte (currentColor) pour suivre le thème.
 */
const S = (body: string) => `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS: Record<string, string> = {
  "castle.wall.curtain": S(`<path d="M4 38V20h4v-4h4v4h4v-4h4v4h4v-4h4v4h4v-4h4v4h4v18z" fill="currentColor" fill-opacity=".15"/>`),
  "castle.tower.round": S(`<path d="M14 42V18h20v24z" fill="currentColor" fill-opacity=".15"/><path d="M12 18L24 4l12 14z" fill="currentColor" fill-opacity=".35"/><path d="M22 28h4v6h-4z"/>`),
  "castle.tower.square": S(`<path d="M13 42V16h22v26z" fill="currentColor" fill-opacity=".15"/><path d="M11 16l13-9 13 9z" fill="currentColor" fill-opacity=".35"/><path d="M23 26h2v7h-2z"/>`),
  "castle.keep.round": S(`<path d="M10 42V14h28v28z" fill="currentColor" fill-opacity=".15"/><path d="M8 14L24 2l16 12z" fill="currentColor" fill-opacity=".35"/><path d="M22 22h4v6h-4zM22 32h4v6h-4z"/>`),
  "castle.keep.square": S(`<path d="M10 42V12h28v30z" fill="currentColor" fill-opacity=".15"/><path d="M10 12V7h5v5M19 12V7h5v5M28 12V7h5v5M33 12V7h5v5"/><path d="M22 20h4v6h-4zM22 30h4v6h-4z"/>`),
  "castle.entrance.gate": S(`<path d="M6 42V16h36v26z" fill="currentColor" fill-opacity=".15"/><path d="M19 42V30a5 5 0 0 1 10 0v12" fill="currentColor" fill-opacity=".4"/><path d="M6 16v-5h5v5M16 16v-5h5v5M27 16v-5h5v5M37 16v-5h5v5"/>`),
  "castle.residential.hall": S(`<path d="M6 42V22h36v20z" fill="currentColor" fill-opacity=".15"/><path d="M4 22L24 8l20 14z" fill="currentColor" fill-opacity=".35"/><path d="M12 28h4v6h-4zM32 28h4v6h-4zM21 42v-8h6v8"/>`),
  "castle.defense.machicolation": S(`<path d="M6 14h36v10H6z" fill="currentColor" fill-opacity=".2"/><path d="M10 24l2 8M20 24l2 8M30 24l2 8M40 24l-2 8M8 32h34v10H8"/>`),
  "castle.defense.hoarding": S(`<path d="M4 20l20-8 20 8z" fill="currentColor" fill-opacity=".35"/><path d="M6 20h36v10H6z" fill="currentColor" fill-opacity=".15"/><path d="M12 20v10M20 20v10M28 20v10M36 20v10M10 30v12h28V30"/>`),
  "church.nave": S(`<path d="M4 42V20h40v22z" fill="currentColor" fill-opacity=".15"/><path d="M2 20L24 8l22 12z" fill="currentColor" fill-opacity=".35"/><path d="M10 26v6a2 2 0 0 0 4 0v-6M22 26v6a2 2 0 0 0 4 0v-6M34 26v6a2 2 0 0 0 4 0v-6"/>`),
  "church.transept": S(`<path d="M18 42V6h12v36zM4 30V18h40v12z" fill="currentColor" fill-opacity=".15"/>`),
  "church.apse": S(`<path d="M8 42V24a16 16 0 0 1 32 0v18z" fill="currentColor" fill-opacity=".15"/><path d="M6 24a18 12 0 0 1 36 0" /><path d="M16 30v6M24 28v8M32 30v6"/>`),
  "church.chapel.radiating": S(`<path d="M14 42V28a10 10 0 0 1 20 0v14z" fill="currentColor" fill-opacity=".15"/><path d="M24 30v6"/>`),
  "church.support.column": S(`<path d="M16 8h16v4H16zM18 12h12l-2 4H20zM20 16h8v22h-8zM16 38h16v4H16z" fill="currentColor" fill-opacity=".2"/>`),
  "church.arch": S(`<path d="M6 42V26a18 18 0 0 1 36 0v16h-8V26a10 10 0 0 0-20 0v16z" fill="currentColor" fill-opacity=".2"/>`),
  "church.vault": S(`<path d="M4 38a20 20 0 0 1 40 0" /><path d="M4 38h40M8 38l16-20 16 20" /><path d="M4 38a20 14 0 0 1 40 0" fill="currentColor" fill-opacity=".15"/>`),
  "church.buttress": S(`<path d="M8 42V22h8v-8h6v28z" fill="currentColor" fill-opacity=".2"/><path d="M22 14c8 0 14 4 18 10" /><path d="M40 8v34"/>`),
  "church.tower.facade": S(`<path d="M14 42V18h20v24z" fill="currentColor" fill-opacity=".15"/><path d="M14 18L24 2l10 16z" fill="currentColor" fill-opacity=".35"/><path d="M21 26a3 3 0 0 1 6 0v6h-6z"/>`),
};

export const WELCOME_ICONS = {
  castle: S(`<path d="M4 44V24h6v-5h4v5h4v-9h4V8h4v7h4v9h4v-5h4v5h6v20z" fill="currentColor" fill-opacity=".2"/><path d="M20 44v-8a4 4 0 0 1 8 0v8"/>`),
  cathedral: S(`<path d="M4 44V26h8V12l4-8 4 8v14h8V12l4-8 4 8v14h8v18z" fill="currentColor" fill-opacity=".2"/><circle cx="24" cy="32" r="4"/>`),
  ruin: S(`<path d="M4 44V30l4-2v-6h6v6l4 4v12M26 44V24h6v-4h4v10l4 2v12" fill="currentColor" fill-opacity=".2"/><path d="M2 44h44"/>`),
  generate: S(`<path d="M8 40l24-24M28 8l2 6 6 2-6 2-2 6-2-6-6-2 6-2zM38 26l1 3 3 1-3 1-1 3-1-3-3-1 3-1z" fill="currentColor" fill-opacity=".3"/>`),
  open: S(`<path d="M4 40V10h14l4 4h22v26z" fill="currentColor" fill-opacity=".2"/>`),
  learn: S(`<path d="M24 10L2 20l22 10 22-10z" fill="currentColor" fill-opacity=".25"/><path d="M10 24v10c8 6 20 6 28 0V24M44 20v14"/>`),
};
