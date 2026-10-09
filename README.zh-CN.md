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
    <img src="assets/hero-light.png" alt="Sunspill 显示朝西卧室，午后的阳光光斑落在地板和床上" width="100%">
  </picture>
</p>

<p align="center">
  太阳仰角与 NREL 参考值相差在 <b>0.007 度</b>内。窗光计算与独立的光线追踪程序在 <b>377 万</b>个探测点上有 <b>0</b> 处不一致。<br>
  <sub>太阳位置：15 个城市、5 个日期、6 个时刻共 403 个，对照 NREL 太阳位置算法（通过 pvlib 0.16.1），方位角误差在 0.06 度内。光照：3,767 个随机房间（含窗户、遮阳、对面建筑和墙厚），5 组随机种子，与不共用代码的光线追踪程序比对。用 <code>node scripts/validate.mjs</code> 可以重现，没有验证的部分写在 <a href="docs/VALIDATION.md">docs/VALIDATION.md</a>。</sub>
</p>

不是拟真渲染，也不是 AR 应用。地板上的光斑是精确的多边形，而且可以拿光线追踪程序来核对。

**[打开在线演示](https://arthur031221.github.io/Sunspill/)** 然后拖动时钟。免费、不用登录、不会发送任何数据，第一次打开之后也能离线使用。

<p align="center"><img src="assets/demo.gif" alt="拖动时钟时，西侧窗户的光斑扫过卧室地板，接着把窗户转向东侧就没有阳光照进来，最后是日照时数图" width="760"></p>

## 前后对照

同一间台北的卧室，7 月 15 日 16:30。把窗户从西边转到东边，整个下午就不一样了。

| 西侧窗户 | 东侧窗户 |
| :---: | :---: |
| <img src="assets/before.png" alt="西侧窗户，光斑落在地板和床上" width="380"> | <img src="assets/after.png" alt="东侧窗户，室内没有阳光" width="380"> |
| 14:00 之后每天直射阳光 <b>4 小时 28 分</b> | <b>0 分</b> |

<sub>6 月到 9 月共 40 个采样日（每三天一天）的每日平均，晴天、只算直射阳光，数字来自「结果」标签页的午后阳光检查，规则也印在应用程序里。</sub>

## 可以做什么

- **画出房间。** 尺寸、墙厚、最多四扇窗，每扇窗可设置上方的遮阳板或阳台，以及对面的建筑。窗户可沿墙拖动，家具可在地板上拖动。
- **拖动任何一天。** 从内置城市清单、你的位置或经纬度选地点，时钟、太阳轨迹和光斑会跟着动，夏令时间也处理好了。
- **看时数，不靠猜。** 日照时数图用每天直射阳光的时数替地板（或你指定高度的平面）上色，可看一天、一个月、一年或指定的月份。
- **检查午后阳光。** 不是分数，而是印出来的规则：你指定时间之后，直射阳光照到地板或墙面的分钟数，再依你选的月份取平均。
- **帮植物找位置。** 全日照、半日照或耐阴，以 30 厘米见方的底面计算，排出最佳位置，彼此至少相距 60 厘米。
- **分享。** 链接里就有整个房间，也能存成 PNG 图片卡、GIF 或 JSON 文件。一个开关可把地点四舍五入到整数度并去掉名称。
- **到处都能用。** 九种语言、浅色与深色主题、键盘与触摸、手机版面、撤销与重做，第一次打开之后可离线使用。

没有纳入：反射、天空散射光、家具影子。晴天、只算直射阳光。这个模型还没有和实拍的房间照片比对过，如果你能拍一张，欢迎开 issue。

## 安装

直接在浏览器打开 <https://arthur031221.github.io/Sunspill/> 就能用，不用安装。想自己跑：

```sh
git clone https://github.com/Arthur031221/Sunspill.git
cd Sunspill
npm ci
npm run build
npx --yes serve dist
```

## 文档

文档为英文。 [Usage](docs/USAGE.md) | [Install](docs/INSTALL.md) | [Config and file format](docs/CONFIG.md) | [Library API](docs/API.md) | [Architecture](docs/ARCHITECTURE.md) | [Validation](docs/VALIDATION.md) | [Contributing](CONTRIBUTING.md)

## 授权

MIT。内嵌的 Fraunces 字体采用 SIL Open Font License，见 [THIRD_PARTY.md](THIRD_PARTY.md)。
