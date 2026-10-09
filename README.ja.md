<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg">
    <img src="assets/logo.svg" width="64" alt="">
  </picture><br>
  Sunspill
</h1>

<p align="center"><strong>自分の部屋を数分で設定して、時間と季節ごとに、日差しが床のどこに落ちるかを見られます。</strong></p>

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
        <img src="assets/hero-light.png" alt="西向きの寝室で、午後の日だまりが床とベッドに落ちている Sunspill の画面" width="560">
      </picture>
    </td>
    <td valign="middle"><img src="assets/setup.gif" alt="スマホでの操作：住所を検索し、部屋のタイプを選び、地図の建物の輪郭に合わせて部屋を回して道路側に向け、日だまりが床を横切る" width="220"></td>
  </tr>
</table>

<p align="center">
  太陽高度は NREL の基準値との差が <b>0.007 度</b>以内。建物、木、バルコニーが窓を日陰にする計算は、pvlib と shapely との比較で <b>54,000 の確認点すべてが一致</b>しました（うち 1,275 点は建物、木、バルコニーの手すりのせいで暗くなった点）。<br>
  <sub>幾何の各部分を独立した基準と比べています。太陽は pvlib（NREL SPA）、影は光線追跡と shapely、磁気偏角は pygeomag、地図上のずれは pyproj、写真の補正は OpenCV です。<code>node scripts/validate.mjs</code> で再現でき、確かめていない前提は <a href="docs/VALIDATION.md">docs/VALIDATION.md</a> にあります。実際に撮った部屋の写真との比較はまだないので、見た日差しとモデルを比べる確認モードがあります。入力が間違うと日だまりがどれだけずれるかは <a href="docs/ACCURACY.md">docs/ACCURACY.md</a> にあります。</sub>
</p>

レンダリングでも AR アプリでもありません。床の日だまりは正確な多角形で、光線追跡で確かめられます。

