<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg">
    <img src="assets/logo.svg" width="64" alt="">
  </picture><br>
  Sunspill
</h1>

<p align="center"><strong>Configura tu propia habitación en pocos minutos y mira dónde cae el sol en su suelo, por hora y por estación.</strong></p>

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
        <img src="assets/hero-light.png" alt="Sunspill con un dormitorio orientado al oeste y la mancha de sol de la tarde sobre el suelo y la cama" width="560">
      </picture>
    </td>
    <td valign="middle"><img src="assets/setup.gif" alt="En un móvil: se busca una dirección, se elige un tipo de habitación, se gira sobre los edificios del mapa hasta que mira a la calle, y la mancha de sol cruza el suelo" width="220"></td>
  </tr>
</table>

<p align="center">
  Elevación solar a menos de <b>0,007 grados</b> de la referencia NREL. <b>0 desacuerdos en 54.000 puntos de prueba</b> frente a pvlib y shapely (1.275 de ellos oscuros solo porque un edificio, un árbol o una barandilla de balcón da sombra a la ventana).<br>
  <sub>Cada pieza de geometría se compara con una referencia independiente: el sol (pvlib, NREL SPA), las sombras (un trazador de rayos y shapely), la declinación magnética (pygeomag), los desplazamientos del mapa (pyproj) y el aplanado de fotos (OpenCV). <code>node scripts/validate.mjs</code> lo reproduce y <a href="docs/VALIDATION.md">docs/VALIDATION.md</a> lista lo que no se comprueba. Aún no se ha comparado con la foto de una habitación real, así que hay un modo de comprobación que compara el modelo con lo que viste. <a href="docs/ACCURACY.md">docs/ACCURACY.md</a> dice cuánto mueve la mancha cada dato erróneo.</sub>
</p>

No es un render ni una app de realidad aumentada. La mancha de sol del suelo es un polígono exacto y puedes compararla con un trazador de rayos.

