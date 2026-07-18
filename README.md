# Le Bousquet — site du village

Site vitrine dynamique pour Le Bousquet, village de la vallée de l'Ayguette dans les Pyrénées audoises (Aude, Occitanie) : présentation du village, patrimoine, nature et randonnées, vie locale, agenda, actualités, galerie photo et contact.

Site 100% statique (HTML/CSS/JS, sans framework ni dépendance de build), pensé pour être facile à héberger (GitHub Pages, Netlify, OVH…) et à faire évoluer.

## Structure du projet

```
index.html                 Page principale (toutes les sections)
assets/
  css/style.css            Styles (thème clair/sombre, animations, responsive)
  js/main.js                Interactions (nav, thème, comparateur photo, galerie, agenda/actualités dynamiques)
  data/agenda.json          Événements à venir — affichés automatiquement sur le site
  data/actualites.json      Actualités du village — affichées automatiquement sur le site
  img/                       Photos du village (cartes postales et vues aériennes)
```

## Mettre le site à jour

- **Agenda** : modifier `assets/data/agenda.json` (un événement par entrée : date, titre, catégorie, horaire, lieu, description). Les événements passés disparaissent automatiquement.
- **Actualités** : modifier `assets/data/actualites.json` de la même façon.
- **Photos** : ajouter les images dans `assets/img/` puis les référencer dans la section « Galerie » de `index.html`.
- **Textes à compléter** : plusieurs sections contiennent des mentions *[à compléter]* (mairie, associations, commerces, horaires, contacts, sentiers de randonnée) à remplacer par les informations réelles du village.

## Ce qui reste à brancher pour une mise en production

- **Formulaire de contact et newsletter** : actuellement en démonstration côté navigateur uniquement. À relier à un service d'envoi (Formspree, Netlify Forms, ou une adresse email de la mairie).
- **Coordonnées de la mairie** (adresse, téléphone, email, horaires) et **liste des associations/commerces** à renseigner.
- **Nom de domaine** : le site peut être publié tel quel sur GitHub Pages, puis relié à un nom de domaine (par exemple celui déjà utilisé par le village).

## Aperçu en local

Le site n'ayant pas de dépendance de build, il suffit d'un serveur statique :

```bash
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```
