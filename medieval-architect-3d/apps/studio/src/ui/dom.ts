/** Petit utilitaire de construction du DOM, sans bibliothèque. */
type Attrs = Record<string, string | number | boolean | EventListener | undefined | null>;
type Child = Node | string | number | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === "class") el.className = String(v);
    else if (k === "html") el.innerHTML = String(v);
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function svg(markup: string): SVGSVGElement {
  const t = document.createElement("template");
  t.innerHTML = markup.trim();
  return t.content.firstChild as SVGSVGElement;
}

export function toast(text: string, ms = 3200): void {
  const t = h("div", { class: "toast", role: "status" }, text);
  document.body.append(t);
  setTimeout(() => t.remove(), ms);
}

export function modal(content: HTMLElement, onClose?: () => void): { close: () => void } {
  const overlay = h("div", { class: "overlay" }, content);
  const close = () => {
    overlay.remove();
    document.removeEventListener("keydown", esc);
    onClose?.();
  };
  const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
  overlay.addEventListener("mousedown", (e) => e.target === overlay && close());
  document.addEventListener("keydown", esc);
  document.body.append(overlay);
  (content.querySelector("textarea, input, button.primary") as HTMLElement | null)?.focus();
  return { close };
}

export function download(blob: Blob, name: string): void {
  const a = h("a", { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}

export const m = (mm: number, digits = 1) => `${(mm / 1000).toLocaleString("fr-FR", { maximumFractionDigits: digits })} m`;

/** replaceChildren qui ignore les valeurs vides. */
export function fill(el: Element, ...children: Child[]): void {
  el.replaceChildren(...(children.filter((c) => c !== null && c !== undefined && c !== false) as (Node | string)[]).map((c) => (typeof c === "number" ? String(c) : c)));
}