**[Abre la demo en vivo](https://arthur031221.github.io/Sunspill/)** . Es gratis, no pide registro y se abre sin conexión tras la primera visita. Tu habitación se queda en tu navegador. La búsqueda de direcciones, el mapa y los contornos de edificios consultan a OpenStreetMap, pero solo cuando dices que sí a cada uno.

## Configura tu propia habitación

Pulsa **Configurar mi habitación**. En un móvil lleva unos minutos, en siete pasos con botones Atrás y Siguiente.

1. **Dónde.** Escribe una dirección o pon una chincheta en el mapa de OpenStreetMap. La latitud, la longitud y la zona horaria se rellenan solas.
2. **La habitación.** Empieza por un estudio, dormitorio, salón o despacho típicos de Taiwán, o calca tu propio plano o la foto de un anuncio con una escala de dos puntos. Indica la planta.
3. **Ventanas y puertas.** Medidas reales a lo largo de los muros, con ajuste a los extremos, al centro y entre sí, balcones con barandilla, aleros y puertas.
4. **Hacia dónde mira.** Gira la habitación sobre el contorno de tu edificio en el mapa, o apoya el móvil en la ventana y lee su brújula con la declinación magnética sumada. El norte siempre está a la vista.
5. **Qué hay alrededor.** Los edificios vecinos y sus alturas se cargan de OpenStreetMap. Una altura supuesta queda marcada y se puede cambiar. Añade edificios y árboles a mano.
6. **Muebles.** Coloca, arrastra y gira camas, escritorios, sofás, estanterías y plantas, y mira cómo les da el sol.
7. **Comprobar con el sol real.** Marca dónde estuvo el sol en el suelo a una hora que viste, o coloca una foto del suelo bajo el plano. Sunspill muestra cuánto se aparta el modelo y ajusta la orientación y la ventana a tus marcas.

## Antes y después

El mismo dormitorio en Taipéi a las 16:30 del 15 de julio. Gira la ventana de oeste a este y el sol de la tarde desaparece.

| Ventana al oeste | Ventana al este |
| :---: | :---: |
| <img src="assets/before.png" alt="Ventana al oeste con la mancha de sol sobre el suelo y la cama" width="380"> | <img src="assets/after.png" alt="Ventana al este sin sol dentro" width="380"> |
| <b>4 h 28 min</b> de sol directo al día después de las 14:00 | <b>0 min</b> |

<sub>Media diaria en 40 días de muestra de junio a septiembre (uno de cada tres), cielo despejado, solo sol directo, con la comprobación del sol de la tarde de la pestaña Resultados. La regla está impresa en la app.</sub>

## Qué puedes hacer

- **Dibujar la habitación.** Tamaño, grosor de muros, hasta cuatro ventanas con alero, balcón y barandilla, hasta tres puertas, la planta y muebles que se pueden girar.
- **Recorrer cualquier día.** Elige una ciudad, una dirección, tu ubicación o una latitud y longitud. El reloj, la trayectoria del sol y la mancha te siguen, con el horario de verano resuelto.
- **Ver qué da sombra.** Edificios de OpenStreetMap con sus alturas, árboles, y tu propio balcón y alero. Apaga cada uno y ve cuántas horas de sol cuesta.
- **Ver horas, no suposiciones.** El mapa de horas de sol colorea el suelo, o una superficie a la altura que elijas, según las horas de sol directo al día.
- **Comprobar la tarde.** Una regla impresa, no una nota: los minutos después de una hora que eliges en los que el sol directo llega al suelo o a un muro.
- **Buscar sitio para una planta.** Sol pleno, sol parcial o poca luz, ordenados.
- **Comparar con la realidad.** Marca la mancha que viste, mira el solape y el desvío en centímetros y ajusta la orientación.
- **Compartir.** Un enlace con toda la habitación, una tarjeta PNG, un GIF o la habitación como archivo JSON. Un interruptor redondea el lugar a grados enteros y quita su nombre.
- **Usarlo donde sea.** Nueve idiomas, temas claro y oscuro, teclado y táctil, deshacer y rehacer, sin conexión tras la primera visita.

No incluye reflejos, luz del cielo ni sombras de muebles. Solo cielo despejado y sol directo. Los edificios son prismas de techo plano y los árboles dan sombra maciza. Aún no se ha comparado con la foto de una habitación real. Si puedes hacer una, abre un issue.

## Privacidad

Tu habitación, las imágenes que calcas y las marcas que haces no salen de tu navegador. No hay cuenta, ni analítica, ni cookies. Tres servicios opcionales hablan con servidores de OpenStreetMap, cada uno apagado hasta que lo permitas, y la página dice antes qué envía:

| Servicio | Qué envía |
| --- | --- |
| Búsqueda de direcciones (Nominatim) | el texto que escribes |
| Imágenes del mapa (teselas de OpenStreetMap) | la parte del mapa que miras |
| Contornos de edificios (Overpass) | la posición de la habitación, con un metro de precisión |

Puedes apagar cada uno en "Servicios en línea". La política de seguridad de contenido de la página nombra esos hosts y ningún otro, y las pruebas del navegador lo comprueban. Más en [docs/PRIVACY.md](docs/PRIVACY.md).

## Instalación

Abre <https://arthur031221.github.io/Sunspill/> en el navegador. No hay nada que instalar. Para ejecutarlo tú mismo:

```sh
git clone https://github.com/Arthur031221/Sunspill.git
cd Sunspill
npm ci
npm run build
npx --yes serve dist
```

## Documentación

La documentación está en inglés. [Usage](docs/USAGE.md) | [Privacy](docs/PRIVACY.md) | [Accuracy](docs/ACCURACY.md) | [Validation](docs/VALIDATION.md) | [Install](docs/INSTALL.md) | [Config and file format](docs/CONFIG.md) | [Library API](docs/API.md) | [Architecture](docs/ARCHITECTURE.md) | [Contributing](CONTRIBUTING.md) | [Changelog](CHANGELOG.md)

## Licencia y datos

MIT. La fuente Fraunces incrustada va con la licencia SIL Open Font License. Las imágenes del mapa, los contornos de edificios y la búsqueda de direcciones vienen de los colaboradores de OpenStreetMap y están bajo la Open Database License. La tabla de zonas horarias es `@photostructure/tz-lookup` (CC0) y el modelo del campo magnético es el World Magnetic Model 2025 (dominio público). Ver [THIRD_PARTY.md](THIRD_PARTY.md).
