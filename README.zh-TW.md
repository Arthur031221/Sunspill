<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg">
    <img src="assets/logo.svg" width="64" alt="">
  </picture><br>
  Sunspill
</h1>

<p align="center"><strong>幾分鐘設定好你自己的房間，看陽光在每個時刻、每個季節落在地板的哪裡。</strong></p>

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
        <img src="assets/hero-light.png" alt="Sunspill 顯示朝西臥室，午後的陽光光斑落在地板和床上" width="560">
      </picture>
    </td>
    <td valign="middle"><img src="assets/setup.gif" alt="手機上的操作：搜尋地址、選房型、在地圖上對著建築輪廓轉動房間直到朝向街道，然後陽光光斑掃過地板" width="220"></td>
  </tr>
</table>

<p align="center">
  太陽仰角與 NREL 參考值相差在 <b>0.007 度</b>內。建築、樹木與陽台遮住窗戶的計算，與 pvlib 和 shapely 比對，<b>54,000 個探測點有 0 處不一致</b>（其中 1,275 點只因建築、樹木或陽台欄杆而變暗）。<br>
  <sub>每一個幾何環節都和獨立的參考值比對：太陽（pvlib、NREL SPA）、陰影（光線追蹤程式和 shapely）、磁偏角（pygeomag）、地圖位移（pyproj）、照片攤平（OpenCV）。用 <code>node scripts/validate.mjs</code> 可以重現，沒有驗證的選擇寫在 <a href="docs/VALIDATION.md">docs/VALIDATION.md</a>。它還沒有和實拍的房間照片比對過，所以有一個核對模式，讓你拿模型和親眼看到的陽光比。<a href="docs/ACCURACY.md">docs/ACCURACY.md</a> 說明每個輸入錯了會讓光斑偏多少。</sub>
</p>

不是擬真渲染，也不是 AR 應用。地板上的光斑是精確的多邊形，而且可以拿光線追蹤程式來核對。

