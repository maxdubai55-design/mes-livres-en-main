// Gabarit de couverture KDP (4e + dos + 1re, fond perdu inclus) et couverture numérique.
#let d = json("couverture.json")
#let fp = d.fond_perdu_cm * 1cm
#let L = d.largeur_cm * 1cm
#let H = d.hauteur_cm * 1cm
#let dos = d.dos_cm * 1cm
#let c-texte = rgb(d.texte)
#let c-accent = rgb(d.accent)
#set text(font: d.police, lang: "fr", region: "FR", fill: c-texte)
#set par(leading: 0.6em)

// Choisit le plus grand corps tel que chaque mot du titre tienne dans la largeur et le bloc dans la hauteur.
#let ajuste(corps, largeur, hauteur-max, tailles, ..args) = context {
  let choix = tailles.last()
  for t in tailles {
    let bloc = block(width: largeur, text(size: t * 1pt, hyphenate: false, ..args, corps))
    let mots-ok = if type(corps) == str {
      corps.split(" ").all(m => measure(text(size: t * 1pt, ..args, m)).width <= largeur)
    } else { true }
    if mots-ok and measure(bloc).height <= hauteur-max { choix = t; break }
  }
  block(width: largeur, text(size: choix * 1pt, hyphenate: false, ..args, corps))
}

#let premiere(w, h, m) = block(width: w, height: h, inset: m)[
  #set align(center)
  #set par(justify: false)
  #let lw = w - 2 * m
  #v(4%)
  #text(size: h * 0.028, tracking: 0.12em, smallcaps(d.auteur))
  #v(11%)
  #ajuste(d.titre, lw, h * 0.34, (54, 48, 44, 40, 36, 32, 28, 24, 20, 17).map(t => t * h / 20.32cm), tracking: 0.01em)
  #v(h * 0.02)
  #line(length: 18%, stroke: 0.8pt + c-accent)
  #v(h * 0.02)
  #if d.sous_titre != "" { text(size: h * 0.024, style: "italic", d.sous_titre) }
  #place(bottom + center, text(size: h * 0.02, tracking: 0.14em, fill: c-accent, smallcaps(d.mention_genre)))
]

#if d.mode == "ebook" {
  let w = 16cm
  let h = 25.6cm
  set page(width: w, height: h, margin: 0pt, fill: rgb(d.fond))
  if d.image != none { place(top + left, image(d.image, width: w, height: h, fit: "cover")) }
  premiere(w, h, 1.8cm)
} else {
  let W = 2 * L + dos + 2 * fp
  let HT = H + 2 * fp
  set page(width: W, height: HT, margin: 0pt, fill: rgb(d.fond))
  let x1 = fp + L + dos
  if d.image != none { place(top + left, dx: x1, image(d.image, width: L + fp, height: HT, fit: "cover")) }
  // Première de couverture
  place(top + left, dx: x1, dy: fp, premiere(L, H, 1.5cm))
  // Dos — lecture de bas en haut (usage français)
  if d.texte_dos {
    place(top + left, dx: fp + L, dy: fp, block(width: dos, height: H,
      align(center + horizon, rotate(-90deg, reflow: true,
        text(size: d.corps_dos * 1pt, tracking: 0.04em)[#d.titre #h(1.2em) #text(fill: c-accent, smallcaps(d.auteur))]))))
  }
  // Quatrième de couverture
  let m = 1.5cm
  let zone-cb = d.reserve_code_barres_cm * 1cm
  place(top + left, dx: fp, dy: fp, block(width: L, height: H - zone-cb, inset: (x: m, top: m + 0.4cm, bottom: 0.3cm))[
    #set par(justify: true, first-line-indent: 0pt, spacing: 0.9em)
    #let corps = [
      #for p in d.quatrieme [#par(p)]
      #if d.bio != "" [#v(0.6em) #line(length: 12%, stroke: 0.6pt + c-accent) #v(0.2em) #par(text(style: "italic", d.bio))]
    ]
    #ajuste(corps, L - 2 * m, H - zone-cb - 2 * m - 0.7cm, (11.5, 11, 10.5, 10, 9.5, 9, 8.5, 8).map(t => t * H / 20.32cm))
  ])
  if d.guides {
    let trait = 0.5pt + rgb("#ff2d55")
    place(top + left, dx: fp, dy: fp, rect(width: 2 * L + dos, height: H, stroke: trait))
    place(top + left, dx: fp + L, dy: 0pt, line(angle: 90deg, length: HT, stroke: trait))
    place(top + left, dx: fp + L + dos, dy: 0pt, line(angle: 90deg, length: HT, stroke: trait))
    let s = d.securite_cm * 1cm
    let tirets = (paint: rgb("#00a2ff"), thickness: 0.5pt, dash: "dashed")
    place(top + left, dx: fp + s, dy: fp + s, rect(width: L - 2 * s, height: H - 2 * s, stroke: tirets))
    place(top + left, dx: x1 + s, dy: fp + s, rect(width: L - 2 * s, height: H - 2 * s, stroke: tirets))
    place(top + left, dx: d.cb.x * 1cm, dy: d.cb.y * 1cm,
      rect(width: d.cb.l * 1cm, height: d.cb.h * 1cm, fill: white, stroke: trait,
        align(center + horizon, text(fill: black, size: 7pt)[Code-barres KDP])))
  }
}
