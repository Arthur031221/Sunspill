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
    <img src="assets/hero-light.png" alt="Sunspill mostrando um quarto voltado para o oeste com a mancha de sol da tarde no chão e na cama" width="100%">
  </picture>
</p>

<p align="center">
  Altura do sol a menos de <b>0,007 grau</b> da referência do NREL. <b>0 de 3,77 milhões</b> de pontos de teste em que a luz da janela difere de um rastreador de raios independente.<br>
  <sub>Sol: 403 amostras em 15 cidades, 5 dias e 6 horários, comparadas com o algoritmo de posição solar do NREL via pvlib 0.16.1. O azimute fica a menos de 0,06 grau. Luz: 3.767 cômodos aleatórios com janelas, beirais, prédios em frente e espessura de parede, 5 sementes, comparados com um rastreador de raios que não compartilha código. <code>node scripts/validate.mjs</code> reproduz os dois, e <a href="docs/VALIDATION.md">docs/VALIDATION.md</a> diz o que não foi verificado.</sub>
</p>

Não é uma renderização nem um app de realidade aumentada. A mancha no seu chão é um polígono exato e dá para conferi-la com um rastreador de raios.

**[Abrir a demo online](https://arthur031221.github.io/Sunspill/)** e arraste o relógio. É grátis, sem cadastro, não envia nada a lugar nenhum e abre sem internet depois da primeira visita.

<p align="center"><img src="assets/demo.gif" alt="A mancha de sol de uma janela voltada para o oeste atravessando o chão do quarto ao arrastar o relógio, depois a janela virada para o leste sem sol dentro e por fim um mapa de horas de sol" width="760"></p>

## Antes e depois

O mesmo quarto em Taipé às 16:30 de 15 de julho. Virar a janela do oeste para o leste muda a tarde por completo.

| Janela para o oeste | Janela para o leste |
| :---: | :---: |
| <img src="assets/before.png" alt="Janela para o oeste com a mancha de sol no chão e na cama" width="380"> | <img src="assets/after.png" alt="Janela para o leste sem sol dentro" width="380"> |
| <b>4 h 28 min</b> de sol direto por dia depois das 14:00 | <b>0 min</b> |

<sub>Média por dia de 40 dias de amostra de junho a setembro (um dia a cada três), céu limpo e só sol direto, segundo a verificação do sol da tarde na aba Resultados. A regra aparece no app.</sub>

## O que você pode fazer

- **Desenhar o cômodo.** Tamanho, espessura da parede e até quatro janelas, cada uma com beiral ou varanda acima e um prédio do outro lado da rua. Arraste as janelas ao longo da parede e os móveis pelo chão.
- **Percorrer qualquer dia.** Escolha um lugar da lista embutida, sua localização ou uma latitude e uma longitude. O relógio, a trajetória do sol e a mancha acompanham, com horário de verão resolvido.
- **Ver horas, não palpites.** O mapa de horas de sol colore o chão, ou uma superfície na altura que você definir, pelas horas de sol direto por dia em um dia, um mês, um ano ou uma faixa de meses.
- **Conferir a tarde.** Uma regra impressa, não uma nota: os minutos depois do horário escolhido em que o sol direto alcança o chão ou uma parede, em média nos meses escolhidos.
- **Achar lugar para uma planta.** Sol pleno, sol parcial ou pouca luz, para uma base de 30 cm, com os melhores lugares primeiro e a pelo menos 60 cm um do outro.
- **Compartilhar.** Um link que guarda o cômodo inteiro, um cartão PNG, um GIF ou um arquivo JSON. Uma chave arredonda o local para graus inteiros e tira o nome.
- **Usar em qualquer lugar.** Nove idiomas, temas claro e escuro, teclado e toque, layout para celular, desfazer e refazer, e uso offline depois da primeira visita.

O que não está incluído: reflexos, luz difusa do céu e sombras de móveis. Céu limpo e só sol direto. O modelo ainda não foi comparado com a foto de um cômodo real. Se você puder tirar uma, abra uma issue.

## Instalação

Abra <https://arthur031221.github.io/Sunspill/> no navegador, sem instalar nada. Para rodar por conta própria:

```sh
git clone https://github.com/Arthur031221/Sunspill.git
cd Sunspill
npm ci
npm run build
npx --yes serve dist
```

## Documentação

A documentação está em inglês. [Usage](docs/USAGE.md) | [Install](docs/INSTALL.md) | [Config and file format](docs/CONFIG.md) | [Library API](docs/API.md) | [Architecture](docs/ARCHITECTURE.md) | [Validation](docs/VALIDATION.md) | [Contributing](CONTRIBUTING.md)

## Licença

MIT. A fonte Fraunces vai embutida sob a SIL Open Font License, veja [THIRD_PARTY.md](THIRD_PARTY.md).
