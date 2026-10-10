<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg">
    <img src="assets/logo.svg" width="64" alt="">
  </picture><br>
  Sunspill
</h1>

<p align="center"><strong>Configurez votre propre pièce en quelques minutes et voyez où le soleil tombe sur son sol, heure par heure et saison par saison.</strong></p>

<p align="center">
  <a href="https://github.com/Arthur031221/Sunspill/actions/workflows/ci.yml"><img src="https://github.com/Arthur031221/Sunspill/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-231b12?style=flat-square" alt="MIT license"></a>
  <a href="https://arthur031221.github.io/Sunspill/"><img src="https://img.shields.io/badge/live%20demo-open-f5a524?style=flat-square" alt="Live demo"></a>
  <a href="https://github.com/Arthur031221/Sunspill/releases"><img src="https://img.shields.io/github/v/release/Arthur031221/Sunspill?style=flat-square&color=c2410c" alt="Latest release"></a>
  <a href="https://github.com/Arthur031221/Sunspill/stargazers"><img src="https://img.shields.io/github/stars/Arthur031221/Sunspill?style=flat-square&color=f5a524" alt="GitHub stars"></a>
</p>

<p align="center">
  <a href="README.md">English</a> | <a href="README.zh-TW.md">zh-TW</a> | <a href="README.zh-CN.md">zh-CN</a> | <a href="README.ja.md">ja</a> | <a href="README.ko.md">ko</a> | <a href="README.es.md">es</a> | <a href="README.fr.md">fr</a> | <a href="README.de.md">de</a> | <a href="README.pt-BR.md">pt-BR</a>
</p>

<table align="center">
  <tr>
    <td valign="middle">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="assets/hero-dark.png">
        <img src="assets/hero-light.png" alt="Sunspill montrant une chambre orientée à l'ouest avec la tache de soleil de l'après-midi sur le sol et le lit" width="560">
      </picture>
    </td>
    <td valign="middle"><img src="assets/setup.gif" alt="Sur un téléphone : on cherche une adresse, on choisit un type de pièce, on la tourne sur les bâtiments de la carte jusqu'à ce qu'elle donne sur la rue, et la tache de soleil traverse le sol" width="220"></td>
  </tr>
</table>

