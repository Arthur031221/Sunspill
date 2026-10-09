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
    <img src="assets/hero-light.png" alt="西向きの寝室で、午後の日差しが床とベッドに落ちるようすを表示した Sunspill" width="100%">
  </picture>
</p>

<p align="center">
  太陽高度は NREL の基準値から <b>0.007 度</b>以内。窓から入る光は、独立した光線追跡プログラムと <b>377 万</b>点の検証点で <b>0</b> 件の不一致。<br>
  <sub>太陽位置：15 都市、5 日、6 時刻の計 403 件を、pvlib 0.16.1 経由の NREL 太陽位置アルゴリズムと比較。方位角は 0.06 度以内。光：窓、ひさし、向かいの建物、壁の厚さを持つランダムな部屋 3,767 件、5 つのシードで、コードを共有しない光線追跡プログラムと比較。<code>node scripts/validate.mjs</code> で再現でき、未検証の部分は <a href="docs/VALIDATION.md">docs/VALIDATION.md</a> にあります。</sub>
</p>

レンダリングでも AR アプリでもありません。床の光は正確な多角形で、光線追跡と照らし合わせて確かめられます。

**[ライブデモを開く](https://arthur031221.github.io/Sunspill/)** そして時計をドラッグしてください。無料でログイン不要、何も送信せず、一度開けばオフラインでも動きます。

<p align="center"><img src="assets/demo.gif" alt="時計をドラッグすると西向きの窓の日差しが寝室の床を横切り、窓を東向きにすると日が入らなくなり、最後に日照時間マップを表示" width="760"></p>

## ビフォーとアフター

台北の同じ寝室、7 月 15 日 16:30。窓を西向きから東向きに変えると、午後がまったく変わります。

| 西向きの窓 | 東向きの窓 |
| :---: | :---: |
| <img src="assets/before.png" alt="西向きの窓。日差しが床とベッドに当たる" width="380"> | <img src="assets/after.png" alt="東向きの窓。室内に日が入らない" width="380"> |
| 14:00 以降の直射日光は一日 <b>4 時間 28 分</b> | <b>0 分</b> |

<sub>6 月から 9 月の 40 日（3 日おき）の一日あたりの平均。快晴、直射日光のみ。結果タブの午後の日差しチェックの数値で、ルールはアプリ内にも表示されます。</sub>

## できること

- **部屋を描く。** 大きさ、壁の厚さ、最大 4 つの窓。窓ごとに上のひさしやバルコニー、向かいの建物を設定できます。窓は壁に沿って、家具は床の上でドラッグできます。
- **好きな日を動かす。** 内蔵の都市リスト、現在地、緯度経度から場所を選ぶと、時計、太陽の軌道、光が連動します。夏時間にも対応。
- **推測ではなく時間で見る。** 日照時間マップは、床（または指定した高さの面）を一日あたりの直射日光の時間で色分けします。一日、一か月、一年、指定した月の範囲で見られます。
- **午後の日差しをチェック。** 点数ではなく、表示されたルールで判定します。指定した時刻以降に直射日光が床か壁に届く分数を、選んだ月で平均します。
- **植物の置き場所を探す。** 日なた、半日陰、日陰のどれかを選ぶと、30 cm 四方の足元で判定し、良い順に、60 cm 以上離して並べます。
- **共有する。** リンクに部屋ぜんぶが入っています。PNG カード、GIF、JSON ファイルにもできます。スイッチ一つで場所を整数の度に丸め、名前を外せます。
- **どこでも使える。** 9 言語、ライトとダークのテーマ、キーボードとタッチ、スマホ向けレイアウト、元に戻す、やり直す。一度開けばオフラインでも使えます。

含まないもの：反射、空からの散乱光、家具の影。快晴で直射日光のみです。実際の部屋の写真との比較はまだしていません。写真を撮れる方は、issue をお寄せください。

## インストール

ブラウザで <https://arthur031221.github.io/Sunspill/> を開くだけで使えます。自分で動かすには：

```sh
git clone https://github.com/Arthur031221/Sunspill.git
cd Sunspill
npm ci
npm run build
npx --yes serve dist
```

## ドキュメント

ドキュメントは英語です。 [Usage](docs/USAGE.md) | [Install](docs/INSTALL.md) | [Config and file format](docs/CONFIG.md) | [Library API](docs/API.md) | [Architecture](docs/ARCHITECTURE.md) | [Validation](docs/VALIDATION.md) | [Contributing](CONTRIBUTING.md)

## ライセンス

MIT。埋め込みの Fraunces フォントは SIL Open Font License です。[THIRD_PARTY.md](THIRD_PARTY.md) を参照してください。