**[ライブデモを開く](https://arthur031221.github.io/Sunspill/)** 。無料でログイン不要、一度開けばオフラインでも動きます。部屋のデータはブラウザーの外に出ません。住所検索、地図、建物の輪郭は OpenStreetMap に問い合わせますが、それぞれ許可したときだけです。

## 自分の部屋を設定する

「自分の部屋を設定」を押します。スマホなら数分、7 つのステップで、それぞれ戻るボタンと次へボタンがあります。

1. **場所。** 住所を入力するか、OpenStreetMap の地図にピンを置きます。緯度、経度、タイムゾーンは自動で入ります。
2. **部屋。** 台湾でよくあるワンルーム、寝室、リビング、書斎から始めるか、間取り図や広告の写真を 2 点の縮尺でなぞります。階数も設定します。
3. **窓とドア。** 壁沿いに実寸を表示し、壁の端、中央、ほかの窓に吸着します。バルコニーと手すり、ひさし、ドアも置けます。
4. **向き。** 地図で部屋を自分の建物の輪郭に合わせて回すか、スマホを窓に当ててコンパスを読み取ります（磁気偏角を加えます）。北は常に見えています。
5. **周りの建物。** 近くの建物と高さを OpenStreetMap から読み込みます。推定の高さには印が付き、直せます。建物や木を自分で足すこともできます。地図の時計で太陽の位置を見られ、その時刻に窓を日陰にする建物が枠で示されます。
6. **家具。** ベッド、机、ソファ、棚、植物を置いて、動かして、回して、日差しが当たる様子を見ます。
7. **実際の日差しと照らし合わせる。** 日差しを見た時刻と、床のどこに当たっていたかをマークするか、床の写真を平面図の下に敷きます。モデルがどれだけずれているかを表示し、マークに合わせて向きと窓を調整できます。

## ビフォーアフター

台北の同じ寝室、7 月 15 日の 16:30。窓を西から東に向けると、午後の日差しはなくなります。

| 西向きの窓 | 東向きの窓 |
| :---: | :---: |
| <img src="assets/before.png" alt="西向きの窓。日だまりが床とベッドに落ちている" width="380"> | <img src="assets/after.png" alt="東向きの窓。室内に日差しがない" width="380"> |
| 14:00 以降の直射日光は 1 日あたり <b>4 時間 28 分</b> | <b>0 分</b> |

<sub>6 月から 9 月の 40 日（3 日おき）の 1 日あたり平均。快晴、直射日光のみ。結果タブの午後の日差しチェックによる値で、ルールはアプリにも表示されます。</sub>

## できること

- **部屋を描く。** サイズ、壁の厚さ、最大 4 つの窓（ひさし、バルコニー、手すり付き）、最大 3 つのドア、階数、回せる家具。
- **好きな日を見る。** 都市、住所、現在地、緯度経度から場所を選ぶと、時計、太陽の軌跡、日だまりが動きます。夏時間にも対応。
- **何が日差しをさえぎるか見る。** OpenStreetMap の建物と高さ、木、自分のバルコニーとひさし。ひとつずつ外すと、何時間の日差しを失うかがわかります。
- **推測でなく時間で見る。** 日照時間マップが、1 日の直射日光の時間で床（または指定した高さの面）を色分けします。
- **午後の日差しを確かめる。** 点数ではなく、表示されるルールです。指定した時刻以降に、直射日光が床や壁に届く分数。
- **植物の置き場所を探す。** 日なた、半日陰、日陰で、おすすめ順に表示します。
- **現実と比べる。** 見た日だまりをマークし、重なりとセンチ単位のずれを見て、向きを調整します。
- **共有する。** 部屋全体を含むリンク、PNG カード、GIF、JSON ファイル。スイッチひとつで場所を整数の度に丸めて名前を外します。
- **どこでも使う。** 9 言語、ライトとダークテーマ、キーボードとタッチ、元に戻す、一度開けばオフラインでも動作。

含まれないもの：反射、天空光、家具の影。快晴、直射日光のみです。建物は平らな屋根の柱、木は光を通さないものとして扱います。実際に撮った部屋の写真との比較はまだです。撮れる方は issue を開いてください。

## プライバシー

部屋、なぞった画像、付けたマークはブラウザーの外に出ません。アカウント、解析、クッキーはありません。3 つの任意サービスが OpenStreetMap のサーバーに問い合わせますが、どれも最初はオフで、許可したときだけ、何を送るかを先に表示します。

| サービス | 送る内容 |
| --- | --- |
| 住所検索（Nominatim） | 入力した文字 |
| 地図の画像（OpenStreetMap タイル） | 見ている部分の地図 |
| 建物の輪郭（Overpass） | 部屋の位置（約 1 m の精度） |

「オンラインサービス」からいつでもオフにできます。ページのコンテンツセキュリティポリシーにはこれらのホストだけが書かれていて、ブラウザーテストでも確かめています。詳しくは [docs/PRIVACY.md](docs/PRIVACY.md)。

## インストール

<https://arthur031221.github.io/Sunspill/> をブラウザーで開くだけで使えます。自分で動かすには：

```sh
git clone https://github.com/Arthur031221/Sunspill.git
cd Sunspill
npm ci
npm run build
npx --yes serve dist
```

## ドキュメント

ドキュメントは英語です。 [Usage](docs/USAGE.md) | [Privacy](docs/PRIVACY.md) | [Accuracy](docs/ACCURACY.md) | [Validation](docs/VALIDATION.md) | [Install](docs/INSTALL.md) | [Config and file format](docs/CONFIG.md) | [Library API](docs/API.md) | [Architecture](docs/ARCHITECTURE.md) | [Contributing](CONTRIBUTING.md) | [Changelog](CHANGELOG.md)

## ライセンスとデータ

MIT。埋め込みの Fraunces フォントは SIL Open Font License です。地図の画像、建物の輪郭、住所検索は OpenStreetMap の貢献者によるもので、Open Database License の下にあります。タイムゾーン表は `@photostructure/tz-lookup`（CC0）、地磁気モデルは World Magnetic Model 2025（パブリックドメイン）です。[THIRD_PARTY.md](THIRD_PARTY.md) を参照。
