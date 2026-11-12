// Gabarit d'intérieur — roman broché KDP. Données : livre.json (produit par fabrication.py).
#let d = json("livre.json")
#set document(title: d.titre, author: d.auteur)
#set page(
  width: d.largeur_cm * 1cm, height: d.hauteur_cm * 1cm,
  margin: (inside: d.marges.int * 1cm, outside: d.marges.ext * 1cm, top: d.marges.haut * 1cm, bottom: d.marges.bas * 1cm),
  header: none, footer: none,
)
#set text(font: d.police, size: d.corps * 1pt, lang: "fr", region: "FR", hyphenate: true)
#set par(justify: true, leading: d.interligne * 1em, spacing: d.interligne * 1em, first-line-indent: 1.3em)

#let rendu(blocs) = {
  for b in blocs {
    if b.t == "sep" {
      block(above: 1.5em, below: 1.5em, width: 100%, align(center, text(size: 0.9em)[\* #h(0.9em) \* #h(0.9em) \*]))
    } else {
      par[#for r in b.runs { if r.i { emph(r.s) } else { r.s } }]
    }
  }
}

#let couvert(p, inclure-debut) = {
  let debuts = query(heading.where(level: 1)).map(h => h.location().page())
  let fins = query(<fin>).map(m => m.location().page())
  range(calc.min(debuts.len(), fins.len())).any(i =>
    (if inclure-debut { debuts.at(i) <= p } else { debuts.at(i) < p }) and p <= fins.at(i))
}
#let entete = context {
  let p = here().page()
  if couvert(p, false) {
    set text(size: 0.82em, tracking: 0.04em)
    align(center, smallcaps(if calc.odd(p) { d.titre } else { d.auteur }))
  }
}
#let pied = context {
  let p = here().page()
  if couvert(p, true) { align(center, text(size: 0.88em, str(p))) }
}

#show heading.where(level: 1): it => {
  set text(hyphenate: false, weight: "regular", size: 1.5em)
  set par(first-line-indent: 0pt, justify: false)
  v(2.6cm)
  align(center, it.body)
  v(1.5cm)
}

// ---------- Pages liminaires ----------
#[
  #set par(first-line-indent: 0pt, justify: false)
  // p. 1 — faux-titre
  #v(28%)
  #align(center, text(size: 1.25em, tracking: 0.03em, d.titre))
  // p. 3 — page de titre
  #pagebreak(to: "odd")
  #v(16%)
  #align(center)[
    #text(size: 1.15em, tracking: 0.05em, smallcaps(d.auteur))
    #v(1.4cm)
    #text(size: 2em, hyphenate: false, d.titre)
    #if d.sous_titre != "" { v(0.5cm); text(size: 1.1em, style: "italic", d.sous_titre) }
    #v(0.7cm)
    #text(size: 0.95em, d.mention_genre)
  ]
  #if d.editeur != "" { place(bottom + center, text(size: 0.95em, tracking: 0.05em, smallcaps(d.editeur))) }
  // p. 4 — mentions légales
  #pagebreak()
  #place(bottom + left, block(width: 100%, text(size: 0.78em)[
    #for l in d.mentions [#l #linebreak()]
  ]))
  #hide[.]
  #if d.dedicace != "" {
    pagebreak(to: "odd")
    v(22%)
    align(right, block(width: 70%, text(style: "italic", d.dedicace)))
  }
  #if d.exergue.texte != "" {
    pagebreak(to: "odd")
    v(22%)
    align(right, block(width: 72%)[
      #set align(right)
      #text(style: "italic", d.exergue.texte)
      #if d.exergue.source != "" { v(0.3em); text(size: 0.9em, d.exergue.source) }
    ])
  }
]

// ---------- Corps ----------
#set page(header: entete, footer: pied)
#for (i, ch) in d.chapitres.enumerate() {
  if ch.partie != none {
    pagebreak(to: "odd", weak: true)
    v(30%)
    align(center, text(size: 1.4em, tracking: 0.04em, smallcaps(ch.partie)))
    pagebreak(to: "odd")
  } else if i == 0 or d.belle_page {
    pagebreak(to: "odd", weak: true)
  } else {
    pagebreak(weak: true)
  }
  heading(level: 1, ch.titre)
  rendu(ch.blocs)
  [#metadata(none) <fin>]
}

// ---------- Annexes (remerciements, à propos de l'auteur) ----------
#for an in d.annexes {
  pagebreak(to: "odd", weak: true)
  heading(level: 1, an.titre)
  rendu(an.blocs)
  [#metadata(none) <fin>]
}
