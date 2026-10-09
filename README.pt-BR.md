<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg">
    <img src="assets/logo.svg" width="64" alt="">
  </picture><br>
  Sunspill
</h1>

<p align="center"><strong>Configure o seu próprio cômodo em poucos minutos e veja onde o sol cai no chão dele, por hora e por estação.</strong></p>

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
        <img src="assets/hero-light.png" alt="Sunspill mostrando um quarto voltado para o oeste com a mancha de sol da tarde no chão e na cama" width="560">
      </picture>
    </td>
    <td valign="middle"><img src="assets/setup.gif" alt="No celular: busca-se um endereço, escolhe-se um tipo de cômodo, gira-se sobre os prédios do mapa até ele ficar voltado para a rua, e a mancha de sol atravessa o chão" width="220"></td>
  </tr>
</table>

<p align="center">
  Elevação do sol a menos de <b>0,007 grau</b> da referência NREL. <b>0 divergências em 54.000 pontos de teste</b> contra pvlib e shapely (1.275 deles escuros só porque um prédio, uma árvore ou um guarda-corpo de varanda faz sombra na janela).<br>
  <sub>Cada peça de geometria é comparada com uma referência independente: o sol (pvlib, NREL SPA), as sombras (um traçador de raios e o shapely), a declinação magnética (pygeomag), os deslocamentos no mapa (pyproj) e a planificação de fotos (OpenCV). <code>node scripts/validate.mjs</code> reproduz isso e <a href="docs/VALIDATION.md">docs/VALIDATION.md</a> lista o que não é verificado. Ainda não foi comparado com a foto de um cômodo real, por isso há um modo de conferência que compara o modelo com o sol que você viu. <a href="docs/ACCURACY.md">docs/ACCURACY.md</a> diz quanto cada dado errado desloca a mancha.</sub>
</p>

Não é uma renderização nem um app de realidade aumentada. A mancha de sol no chão é um polígono exato, e você pode conferi-la com um traçador de raios.

