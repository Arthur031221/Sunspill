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
    <img src="assets/hero-light.png" alt="Sunspill mostrando un dormitorio orientado al oeste con la mancha de sol de la tarde sobre el suelo y la cama" width="100%">
  </picture>
</p>

<p align="center">
  Altura del sol a menos de <b>0,007 grados</b> de la referencia NREL. <b>0 de 3,77 millones</b> de puntos de prueba en los que la luz de la ventana difiere de un trazador de rayos independiente.<br>
  <sub>Sol: 403 muestras en 15 ciudades, 5 días y 6 horas, contra el algoritmo de posición solar del NREL mediante pvlib 0.16.1. El acimut queda a menos de 0,06 grados. Luz: 3.767 habitaciones aleatorias con ventanas, aleros, edificios enfrente y grosor de muro, 5 semillas, comparadas con un trazador de rayos que no comparte código. <code>node scripts/validate.mjs</code> lo reproduce y <a href="docs/VALIDATION.md">docs/VALIDATION.md</a> dice qué no se comprobó.</sub>
</p>

No es un render ni una app de realidad aumentada. La mancha de tu suelo es un polígono exacto y se puede comprobar con un trazador de rayos.

**[Abrir la demo en línea](https://arthur031221.github.io/Sunspill/)** y arrastra el reloj. Es gratis, no pide registro, no envía nada a ningún sitio y se abre sin conexión después de la primera visita.

<p align="center"><img src="assets/demo.gif" alt="La mancha de sol de una ventana al oeste cruzando el suelo del dormitorio al arrastrar el reloj, luego la ventana girada al este sin sol dentro y por último un mapa de horas de sol" width="760"></p>

## Antes y después

El mismo dormitorio en Taipéi a las 16:30 del 15 de julio. Girar la ventana del oeste al este cambia por completo la tarde.

| Ventana al oeste | Ventana al este |
| :---: | :---: |
| <img src="assets/before.png" alt="Ventana al oeste con la mancha de sol sobre el suelo y la cama" width="380"> | <img src="assets/after.png" alt="Ventana al este sin sol dentro" width="380"> |
| <b>4 h 28 min</b> de sol directo al día después de las 14:00 | <b>0 min</b> |

<sub>Media diaria de 40 días de muestra de junio a septiembre (un día de cada tres), cielo despejado y solo sol directo, según la comprobación del sol de la tarde en la pestaña Resultados. La regla se muestra en la app.</sub>

## Qué puedes hacer

- **Dibujar la habitación.** Tamaño, grosor de muro y hasta cuatro ventanas, cada una con un alero o balcón encima y un edificio al otro lado de la calle. Arrastra las ventanas por su muro y los muebles por el suelo.
- **Recorrer cualquier día.** Elige un lugar de la lista incluida, tu ubicación o una latitud y una longitud. El reloj, la trayectoria del sol y la mancha te siguen, con el horario de verano resuelto.
- **Ver horas, no suposiciones.** El mapa de horas de sol colorea el suelo, o una superficie a la altura que fijes, según las horas de sol directo al día de un día, un mes, un año o un rango de meses.
- **Comprobar la tarde.** Una regla impresa, no una nota: los minutos posteriores a la hora que elijas en que el sol directo llega al suelo o a un muro, promediados en los meses elegidos.
- **Buscar sitio para una planta.** Pleno sol, sol parcial o poca luz, para una base de 30 cm, con los mejores sitios primero y a 60 cm al menos entre sí.
- **Compartir.** Un enlace que guarda toda la habitación, una tarjeta PNG, un GIF o un archivo JSON. Un interruptor redondea el lugar a grados enteros y quita su nombre.
- **Usarlo en cualquier sitio.** Nueve idiomas, temas claro y oscuro, teclado y táctil, diseño para móvil, deshacer y rehacer, y uso sin conexión tras la primera visita.

Lo que no incluye: reflejos, luz difusa del cielo y sombras de los muebles. Cielo despejado y solo sol directo. El modelo todavía no se ha comparado con la foto de una habitación real. Si puedes hacer una, abre una incidencia.

## Instalación

Abre <https://arthur031221.github.io/Sunspill/> en el navegador y ya está, sin instalar nada. Para ejecutarlo tú mismo:

```sh
git clone https://github.com/Arthur031221/Sunspill.git
cd Sunspill
npm ci
npm run build
npx --yes serve dist
```

## Documentación

La documentación está en inglés. [Usage](docs/USAGE.md) | [Install](docs/INSTALL.md) | [Config and file format](docs/CONFIG.md) | [Library API](docs/API.md) | [Architecture](docs/ARCHITECTURE.md) | [Validation](docs/VALIDATION.md) | [Contributing](CONTRIBUTING.md)

## Licencia

MIT. La fuente Fraunces va incluida bajo la SIL Open Font License, véase [THIRD_PARTY.md](THIRD_PARTY.md).
