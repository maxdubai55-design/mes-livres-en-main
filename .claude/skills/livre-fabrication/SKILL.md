---
name: livre-fabrication
description: Fabrique les fichiers définitifs d'un livre verrouillé — Word, PDF intérieur KDP, couverture complète, couverture numérique, EPUB — puis exécute le contrôle final. Usage /livre-fabrication <slug>.
---

# Fabrication et contrôle final — `$ARGUMENTS`

Préalable : manuscrit verrouillé. Pour un essai avant verrouillage : `python3 outils/livre.py fabriquer <slug> --epreuve`.

1. **Réglages** dans `livre.json` → `format` : taille de coupe (13,34 × 20,32 cm par défaut ; 12,85 × 19,84 ;
   13,97 × 21,59 ; 15,24 × 22,86), papier `creme` ou `blanc`, corps, `chapitres_en_belle_page`.
   `couverture` : couleurs `fond`, `texte`, `accent` ; `image` facultative (chemin d'un fichier fourni par l'auteur,
   dont il détient les droits, 300 ppp au moins). Sans image, la couverture est typographique.
   Pages de fin facultatives : `annexes/remerciements.md`, `annexes/auteur.md`.
2. `python3 outils/livre.py controle-final <slug>` — relance tous les contrôles du texte, fabrique tous les fichiers,
   vérifie le PDF intérieur (taille de coupe, nombre de pages, marges mesurées page par page, polices incorporées,
   pages blanches), la couverture (dimensions calculées d'après le nombre de pages et le papier, dos, zone du
   code-barres, marges de sécurité, couverture numérique 1600 × 2560), l'EPUB et les métadonnées.
3. **Contrôle visuel**, obligatoire, par lecture des images :
   - l'épreuve de couverture `sortie/<slug>_couverture_EPREUVE.png` : rien ne touche les pointillés bleus, rien dans
     la zone du code-barres, titre lisible en vignette, dos centré ;
   - le PDF intérieur : pages liminaires, première et dernière page de trois chapitres au moins, une page de
     séparateur de scène, la dernière page du livre. Chercher lignes veuves, titres en bas de page, blancs anormaux.
4. En cas d'échec : corriger la cause (réglage ou gabarit), jamais le seuil. Si la cause est dans le texte, il faut
   déverrouiller avec un motif.
5. Remettre à l'auteur : la liste des fichiers de `sortie/`, `RAPPORT_FINAL.md`, et les étapes de dépôt KDP
   (broché : PDF intérieur + PDF de couverture, sans fond perdu pour l'intérieur ; numérique : EPUB + JPG).
   Rappeler ce que la machine n'a pas fait : relecture humaine de l'épreuve, aperçu Kindle, commande d'un exemplaire
   d'épreuve imprimé avant mise en vente. Commit et push.
