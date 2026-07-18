# Château de Chambord — site interactif

Site vitrine, immersif et animé, consacré au Château de Chambord : présentation en scrollytelling, comparateur photo / plan historique, plan interactif à repères, escalier à double révolution en 3D, séquence panoramique en zoom au défilement, et galerie photo.

Site 100 % statique (HTML / CSS / JavaScript vanilla, sans dépendance ni build), pensé pour être ouvert directement dans un navigateur ou déployé tel quel (GitHub Pages, Netlify, etc.).

## Structure

```
index.html      page unique, toutes les sections
css/style.css   thème, mise en page, animations
js/main.js      interactions (parallaxe, slider, plan, panorama, galerie…)
```

## Fonctionnalités

- **Hero en parallaxe 3D** avec bascule jour/nuit (fenêtres et étoiles animées).
- **Comparateur photo ⇄ plan historique** (gravure de J. Androuet du Cerceau, 1576) pour visualiser la répartition des pièces du donjon.
- **Grand escalier à double révolution** en carte 3D avec effet de rotation et mode « plan / scan » stylisé.
- **Plan interactif** du domaine avec repères cliquables.
- **Séquence panoramique** en fondu/zoom pilotée par le défilement (façade → toits → escalier → vue aérienne).
- **Galerie** avec visionneuse plein écran.
- Site entièrement responsive, accessible au clavier, et respectueux de `prefers-reduced-motion`.

## Images

Les photographies et le plan historique proviennent de **Wikimedia Commons**, sous licence libre (Creative Commons ou domaine public). Elles sont chargées directement depuis Wikimedia Commons (pas de copie locale) ; la liste complète des fichiers utilisés, avec lien vers leur page et leur licence exacte, figure en pied de page du site.

## Lancer en local

Aucune dépendance : ouvrez simplement `index.html` dans un navigateur, ou servez le dossier avec un petit serveur statique, par exemple :

```bash
python3 -m http.server 8000
```

puis rendez-vous sur `http://localhost:8000`.

---

*Site indépendant, réalisé à des fins de découverte et de démonstration interactive. Non affilié au Domaine national de Chambord.*
