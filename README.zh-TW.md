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
    <img src="assets/hero-light.png" alt="Sunspill 顯示朝西臥室，午後的陽光光斑落在地板和床上" width="100%">
  </picture>
</p>

<p align="center">
  太陽仰角與 NREL 參考值相差在 <b>0.007 度</b>內。窗光計算與獨立的光線追蹤程式在 <b>377 萬</b>個探測點上有 <b>0</b> 處不一致。<br>
  <sub>太陽位置：15 個城市、5 個日期、6 個時刻共 403 筆，對照 NREL 太陽位置演算法（透過 pvlib 0.16.1），方位角誤差在 0.06 度內。光照：3,767 個隨機房間（含窗戶、遮陽、對面建築和牆厚），5 組隨機種子，與不共用程式碼的光線追蹤程式比對。用 <code>node scripts/validate.mjs</code> 可以重現，沒有驗證的部分寫在 <a href="docs/VALIDATION.md">docs/VALIDATION.md</a>。</sub>
</p>

不是擬真渲染，也不是 AR 應用。地板上的光斑是精確的多邊形，而且可以拿光線追蹤程式來核對。

**[開啟線上示範](https://arthur031221.github.io/Sunspill/)** 然後拖動時鐘。免費、不用登入、不會傳送任何資料，第一次開啟之後也能離線使用。

<p align="center"><img src="assets/demo.gif" alt="拖動時鐘時，西側窗戶的光斑掃過臥室地板，接著把窗戶轉向東側就沒有陽光照進來，最後是日照時數圖" width="760"></p>

## 前後對照

同一間臺北的臥室，7 月 15 日 16:30。把窗戶從西邊轉到東邊，整個下午就不一樣了。

| 西側窗戶 | 東側窗戶 |
| :---: | :---: |
| <img src="assets/before.png" alt="西側窗戶，光斑落在地板和床上" width="380"> | <img src="assets/after.png" alt="東側窗戶，室內沒有陽光" width="380"> |
| 14:00 之後每天直射陽光 <b>4 小時 28 分</b> | <b>0 分</b> |

<sub>6 月到 9 月共 40 個取樣日（每三天一天）的每日平均，晴天、只算直射陽光，數字來自「結果」分頁的午後陽光檢查，規則也印在應用程式裡。</sub>

## 可以做什麼

- **畫出房間。** 尺寸、牆厚、最多四扇窗，每扇窗可設定上方的遮陽板或陽台，以及對面的建築。窗戶可沿牆拖動，家具可在地板上拖動。
- **拖動任何一天。** 從內建城市清單、你的位置或經緯度選地點，時鐘、太陽軌跡和光斑會跟著動，夏令時間也處理好了。
- **看時數，不靠猜。** 日照時數圖用每天直射陽光的時數替地板（或你指定高度的平面）上色，可看一天、一個月、一年或指定的月份。
- **檢查午後陽光。** 不是分數，而是印出來的規則：你指定時間之後，直射陽光照到地板或牆面的分鐘數，再依你選的月份取平均。
- **幫植物找位置。** 全日照、半日照或耐陰，以 30 公分見方的底面計算，排出最佳位置，彼此至少相距 60 公分。
- **分享。** 連結裡就有整個房間，也能存成 PNG 圖卡、GIF 或 JSON 檔。一個開關可把地點四捨五入到整數度並去掉名稱。
- **到處都能用。** 九種語言、淺色與深色主題、鍵盤與觸控、手機版面、復原與重做，第一次開啟之後可離線使用。

沒有納入：反射、天空散射光、家具影子。晴天、只算直射陽光。這個模型還沒有和實拍的房間照片比對過，如果你能拍一張，歡迎開 issue。

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

文件為英文。 [Usage](docs/USAGE.md) | [Install](docs/INSTALL.md) | [Config and file format](docs/CONFIG.md) | [Library API](docs/API.md) | [Architecture](docs/ARCHITECTURE.md) | [Validation](docs/VALIDATION.md) | [Contributing](CONTRIBUTING.md)

## 授權

MIT。內嵌的 Fraunces 字型採用 SIL Open Font License，見 [THIRD_PARTY.md](THIRD_PARTY.md)。
