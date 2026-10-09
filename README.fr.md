<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg">
    <img src="assets/logo.svg" width="64" alt="">
  </picture><br>
  Sunspill
</h1>

<p align="center"><strong>See where the sun lands in your room, by the hour and the season, before you rent, buy blinds or move a plant.</strong></p>

<p align="center">
  <a href="https://github.com/Arthur031221/Sunspill/actions/workflows/ci.yml"><img src="https://github.com/Arthur031221/Sunspill/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-231b12?style=flat-square" alt="MIT license"></a>
  <a href="https://arthur031221.github.io/Sunspill/"><img src="https://img.shields.io/badge/live%20demo-open-f5a524?style=flat-square" alt="Live demo"></a>
  <a href="https://github.com/Arthur031221/Sunspill/stargazers"><img src="https://img.shields.io/github/stars/Arthur031221/Sunspill?style=flat-square&color=f5a524" alt="GitHub stars"></a>
</p>

<p align="center">
  <a href="README.md">English</a> | <a href="README.zh-TW.md">zh-TW</a> | <a href="README.zh-CN.md">zh-CN</a> | <a href="README.ja.md">ja</a> | <a href="README.ko.md">ko</a> | <a href="README.es.md">es</a> | <a href="README.fr.md">fr</a> | <a href="README.de.md">de</a> | <a href="README.pt-BR.md">pt-BR</a>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/hero-dark.png">
    <img src="assets/hero-light.png" alt="Sunspill montrant une chambre orientée à l'ouest avec la tache de soleil de l'après-midi sur le sol et le lit" width="100%">
  </picture>
</p>

<p align="center">
  Hauteur du soleil à moins de <b>0,007 degré</b> de la référence NREL. <b>0 sur 3,77 millions</b> de points de test où la lumière de la fenêtre diffère d'un lancer de rayons indépendant.<br>
  <sub>Soleil : 403 échantillons dans 15 villes, 5 jours et 6 heures, comparés à l'algorithme de position solaire du NREL via pvlib 0.16.1. L'azimut reste à moins de 0,06 degré. Lumière : 3 767 pièces aléatoires avec fenêtres, auvents, immeubles en face et épaisseur de mur, 5 graines, comparées à un lancer de rayons qui ne partage aucun code. <code>node scripts/validate.mjs</code> les reproduit, et <a href="docs/VALIDATION.md">docs/VALIDATION.md</a> dit ce qui n'est pas vérifié.</sub>
</p>

Ce n'est ni un rendu ni une appli de réalité augmentée. La tache sur votre sol est un polygone exact, et on peut la vérifier avec un lancer de rayons.

**[Ouvrir la démo en ligne](https://arthur031221.github.io/Sunspill/)** et faites glisser l'horloge. C'est gratuit, sans compte, rien n'est envoyé nulle part, et la page s'ouvre hors connexion après la première visite.

<p align="center"><img src="assets/demo.gif" alt="La tache de soleil d'une fenêtre ouest traversant le sol de la chambre quand on fait glisser l'horloge, puis la fenêtre tournée vers l'est sans soleil à l'intérieur, enfin une carte des heures de soleil" width="760"></p>

## Avant et après

La même chambre à Taipei à 16 h 30 le 15 juillet. Tourner la fenêtre de l'ouest vers l'est change complètement l'après-midi.

| Fenêtre à l'ouest | Fenêtre à l'est |
| :---: | :---: |
| <img src="assets/before.png" alt="Fenêtre à l'ouest avec la tache de soleil sur le sol et le lit" width="380"> | <img src="assets/after.png" alt="Fenêtre à l'est sans soleil à l'intérieur" width="380"> |
| <b>4 h 28 min</b> de soleil direct par jour après 14 h | <b>0 min</b> |

<sub>Moyenne par jour sur 40 jours échantillonnés de juin à septembre (un jour sur trois), ciel clair et soleil direct seulement, d'après la vérification du soleil de l'après-midi dans l'onglet Résultats. La règle est affichée dans l'appli.</sub>

## Ce que vous pouvez faire

- **Dessiner la pièce.** Dimensions, épaisseur des murs et jusqu'à quatre fenêtres, chacune avec un auvent ou un balcon au-dessus et un immeuble en face. Faites glisser les fenêtres le long de leur mur et les meubles sur le sol.
- **Parcourir n'importe quel jour.** Choisissez un lieu dans la liste intégrée, votre position ou une latitude et une longitude. L'horloge, la trajectoire du soleil et la tache suivent, heure d'été comprise.
- **Voir des heures, pas des impressions.** La carte des heures de soleil colorie le sol, ou une surface à la hauteur choisie, selon les heures de soleil direct par jour sur un jour, un mois, une année ou une plage de mois.
- **Vérifier l'après-midi.** Une règle affichée, pas une note : les minutes après l'heure choisie où le soleil direct atteint le sol ou un mur, en moyenne sur les mois choisis.
- **Trouver une place pour une plante.** Plein soleil, mi-ombre ou peu de lumière, pour une assise de 30 cm, avec les meilleures places d'abord, à 60 cm au moins les unes des autres.
- **Partager.** Un lien qui contient toute la pièce, une carte PNG, un GIF ou un fichier JSON. Un interrupteur arrondit le lieu à des degrés entiers et retire son nom.
- **Partout.** Neuf langues, thèmes clair et sombre, clavier et tactile, mise en page mobile, annuler et rétablir, et usage hors connexion après la première visite.

Ce qui n'est pas inclus : reflets, lumière diffuse du ciel et ombres des meubles. Ciel clair et soleil direct seulement. Le modèle n'a pas encore été comparé à la photo d'une vraie pièce. Si vous pouvez en prendre une, ouvrez un ticket.

## Installation

Ouvrez <https://arthur031221.github.io/Sunspill/> dans le navigateur, rien à installer. Pour le lancer vous-même :

```sh
git clone https://github.com/Arthur031221/Sunspill.git
cd Sunspill
npm ci
npm run build
npx --yes serve dist
```

## Documentation

La documentation est en anglais. [Usage](docs/USAGE.md) | [Install](docs/INSTALL.md) | [Config and file format](docs/CONFIG.md) | [Library API](docs/API.md) | [Architecture](docs/ARCHITECTURE.md) | [Validation](docs/VALIDATION.md) | [Contributing](CONTRIBUTING.md)

## Licence

MIT. La police Fraunces est intégrée sous la SIL Open Font License, voir [THIRD_PARTY.md](THIRD_PARTY.md).