**[開啟線上示範](https://arthur031221.github.io/Sunspill/)** 。免費、不用登入，第一次開啟之後也能離線使用。你的房間只留在瀏覽器裡。地址搜尋、地圖和建築輪廓會向 OpenStreetMap 請求資料，但每一項都要你同意才會進行。

## 設定你自己的房間

按下「設定我的房間」。在手機上只要幾分鐘，共七步，每步都有上一步與下一步。

1. **在哪裡。** 輸入地址，或在 OpenStreetMap 地圖上放一個圖釘。緯度、經度和時區會自動填入。
2. **房間。** 從台灣常見的套房、臥室、客廳或書房開始，或用兩點比例尺描繪你自己的平面圖或刊登照片。設定樓層。
3. **窗戶與門。** 沿牆顯示真實尺寸，會吸附到牆端、中間和彼此，還有陽台與欄杆、雨遮和門。
4. **朝哪個方向。** 在地圖上把房間對著你的建築輪廓轉動，或把手機貼在窗邊讀取羅盤（會加上磁偏角）。畫面上永遠看得到北。
5. **周圍有什麼。** 鄰近建築與高度從 OpenStreetMap 載入。推測的高度會標示，也能修改。也可以自己加建築和樹。
6. **家具。** 放置、拖動、旋轉床、書桌、沙發、書架和植物，看陽光落在上面。
7. **與真實陽光對照。** 標出你看到陽光的時間，陽光在地板上的位置，或把地板照片鋪在平面圖下。Sunspill 會顯示模型偏了多少，並依你的標記調整朝向和窗戶。

## 前後對照

同一間臺北的臥室，7 月 15 日 16:30。把窗戶從西邊轉到東邊，下午的陽光就沒了。

| 西側窗戶 | 東側窗戶 |
| :---: | :---: |
| <img src="assets/before.png" alt="西側窗戶，光斑落在地板和床上" width="380"> | <img src="assets/after.png" alt="東側窗戶，室內沒有陽光" width="380"> |
| 14:00 之後每天直射陽光 <b>4 小時 28 分</b> | <b>0 分</b> |

<sub>6 月到 9 月共 40 個取樣日（每三天一天）的每日平均，晴天、只算直射陽光，數字來自「結果」分頁的午後陽光檢查，規則也印在應用程式裡。</sub>

## 可以做什麼

- **畫出房間。** 尺寸、牆厚、最多四扇窗（可設遮陽、陽台和欄杆）、最多三扇門、樓層，以及可旋轉的家具。
- **拖動任何一天。** 從城市、地址、你的位置或經緯度選地點，時鐘、太陽軌跡和光斑跟著動，夏令時間也處理好了。
- **看是什麼擋住陽光。** OpenStreetMap 的建築與高度、樹木，還有你自己的陽台和雨遮。逐一關掉，就知道少了幾小時日照。
- **看時數，不靠猜。** 日照時數圖用每天直射陽光的時數替地板（或你指定高度的平面）上色。
- **檢查午後陽光。** 印出來的規則，不是分數：你指定時間之後，直射陽光照到地板或牆面的分鐘數。
- **幫植物找位置。** 全日照、半日照或耐陰，排出最佳位置。
- **和現實比對。** 標出你看到的光斑，看重疊程度和以公分計的偏差，並調整朝向。
- **分享。** 連結裡就有整個房間，也能存成 PNG 圖卡、GIF 或 JSON 檔。一個開關可把地點四捨五入到整數度並去掉名稱。
- **到處都能用。** 九種語言、淺色與深色主題、鍵盤與觸控、復原與重做，第一次開啟之後可離線使用。

沒有納入：反射、天空散射光、家具影子。晴天、只算直射陽光。建築視為平頂的柱體，樹視為不透光。這個模型還沒有和實拍的房間照片比對過，如果你能拍一張，歡迎開 issue。

## 隱私

你的房間、你描繪的圖片和你做的標記都不會離開瀏覽器。沒有帳號、沒有分析、沒有 cookie。有三項選用服務會向 OpenStreetMap 的伺服器請求資料，每一項都預設關閉，要你同意，而且頁面會先說明會送出什麼：

| 服務 | 送出的內容 |
| --- | --- |
| 地址搜尋（Nominatim） | 你輸入的文字 |
| 地圖圖片（OpenStreetMap 圖磚） | 你正在看的那一塊地圖 |
| 建築輪廓（Overpass） | 房間的位置，約精確到一公尺 |

隨時可以在「線上服務」關掉。頁面的內容安全政策只列出這幾個主機，瀏覽器測試也會檢查。詳見 [docs/PRIVACY.md](docs/PRIVACY.md)。

## 安裝

直接在瀏覽器開啟 <https://arthur031221.github.io/Sunspill/> 就能用，不用安裝。想自己跑：

```sh
git clone https://github.com/Arthur031221/Sunspill.git
cd Sunspill
npm ci
npm run build
npx --yes serve dist
```

## 文件

文件為英文。 [Usage](docs/USAGE.md) | [Privacy](docs/PRIVACY.md) | [Accuracy](docs/ACCURACY.md) | [Validation](docs/VALIDATION.md) | [Install](docs/INSTALL.md) | [Config and file format](docs/CONFIG.md) | [Library API](docs/API.md) | [Architecture](docs/ARCHITECTURE.md) | [Contributing](CONTRIBUTING.md) | [Changelog](CHANGELOG.md)

## 授權與資料

MIT。內嵌的 Fraunces 字型採用 SIL Open Font License。地圖圖片、建築輪廓和地址搜尋來自 OpenStreetMap 貢獻者，採用 Open Database License。時區表是 `@photostructure/tz-lookup`（CC0），磁場模型是 World Magnetic Model 2025（公有領域）。見 [THIRD_PARTY.md](THIRD_PARTY.md)。
