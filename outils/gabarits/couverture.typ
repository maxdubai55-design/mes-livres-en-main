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

// ---------- Modèle de collection (fascicules) : même maquette pour tous les titres, seule la couleur change ----------
#let sans = d.police_titres
#let encre = rgb(d.texte)
#let coche(taille, couleur) = box(circle(radius: taille * 0.62, fill: white,
  align(center + horizon, text(font: sans, weight: "bold", size: taille, fill: couleur, "✓"))))
#let premiere-serie(w, h) = block(width: w, height: h)[
  #let m = w * 0.085
  #let lw = w - 2 * m
  #set par(justify: false, leading: 0.5em)
  // Filet de collection en haut
  #place(top + left, dx: m, dy: h * 0.05, box(fill: white, radius: h * 0.006, inset: (x: h * 0.016, y: h * 0.011),
    text(font: sans, weight: "bold", size: h * 0.0165, tracking: 0.07em, fill: rgb(d.fond), upper(d.collection))))
  #place(top + right, dx: -m, dy: h * 0.036, circle(radius: h * 0.036, fill: c-accent,
    align(center + horizon, text(font: sans, weight: "bold", size: h * 0.036, fill: encre, str(d.numero)))))
  // Panneau du titre
  #place(top + left, dx: m, dy: h * 0.15, block(width: lw, height: h * 0.47, fill: white, radius: h * 0.014, inset: h * 0.035)[
    #ajuste(d.titre, lw - h * 0.07, h * 0.27, (72, 66, 62, 58, 54, 50, 46, 42, 38, 34, 30, 26).map(t => t * h / 25.4cm), font: sans, weight: "bold", fill: encre)
    #v(h * 0.012)
    #line(length: 22%, stroke: h * 0.007 + rgb(d.fond))
    #v(h * 0.008)
    #block(width: lw * 0.72, text(font: sans, size: h * 0.0225, fill: encre, d.sous_titre))
  ])
  // Emblème rond, à cheval sur le panneau
  #place(top + right, dx: -m * 0.55, dy: h * 0.535, circle(radius: h * 0.078, fill: c-accent, stroke: h * 0.007 + rgb(d.fond),
    align(center + horizon, text(font: sans, weight: "bold", size: if d.embleme.len() > 2 { h * 0.036 } else { h * 0.07 }, fill: encre, d.embleme))))
  // Trois promesses
  #place(top + left, dx: m, dy: h * 0.69, stack(spacing: h * 0.02, ..d.points.map(p =>
    grid(columns: (h * 0.05, 1fr), align: (left + horizon, left + horizon),
      coche(h * 0.022, rgb(d.fond)), text(font: sans, weight: "bold", size: h * 0.027, fill: white, p)))))
  // Pied : auteur et mention
  #place(bottom + left, dx: m, dy: -h * 0.075, line(length: lw, stroke: h * 0.002 + white))
  #place(bottom + left, dx: m, dy: -h * 0.04, text(font: sans, weight: "bold", size: h * 0.026, fill: white, d.auteur))
  #place(bottom + right, dx: -m, dy: -h * 0.043, text(font: sans, weight: "bold", size: h * 0.0155, tracking: 0.09em, fill: c-accent, upper(d.mention_serie)))
]

#if d.mode == "ebook" {
  let w = 16cm
  let h = 25.6cm
  set page(width: w, height: h, margin: 0pt, fill: rgb(d.fond))
  if d.image != none { place(top + left, image(d.image, width: w, height: h, fit: "cover")) }
  if d.modele == "serie" { premiere-serie(w, h) } else { premiere(w, h, 1.8cm) }
} else if d.modele == "serie" {
  let W = 2 * L + dos + 2 * fp
  let HT = H + 2 * fp
  set page(width: W, height: HT, margin: 0pt, fill: rgb(d.fond))
  let x1 = fp + L + dos
  place(top + left, dx: x1, dy: fp, premiere-serie(L, H))
  // Quatrième : même filet de collection, panneau blanc, texte en gros caractères
  let m = L * 0.085
  let zone-cb = d.reserve_code_barres_cm * 1cm
  place(top + left, dx: fp + m, dy: fp + H * 0.05, box(fill: white, radius: H * 0.006, inset: (x: H * 0.016, y: H * 0.011),
    text(font: sans, weight: "bold", size: H * 0.0165, tracking: 0.07em, fill: rgb(d.fond), upper(d.collection))))
  let hp = H - H * 0.15 - zone-cb - 0.3cm
  place(top + left, dx: fp + m, dy: fp + H * 0.15, block(width: L - 2 * m, height: hp, fill: white, radius: H * 0.014, inset: H * 0.032)[
    #set par(justify: false, first-line-indent: 0pt, spacing: 1em, leading: 0.62em)
    #set text(fill: encre)
    #let corps = [
      #text(font: sans, weight: "bold", size: 1.25em, d.accroche)
      #v(0.3em)
      #for p in d.quatrieme [#par(p)]
    ]
    #ajuste(corps, L - 2 * m - H * 0.064, hp - H * 0.064, (15, 14.5, 14, 13.5, 13, 12.5, 12, 11.5, 11, 10.5, 10))
  ])
  place(top + left, dx: fp + m, dy: fp + H - zone-cb + 0.75cm, block(width: L - 2 * m - 6.2cm)[
    #set par(justify: false, leading: 0.5em)
    #text(font: sans, weight: "bold", size: H * 0.019, fill: white, d.auteur) \
    #text(font: sans, size: H * 0.0145, fill: white, d.bio)
  ])
  if d.guides {
    let trait = 0.5pt + rgb("#ff2d55")
    place(top + left, dx: fp, dy: fp, rect(width: 2 * L + dos, height: H, stroke: trait))
    place(top + left, dx: fp + L, dy: 0pt, line(angle: 90deg, length: HT, stroke: trait))
    place(top + left, dx: fp + L + dos, dy: 0pt, line(angle: 90deg, length: HT, stroke: trait))
    let s = d.securite_cm * 1cm
    let tirets = (paint: white, thickness: 0.6pt, dash: "dashed")
    place(top + left, dx: fp + s, dy: fp + s, rect(width: L - 2 * s, height: H - 2 * s, stroke: tirets))
    place(top + left, dx: x1 + s, dy: fp + s, rect(width: L - 2 * s, height: H - 2 * s, stroke: tirets))
    place(top + left, dx: d.cb.x * 1cm, dy: d.cb.y * 1cm,
      rect(width: d.cb.l * 1cm, height: d.cb.h * 1cm, fill: white, stroke: trait,
        align(center + horizon, text(fill: black, size: 7pt)[Code-barres KDP])))
  }
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
