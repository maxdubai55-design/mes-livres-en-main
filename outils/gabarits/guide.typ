// Gabarit de fascicule pratique en gros caractères. Données : livre.json (produit par fabrication.py).
#let d = json("livre.json")
#let sans = d.police_titres
#let gris = luma(232)
#let fonce = luma(40)
#set document(title: d.titre, author: d.auteur)
#set page(
  width: d.largeur_cm * 1cm, height: d.hauteur_cm * 1cm,
  margin: (inside: d.marges.int * 1cm, outside: d.marges.ext * 1cm, top: d.marges.haut * 1cm, bottom: d.marges.bas * 1cm),
  header: none, footer: none,
)
#set text(font: d.police, size: d.corps * 1pt, lang: "fr", region: "FR", hyphenate: false)
#set par(justify: false, leading: d.interligne * 1em, spacing: d.interligne * 1.35em)

#let riche(rs) = for r in rs {
  if r.b { strong(r.s) } else if r.i { emph(r.s) } else { r.s }
}
#let pastille(n) = box(baseline: 22%, circle(radius: 0.72em, fill: fonce,
  align(center + horizon, text(font: sans, weight: "bold", size: 0.85em, fill: white, str(n)))))
#let ligne-liste(marque, corps) = block(above: 0.7em, below: 0.7em,
  grid(columns: (2.1em, 1fr), align: (center + top, left + top), marque, corps))

#let encadre(label, rs) = {
  let sombre = label in ("ATTENTION",)
  let bulle = label in ("ESSAYEZ", "À DIRE", "À ÉCRIRE")
  block(width: 100%, breakable: false, above: 1.2em, below: 1.2em,
    inset: (x: 0.9em, y: 0.8em), radius: if bulle { 0.9em } else { 0.25em },
    fill: if bulle { white } else { gris },
    stroke: if bulle { 1.4pt + fonce } else if sombre { (left: 5pt + black) } else { none },
  )[
    #box(fill: if sombre { black } else { fonce }, inset: (x: 0.5em, y: 0.25em), radius: 0.2em,
      text(font: sans, weight: "bold", size: 0.72em, fill: white, tracking: 0.06em, label))
    #v(0.35em, weak: true)
    #if bulle { text(style: "italic", riche(rs)) } else { riche(rs) }
  ]
}

#let rendu(blocs) = {
  for b in blocs {
    if b.t == "sep" { v(1.2em) }
    else if b.t == "h2" {
      block(above: 1.6em, below: 0.9em, sticky: true, text(font: sans, weight: "bold", size: 1.12em, riche(b.runs)))
    }
    else if b.t == "puce" { ligne-liste(text(size: 1.2em, [•]), riche(b.runs)) }
    else if b.t == "case" { ligne-liste(box(baseline: 12%, rect(width: 0.95em, height: 0.95em, stroke: 1.2pt + fonce)), riche(b.runs)) }
    else if b.t == "etape" { ligne-liste(pastille(b.n), riche(b.runs)) }
    else if b.t == "encadre" { encadre(b.label, b.runs) }
    else { par(riche(b.runs)) }
  }
}

#show heading.where(level: 1): it => {
  set par(justify: false)
  block(below: 1.3em, width: 100%, stroke: (bottom: 2.5pt + fonce), inset: (bottom: 0.6em),
    grid(columns: (auto, 1fr), column-gutter: 0.7em, align: (left + horizon, left + horizon),
      if it.numbering != none {
        circle(radius: 0.95em, fill: fonce, align(center + horizon,
          text(font: sans, weight: "bold", size: 1.25em, fill: white, counter(heading).display("1"))))
      },
      text(font: sans, weight: "bold", size: 1.45em, it.body)))
}
#show outline.entry: it => block(above: 0.85em, below: 0.85em, it)

// ---------- Pages liminaires ----------
#[
  #v(22%)
  #align(center)[
    #text(font: sans, weight: "bold", size: 2em, d.titre)
    #if d.sous_titre != "" { v(0.6cm); text(size: 1.2em, style: "italic", d.sous_titre) }
    #v(1.4cm)
    #text(size: 1.1em, d.auteur)
  ]
  #place(bottom + center, text(font: sans, size: 0.8em, tracking: 0.1em, upper(d.mention_genre)))
  #pagebreak()
  #place(bottom + left, block(width: 100%, text(size: 0.68em)[
    #for l in d.mentions [#l #linebreak()]
  ]))
  #hide[.]
  #pagebreak()
  #block(below: 1.2em, text(font: sans, weight: "bold", size: 1.45em)[Sommaire])
  #outline(title: none, depth: 1)
]

// ---------- Corps ----------
#set page(footer: context {
  set text(font: sans, size: 0.72em)
  let p = here().page()
  if calc.odd(p) { grid(columns: (1fr, auto), text(fill: luma(90), d.titre), strong(str(p))) }
  else { grid(columns: (auto, 1fr), strong(str(p)), align(right, text(fill: luma(90), d.titre))) }
})
#set heading(numbering: "1")
#for ch in d.chapitres {
  pagebreak(weak: true)
  heading(level: 1, ch.titre)
  rendu(ch.blocs)
}
#set heading(numbering: none)
#for i in range(d.pages_notes) {
  pagebreak(weak: true)
  heading(level: 1, outlined: i == 0, [Mes notes])
  for k in range(d.lignes_notes) { block(width: 100%, height: 1cm, above: 0pt, below: 0pt, stroke: (bottom: 0.6pt + luma(120))) }
}
