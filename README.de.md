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
    <img src="assets/hero-light.png" alt="Sunspill zeigt ein nach Westen ausgerichtetes Schlafzimmer mit dem Sonnenfleck des Nachmittags auf Boden und Bett" width="100%">
  </picture>
</p>

<p align="center">
  Sonnenhöhe weniger als <b>0,007 Grad</b> von der NREL-Referenz entfernt. <b>0 von 3,77 Millionen</b> Prüfpunkten, an denen das Fensterlicht von einem unabhängigen Raytracer abweicht.<br>
  <sub>Sonne: 403 Stichproben in 15 Städten, 5 Tagen und 6 Uhrzeiten, verglichen mit dem Sonnenstandsalgorithmus des NREL über pvlib 0.16.1. Das Azimut liegt innerhalb von 0,06 Grad. Licht: 3.767 zufällige Zimmer mit Fenstern, Vordächern, Gebäuden gegenüber und Wandstärke, 5 Startwerte, verglichen mit einem Raytracer, der keinen Code teilt. <code>node scripts/validate.mjs</code> reproduziert beides, <a href="docs/VALIDATION.md">docs/VALIDATION.md</a> nennt, was nicht geprüft wurde.</sub>
</p>

Kein Rendering und keine AR-App. Der Fleck auf deinem Boden ist ein exaktes Polygon, und du kannst ihn mit einem Raytracer nachprüfen.

**[Live-Demo öffnen](https://arthur031221.github.io/Sunspill/)** und zieh an der Uhr. Kostenlos, ohne Anmeldung, es wird nichts gesendet, und nach dem ersten Besuch geht es auch offline.

<p align="center"><img src="assets/demo.gif" alt="Der Sonnenfleck eines Westfensters wandert über den Schlafzimmerboden, wenn man die Uhr zieht, dann das Fenster nach Osten gedreht ohne Sonne im Raum, zuletzt eine Karte der Sonnenstunden" width="760"></p>

## Vorher und nachher

Dasselbe Schlafzimmer in Taipeh um 16:30 Uhr am 15. Juli. Dreht man das Fenster von West nach Ost, sieht der Nachmittag völlig anders aus.

| Fenster nach Westen | Fenster nach Osten |
| :---: | :---: |
| <img src="assets/before.png" alt="Fenster nach Westen mit dem Sonnenfleck auf Boden und Bett" width="380"> | <img src="assets/after.png" alt="Fenster nach Osten ohne Sonne im Raum" width="380"> |
| <b>4 Std. 28 Min.</b> direkte Sonne pro Tag nach 14:00 Uhr | <b>0 Min.</b> |

<sub>Tagesmittel über 40 Stichprobentage von Juni bis September (jeder dritte Tag), klarer Himmel, nur direkte Sonne, aus dem Check der Nachmittagssonne im Tab Ergebnisse. Die Regel steht in der App.</sub>

## Was du tun kannst

- **Das Zimmer zeichnen.** Größe, Wandstärke und bis zu vier Fenster, jedes mit Vordach oder Balkon darüber und einem Gebäude gegenüber. Fenster lassen sich an ihrer Wand entlang ziehen, Möbel über den Boden.
- **Jeden Tag durchfahren.** Wähle einen Ort aus der eingebauten Liste, deinen Standort oder Breiten- und Längengrad. Uhr, Sonnenbahn und Fleck folgen, Sommerzeit inklusive.
- **Stunden sehen statt raten.** Die Karte der Sonnenstunden färbt den Boden, oder eine Fläche in gewählter Höhe, nach den Stunden direkter Sonne pro Tag für einen Tag, einen Monat, ein Jahr oder einen Monatsbereich.
- **Den Nachmittag prüfen.** Eine gedruckte Regel statt einer Note: die Minuten nach der gewählten Uhrzeit, in denen direkte Sonne Boden oder Wand erreicht, gemittelt über die gewählten Monate.
- **Einen Platz für eine Pflanze finden.** Volle Sonne, Halbschatten oder wenig Licht, für eine Standfläche von 30 cm, die besten Plätze zuerst, mindestens 60 cm voneinander entfernt.
- **Teilen.** Ein Link, der das ganze Zimmer enthält, eine PNG-Karte, ein GIF oder eine JSON-Datei. Ein Schalter rundet den Ort auf ganze Grad und entfernt seinen Namen.
- **Überall nutzen.** Neun Sprachen, helles und dunkles Design, Tastatur und Touch, Handy-Layout, Rückgängig und Wiederholen, nach dem ersten Besuch auch offline.

Nicht enthalten: Spiegelungen, diffuses Himmelslicht und Möbelschatten. Klarer Himmel, nur direkte Sonne. Das Modell wurde noch nicht mit dem Foto eines echten Zimmers verglichen. Wenn du eines machen kannst, eröffne bitte ein Issue.

## Installation

Öffne <https://arthur031221.github.io/Sunspill/> im Browser, es gibt nichts zu installieren. Zum selbst Ausführen:

```sh
git clone https://github.com/Arthur031221/Sunspill.git
cd Sunspill
npm ci
npm run build
npx --yes serve dist
```

## Dokumentation

Die Dokumentation ist auf Englisch. [Usage](docs/USAGE.md) | [Install](docs/INSTALL.md) | [Config and file format](docs/CONFIG.md) | [Library API](docs/API.md) | [Architecture](docs/ARCHITECTURE.md) | [Validation](docs/VALIDATION.md) | [Contributing](CONTRIBUTING.md)

## Lizenz

MIT. Die Schrift Fraunces ist unter der SIL Open Font License eingebettet, siehe [THIRD_PARTY.md](THIRD_PARTY.md).
