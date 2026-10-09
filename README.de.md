<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg">
    <img src="assets/logo.svg" width="64" alt="">
  </picture><br>
  Sunspill
</h1>

<p align="center"><strong>Richte dein eigenes Zimmer in wenigen Minuten ein und sieh, wo die Sonne auf seinen Boden fällt, nach Stunde und Jahreszeit.</strong></p>

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
        <img src="assets/hero-light.png" alt="Sunspill zeigt ein nach Westen gerichtetes Schlafzimmer mit dem Sonnenfleck des Nachmittags auf Boden und Bett" width="620">
      </picture>
    </td>
    <td valign="middle"><img src="assets/setup.gif" alt="Auf dem Handy: eine Adresse wird gesucht, ein Zimmertyp gewählt, das Zimmer auf der Karte über die Gebäude gedreht, bis es zur Straße zeigt, und der Sonnenfleck wandert über den Boden" width="240"></td>
  </tr>
</table>

<p align="center">
  Sonnenhöhe innerhalb von <b>0,007 Grad</b> der NREL-Referenz. <b>0 Abweichungen bei 54.000 Prüfpunkten</b> gegen pvlib und shapely (davon 1.275 nur dunkel, weil ein Gebäude, ein Baum oder eine Balkonbrüstung das Fenster beschattet).<br>
  <sub>Jedes geometrische Teil wird mit einer unabhängigen Referenz verglichen: die Sonne (pvlib, NREL SPA), die Schatten (ein Strahlenverfolger und shapely), die magnetische Deklination (pygeomag), die Verschiebungen auf der Karte (pyproj) und das Entzerren von Fotos (OpenCV). <code>node scripts/validate.mjs</code> reproduziert das, und <a href="docs/VALIDATION.md">docs/VALIDATION.md</a> nennt, was nicht geprüft ist. Mit dem Foto eines echten Zimmers wurde es noch nicht verglichen, deshalb gibt es einen Prüfmodus, der das Modell mit der Sonne vergleicht, die du gesehen hast. <a href="docs/ACCURACY.md">docs/ACCURACY.md</a> sagt, wie weit jede falsche Eingabe den Fleck verschiebt.</sub>
</p>

Es ist weder ein Rendering noch eine AR-App. Der Sonnenfleck auf dem Boden ist ein exaktes Polygon, und du kannst ihn mit einem Strahlenverfolger prüfen.