**[Abrir a demonstração ao vivo](https://arthur031221.github.io/Sunspill/)** . É grátis, não pede login e abre offline depois da primeira visita. O seu cômodo fica no seu navegador. A busca de endereços, o mapa e os contornos de prédios consultam o OpenStreetMap, mas só depois que você diz sim a cada um.

## Configure o seu próprio cômodo

Toque em **Configurar meu cômodo**. No celular leva alguns minutos, em sete passos com botões Voltar e Próximo.

1. **Onde.** Digite um endereço ou coloque um alfinete no mapa do OpenStreetMap. Latitude, longitude e fuso horário são preenchidos sozinhos.
2. **O cômodo.** Comece por um studio, quarto, sala ou escritório típicos de Taiwan, ou trace a sua própria planta ou a foto de um anúncio com uma escala de dois pontos. Informe o andar.
3. **Janelas e portas.** Medidas reais ao longo das paredes, com encaixe nas pontas da parede, no meio e entre si, varandas com guarda-corpo, beirais e portas.
4. **Para onde aponta.** Gire o cômodo no mapa sobre o contorno do seu prédio, ou encoste o celular na janela e leia a bússola com a declinação magnética somada. O norte está sempre à vista.
5. **O que há ao redor.** Os prédios vizinhos e suas alturas vêm do OpenStreetMap. Uma altura estimada fica marcada e pode ser editada. Adicione prédios e árvores à mão. Um relógio no mapa mostra onde está o sol e contorna os prédios que fazem sombra numa janela nesse horário.
6. **Móveis.** Coloque, arraste e gire camas, escrivaninhas, sofás, estantes e plantas, e veja o sol cair sobre elas.
7. **Conferir com o sol de verdade.** Marque onde o sol estava no chão num horário que você viu, ou ponha uma foto do chão sob a planta. O Sunspill mostra quanto o modelo erra e ajusta a direção e a janela às suas marcas.

## Antes e depois

O mesmo quarto em Taipé às 16:30 de 15 de julho. Gire a janela de oeste para leste e o sol da tarde some.

| Janela a oeste | Janela a leste |
| :---: | :---: |
| <img src="assets/before.png" alt="Janela a oeste com a mancha de sol no chão e na cama" width="380"> | <img src="assets/after.png" alt="Janela a leste sem sol dentro" width="380"> |
| <b>4 h 28 min</b> de sol direto por dia depois das 14:00 | <b>0 min</b> |

<sub>Média diária em 40 dias de amostra de junho a setembro (um a cada três), céu limpo, só sol direto, com a conferência do sol da tarde da aba Resultados. A regra está impressa no app.</sub>

## O que você pode fazer

- **Desenhar o cômodo.** Tamanho, espessura das paredes, até quatro janelas com beiral, varanda e guarda-corpo, até três portas, o andar e móveis que podem ser girados.
- **Percorrer qualquer dia.** Escolha uma cidade, um endereço, a sua localização ou uma latitude e longitude. O relógio, a trajetória do sol e a mancha acompanham, com horário de verão tratado.
- **Ver o que faz sombra.** Prédios do OpenStreetMap com suas alturas, árvores, e a sua própria varanda e beiral. Desligue um a um e veja quantas horas de sol custam.
- **Ver horas, não palpites.** O mapa de horas de sol colore o chão, ou uma superfície na altura que você definir, pelas horas de sol direto por dia.
- **Conferir a tarde.** Uma regra impressa, não uma nota: os minutos depois de um horário escolhido em que o sol direto chega ao chão ou a uma parede.
- **Achar lugar para uma planta.** Sol pleno, sol parcial ou pouca luz, em ordem.
- **Comparar com a realidade.** Marque a mancha que você viu, veja a sobreposição e o desvio em centímetros e ajuste a direção.
- **Compartilhar.** Um link com o cômodo inteiro, um cartão PNG, um GIF ou o cômodo como arquivo JSON. Um botão arredonda o local para graus inteiros e tira o nome.
- **Usar em qualquer lugar.** Nove idiomas, temas claro e escuro, teclado e toque, desfazer e refazer, offline depois da primeira visita.

Fora do modelo: reflexos, luz do céu, sombras de móveis. Só céu limpo e sol direto. Os prédios são prismas de topo plano e as árvores dão sombra cheia. O modelo ainda não foi comparado com a foto de um cômodo real. Se você puder tirar uma, abra uma issue.

## Privacidade

O seu cômodo, as imagens que você traça e as marcas que faz não saem do navegador. Não há conta, análise nem cookie. Três serviços opcionais falam com servidores do OpenStreetMap, cada um desligado até você permitir, e a página diz antes o que ele envia:

| Serviço | O que envia |
| --- | --- |
| Busca de endereços (Nominatim) | o texto que você digita |
| Imagens do mapa (blocos do OpenStreetMap) | a parte do mapa que você olha |
| Contornos de prédios (Overpass) | a posição do cômodo, com cerca de um metro de precisão |

Você pode desligar cada um em "Serviços online". A política de segurança de conteúdo da página cita só esses hosts, e os testes do navegador conferem isso. Mais em [docs/PRIVACY.md](docs/PRIVACY.md).

## Instalação

Abra <https://arthur031221.github.io/Sunspill/> no navegador. Não há nada para instalar. Para rodar por conta própria:

```sh
git clone https://github.com/Arthur031221/Sunspill.git
cd Sunspill
npm ci
npm run build
npx --yes serve dist
```

## Documentação

A documentação está em inglês. [Usage](docs/USAGE.md) | [Privacy](docs/PRIVACY.md) | [Accuracy](docs/ACCURACY.md) | [Validation](docs/VALIDATION.md) | [Install](docs/INSTALL.md) | [Config and file format](docs/CONFIG.md) | [Library API](docs/API.md) | [Architecture](docs/ARCHITECTURE.md) | [Contributing](CONTRIBUTING.md) | [Changelog](CHANGELOG.md)

## Licença e dados

MIT. A fonte Fraunces embutida usa a SIL Open Font License. Imagens do mapa, contornos de prédios e busca de endereços vêm dos colaboradores do OpenStreetMap e estão sob a Open Database License. A tabela de fusos horários é `@photostructure/tz-lookup` (CC0) e o modelo do campo magnético é o World Magnetic Model 2025 (domínio público). Veja [THIRD_PARTY.md](THIRD_PARTY.md).