**[Ouvrir la démo en ligne](https://arthur031221.github.io/Sunspill/)** . C'est gratuit, sans compte, et ça s'ouvre hors ligne après la première visite. Pensée pour le téléphone : sept étapes et quelques minutes d'une adresse à votre propre pièce. Votre pièce reste dans votre navigateur. La recherche d'adresse, la carte et les contours de bâtiments interrogent OpenStreetMap, mais seulement après votre accord pour chacun.

Ce n'est ni un rendu ni une application de réalité augmentée. La tache de soleil au sol est un polygone exact, et vous pouvez la comparer à un traceur de rayons.

## Configurer votre propre pièce

Appuyez sur **Configurer ma pièce**. Sur un téléphone, il faut quelques minutes, en sept étapes avec des boutons Retour et Suivant.

1. **Où.** Saisissez une adresse ou posez une épingle sur la carte OpenStreetMap. La latitude, la longitude et le fuseau horaire se remplissent seuls. Une adresse avec numéro et étage fonctionne, comme 台北市信義區市府路45號7樓. Si OpenStreetMap n'a pas le numéro, vous obtenez la rue et un rappel de placer une épingle sur votre immeuble.
2. **La pièce.** Partez d'un studio, d'une chambre, d'un salon ou d'un bureau (les dimensions suivent les logements typiques de Taïwan, corrigez-les), ou décalquez votre plan ou la photo d'une annonce avec une échelle à deux points. Indiquez l'étage.
3. **Fenêtres et portes.** Dimensions réelles le long des murs, avec aimantation aux bouts du mur, au milieu et entre elles, balcons avec garde-corps, auvents et portes.
4. **Vers où ça donne.** Tournez la pièce sur le contour de votre immeuble dans la carte, ou posez le téléphone contre la fenêtre et lisez sa boussole avec la déclinaison magnétique ajoutée. Le nord reste toujours visible.
5. **Ce qui l'entoure.** Les bâtiments voisins et leur hauteur viennent d'OpenStreetMap. Une hauteur estimée est marquée et modifiable.Un bâtiment sans hauteur est estimé d'après les plus proches qui en ont une. Ajoutez des bâtiments et des arbres à la main. Une horloge sur la carte montre où est le soleil et cerne les bâtiments qui font de l'ombre à une fenêtre à cette heure.
6. **Meubles.** Placez, déplacez et tournez lits, bureaux, canapés, étagères et plantes, et regardez le soleil les atteindre.
7. **Comparer au vrai soleil.** Marquez où se trouvait le soleil au sol à une heure que vous avez vue, ou posez une photo du sol sous le plan. Sunspill montre de combien le modèle s'écarte et ajuste l'orientation et la fenêtre à vos marques.

## Avant et après

La même chambre à Taipei à 16:30 le 15 juillet. Tournez la fenêtre de l'ouest vers l'est et le soleil de l'après-midi disparaît.

| Fenêtre à l'ouest | Fenêtre à l'est |
| :---: | :---: |
| <img src="assets/before.png" alt="Fenêtre à l'ouest avec la tache de soleil sur le sol et le lit" width="380"> | <img src="assets/after.png" alt="Fenêtre à l'est sans soleil à l'intérieur" width="380"> |
| <b>4 h 28 min</b> de soleil direct par jour après 14:00 | <b>0 min</b> |

<sub>Moyenne par jour sur 40 jours d'échantillon de juin à septembre (un sur trois), ciel dégagé, soleil direct seulement, avec le contrôle du soleil de l'après-midi de l'onglet Résultats. La règle est imprimée dans l'application.</sub>

## Ce que vous pouvez faire

- **Dessiner la pièce.** Taille, épaisseur des murs, jusqu'à quatre fenêtres avec auvent, balcon et garde-corps, jusqu'à trois portes, l'étage et des meubles que l'on peut tourner.
- **Parcourir n'importe quel jour.** Choisissez une ville, une adresse, votre position ou une latitude et une longitude. L'horloge, la course du soleil et la tache suivent, heure d'été comprise.
- **Voir ce qui fait de l'ombre.** Bâtiments d'OpenStreetMap avec leur hauteur, arbres, et votre propre balcon et auvent. Coupez-les un à un pour voir ce qu'ils coûtent en heures de soleil.
- **Voir des heures, pas des suppositions.** La carte des heures de soleil colore le sol, ou une surface à la hauteur choisie, selon les heures de soleil direct par jour.
- **Vérifier l'après-midi.** Une règle imprimée, pas une note : les minutes après une heure choisie où le soleil direct atteint le sol ou un mur.
- **Trouver une place pour une plante.** Plein soleil, soleil partiel ou peu de lumière, classées.
- **Comparer à la réalité.** Marquez la tache que vous avez vue, voyez le recouvrement et l'écart en centimètres, et ajustez l'orientation.
- **Garder plusieurs pièces.** Donnez un nom à une pièce et gardez-en jusqu'à douze dans ce navigateur, pour passer d'un logement à l'autre.
- **Partager.** Un lien qui contient toute la pièce, une carte PNG, un GIF, ou la pièce en fichier JSON. Un interrupteur arrondit le lieu à des degrés entiers et retire son nom.
- **L'utiliser partout.** Neuf langues, thèmes clair et sombre, clavier et tactile, annuler et rétablir, hors ligne après la première visite.

Ne sont pas inclus : les reflets, la lumière du ciel, les ombres des meubles. Ciel dégagé et soleil direct seulement. Les bâtiments sont des prismes à toit plat et les arbres donnent une ombre pleine. Le modèle n'a pas encore été comparé à la photo d'une vraie pièce. Si vous pouvez en prendre une, ouvrez une issue.

## Quelle est sa précision

Hauteur du soleil à moins de <b>0,007 degré</b> de la référence NREL. <b>0 désaccord sur 54 000 points de test</b> face à pvlib et shapely (dont 1 275 ne sont sombres que parce qu'un bâtiment, un arbre ou un garde-corps de balcon ombrage la fenêtre).

Chaque morceau de géométrie est comparé à une référence indépendante : le soleil (pvlib, NREL SPA), les ombres (un traceur de rayons et shapely), la déclinaison magnétique (pygeomag), les décalages sur la carte (pyproj) et la mise à plat des photos (OpenCV). <code>node scripts/validate.mjs</code> le reproduit et <a href="docs/VALIDATION.md">docs/VALIDATION.md</a> liste ce qui n'est pas vérifié. Il n'a pas encore été comparé à la photo d'une vraie pièce, d'où un mode de contrôle qui compare le modèle à ce que vous avez vu. <a href="docs/ACCURACY.md">docs/ACCURACY.md</a> dit de combien chaque erreur déplace la tache.

Une hauteur absente d'OpenStreetMap est estimée d'après les bâtiments les plus proches qui en ont une. En écartant les bâtiments un par un sur cinq secteurs de Taipei, l'erreur médiane était d'un facteur 1,2 à 1,3, contre 1,7 à 5,7 pour neuf mètres fixes.

## Vie privée

Votre pièce, les images que vous décalquez et les marques que vous faites ne quittent pas votre navigateur. Les pièces que vous enregistrez sous un nom restent aussi dans ce navigateur. Pas de compte, pas de mesure d'audience, pas de cookie. Trois services facultatifs parlent à des serveurs d'OpenStreetMap, chacun désactivé tant que vous ne l'autorisez pas, et la page dit d'abord ce qu'il envoie :

| Service | Ce qu'il envoie |
| --- | --- |
| Recherche d'adresse (Nominatim) | le texte que vous saisissez |
| Images de la carte (tuiles OpenStreetMap) | la partie de la carte que vous regardez |
| Contours de bâtiments (Overpass) | la position de la pièce, à un mètre près |

Vous pouvez désactiver chacun dans « Services en ligne ». La politique de sécurité de contenu de la page ne nomme que ces hôtes, et les tests du navigateur le vérifient. Voir [docs/PRIVACY.md](docs/PRIVACY.md).

## Installation

Ouvrez <https://arthur031221.github.io/Sunspill/> dans le navigateur. Rien à installer. Pour l'exécuter vous-même :

```sh
git clone https://github.com/Arthur031221/Sunspill.git
cd Sunspill
npm ci
npm run build
npx --yes serve dist
```

## Documentation

La documentation est en anglais. [Usage](docs/USAGE.md) | [Privacy](docs/PRIVACY.md) | [Accuracy](docs/ACCURACY.md) | [Validation](docs/VALIDATION.md) | [Install](docs/INSTALL.md) | [Config and file format](docs/CONFIG.md) | [Library API](docs/API.md) | [Architecture](docs/ARCHITECTURE.md) | [Contributing](CONTRIBUTING.md) | [Changelog](CHANGELOG.md)

## Licence et données

MIT. La police Fraunces intégrée est sous SIL Open Font License. Les images de la carte, les contours de bâtiments et la recherche d'adresse viennent des contributeurs d'OpenStreetMap et sont sous Open Database License. La table des fuseaux horaires est `@photostructure/tz-lookup` (CC0) et le modèle du champ magnétique est le World Magnetic Model 2025 (domaine public). Voir [THIRD_PARTY.md](THIRD_PARTY.md).

Assisted by Claude/Codex.