**[Live-Demo öffnen](https://arthur031221.github.io/Sunspill/)** . Kostenlos, ohne Anmeldung, und nach dem ersten Besuch auch offline. Dein Zimmer bleibt in deinem Browser. Adresssuche, Karte und Gebäudeumrisse fragen OpenStreetMap, aber nur, wenn du jedem einzelnen zustimmst.

## Dein eigenes Zimmer einrichten

Tippe auf **Mein Zimmer einrichten**. Auf dem Handy dauert es ein paar Minuten, in sieben Schritten mit Zurück und Weiter.

1. **Wo.** Gib eine Adresse ein oder setze eine Nadel auf die OpenStreetMap-Karte. Breite, Länge und Zeitzone füllen sich von selbst.
2. **Das Zimmer.** Starte mit einem typischen taiwanischen Apartment, Schlafzimmer, Wohnzimmer oder Arbeitszimmer, oder zeichne deinen eigenen Grundriss oder das Foto aus einer Anzeige mit einem Zwei-Punkte-Maßstab nach. Gib die Etage an.
3. **Fenster und Türen.** Echte Maße entlang der Wände, mit Einrasten an Wandenden, Mitte und aneinander, Balkone mit Brüstung, Vordächer und Türen.
4. **Wohin es zeigt.** Drehe das Zimmer auf der Karte über den Umriss deines Hauses, oder halte das Handy ans Fenster und lies den Kompass mit addierter magnetischer Deklination ab. Norden bleibt immer sichtbar.
5. **Was drumherum steht.** Nachbargebäude und ihre Höhen kommen von OpenStreetMap. Eine geschätzte Höhe ist markiert und lässt sich ändern. Gebäude und Bäume kannst du selbst hinzufügen.
6. **Möbel.** Stelle Betten, Schreibtische, Sofas, Regale und Pflanzen auf, verschiebe und drehe sie, und sieh, wie die Sonne darauf fällt.
7. **Mit der echten Sonne vergleichen.** Markiere, wo die Sonne zu einer Zeit, die du gesehen hast, auf dem Boden war, oder lege ein Foto des Bodens unter den Plan. Sunspill zeigt, wie weit das Modell daneben liegt, und passt Ausrichtung und Fenster an deine Markierungen an.

## Vorher und nachher

Dasselbe Schlafzimmer in Taipeh um 16:30 am 15. Juli. Drehe das Fenster von West nach Ost, und die Nachmittagssonne ist weg.

| Fenster nach Westen | Fenster nach Osten |
| :---: | :---: |
| <img src="assets/before.png" alt="Westfenster mit dem Sonnenfleck auf Boden und Bett" width="380"> | <img src="assets/after.png" alt="Ostfenster ohne Sonne im Zimmer" width="380"> |
| <b>4 h 28 min</b> direkte Sonne pro Tag nach 14:00 | <b>0 min</b> |

<sub>Mittel pro Tag über 40 Beispieltage von Juni bis September (jeder dritte), klarer Himmel, nur direkte Sonne, mit dem Nachmittagssonnen-Check im Tab Ergebnisse. Die Regel steht in der App.</sub>

## Was du tun kannst

- **Das Zimmer zeichnen.** Größe, Wanddicke, bis zu vier Fenster mit Vordach, Balkon und Brüstung, bis zu drei Türen, die Etage und drehbare Möbel.
- **Jeden Tag durchfahren.** Wähle eine Stadt, eine Adresse, deinen Standort oder Breite und Länge. Uhr, Sonnenbahn und Fleck folgen, Sommerzeit inklusive.
- **Sehen, was beschattet.** Gebäude von OpenStreetMap mit ihren Höhen, Bäume, und dein eigener Balkon und dein Vordach. Schalte jedes einzeln ab und sieh, wie viele Sonnenstunden es kostet.
- **Stunden sehen, nicht raten.** Die Sonnenstunden-Karte färbt den Boden, oder eine Fläche in gewählter Höhe, nach den Stunden direkter Sonne pro Tag.
- **Den Nachmittag prüfen.** Eine gedruckte Regel, keine Note: die Minuten nach einer gewählten Uhrzeit, in denen direkte Sonne Boden oder Wand erreicht.
- **Einen Platz für eine Pflanze finden.** Volle Sonne, Halbschatten oder wenig Licht, nach Rang geordnet.
- **Mit der Wirklichkeit vergleichen.** Markiere den gesehenen Fleck, sieh Überdeckung und Versatz in Zentimetern und passe die Ausrichtung an.
- **Teilen.** Ein Link mit dem ganzen Zimmer, eine PNG-Karte, ein GIF oder das Zimmer als JSON-Datei. Ein Schalter rundet den Ort auf ganze Grad und entfernt seinen Namen.
- **Überall nutzen.** Neun Sprachen, helles und dunkles Thema, Tastatur und Touch, Rückgängig und Wiederholen, nach dem ersten Besuch offline.

Nicht enthalten: Reflexionen, Himmelslicht, Schatten von Möbeln. Nur klarer Himmel und direkte Sonne. Gebäude sind Prismen mit flachem Dach, Bäume werfen vollen Schatten. Mit dem Foto eines echten Zimmers wurde das Modell noch nicht verglichen. Wenn du eines machen kannst, öffne ein Issue.

## Datenschutz

Dein Zimmer, die Bilder, die du nachzeichnest, und deine Markierungen verlassen deinen Browser nicht. Es gibt kein Konto, keine Analyse und keine Cookies. Drei optionale Dienste sprechen mit OpenStreetMap-Servern, jeder ist aus, bis du ihn erlaubst, und die Seite sagt vorher, was er sendet:

| Dienst | Was er sendet |
| --- | --- |
| Adresssuche (Nominatim) | der Text, den du eingibst |
| Kartenbilder (OpenStreetMap-Kacheln) | der Kartenausschnitt, den du ansiehst |
| Gebäudeumrisse (Overpass) | die Position des Zimmers, auf etwa einen Meter genau |

Du kannst jeden unter "Online-Dienste" wieder ausschalten. Die Content Security Policy der Seite nennt genau diese Hosts und keine anderen, und die Browsertests prüfen das. Mehr in [docs/PRIVACY.md](docs/PRIVACY.md).

## Installation

Öffne <https://arthur031221.github.io/Sunspill/> im Browser. Nichts zu installieren. Zum selbst Ausführen:

```sh
git clone https://github.com/Arthur031221/Sunspill.git
cd Sunspill
npm ci
npm run build
npx --yes serve dist
```

## Dokumentation

Die Dokumentation ist auf Englisch. [Usage](docs/USAGE.md) | [Privacy](docs/PRIVACY.md) | [Accuracy](docs/ACCURACY.md) | [Validation](docs/VALIDATION.md) | [Install](docs/INSTALL.md) | [Config and file format](docs/CONFIG.md) | [Library API](docs/API.md) | [Architecture](docs/ARCHITECTURE.md) | [Contributing](CONTRIBUTING.md) | [Changelog](CHANGELOG.md)

## Lizenz und Daten

MIT. Die eingebettete Schrift Fraunces steht unter der SIL Open Font License. Kartenbilder, Gebäudeumrisse und Adresssuche stammen von den OpenStreetMap-Mitwirkenden und stehen unter der Open Database License. Die Zeitzonentabelle ist `@photostructure/tz-lookup` (CC0), das Magnetfeldmodell ist das World Magnetic Model 2025 (gemeinfrei). Siehe [THIRD_PARTY.md](THIRD_PARTY.md).
