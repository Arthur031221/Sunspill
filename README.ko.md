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
    <img src="assets/hero-light.png" alt="서향 침실에서 오후 햇빛이 바닥과 침대에 드는 모습을 보여 주는 Sunspill" width="100%">
  </picture>
</p>

<p align="center">
  태양 고도는 NREL 기준값과 <b>0.007도</b> 이내입니다. 창으로 드는 빛은 독립된 광선 추적 프로그램과 <b>377만</b>개 검증 지점에서 불일치가 <b>0</b>건입니다.<br>
  <sub>태양 위치: 15개 도시, 5일, 6개 시각, 총 403건을 pvlib 0.16.1을 통한 NREL 태양 위치 알고리즘과 비교했고 방위각은 0.06도 이내입니다. 빛: 창, 차양, 맞은편 건물, 벽 두께가 있는 무작위 방 3,767개, 시드 5개로, 코드를 공유하지 않는 광선 추적 프로그램과 비교했습니다. <code>node scripts/validate.mjs</code>로 재현할 수 있고, 검증하지 않은 부분은 <a href="docs/VALIDATION.md">docs/VALIDATION.md</a>에 있습니다.</sub>
</p>

렌더링도 AR 앱도 아닙니다. 바닥의 빛 얼룩은 정확한 다각형이고, 광선 추적 프로그램으로 확인할 수 있습니다.

**[라이브 데모 열기](https://arthur031221.github.io/Sunspill/)** 그리고 시계를 드래그해 보세요. 무료이고 로그인이 필요 없으며 아무것도 전송하지 않고, 한 번 열면 오프라인에서도 열립니다.

<p align="center"><img src="assets/demo.gif" alt="시계를 드래그하면 서향 창의 빛 얼룩이 침실 바닥을 가로지르고, 창을 동쪽으로 돌리면 햇빛이 들지 않으며, 마지막으로 일조 시간 지도를 보여 줍니다" width="760"></p>

## 전후 비교

타이베이의 같은 침실, 7월 15일 16:30. 창을 서쪽에서 동쪽으로 돌리면 오후가 완전히 달라집니다.

| 서향 창 | 동향 창 |
| :---: | :---: |
| <img src="assets/before.png" alt="서향 창, 빛 얼룩이 바닥과 침대에 닿음" width="380"> | <img src="assets/after.png" alt="동향 창, 실내에 햇빛 없음" width="380"> |
| 14:00 이후 하루 직사광선 <b>4시간 28분</b> | <b>0분</b> |

<sub>6월부터 9월까지 40개 표본 일자(사흘에 하루)의 하루 평균이며, 맑은 하늘에 직사광선만 반영합니다. 결과 탭의 오후 햇빛 점검 수치이고 규칙은 앱에도 표시됩니다.</sub>

## 할 수 있는 일

- **방을 그립니다.** 크기, 벽 두께, 최대 4개의 창. 창마다 위쪽 차양이나 발코니, 맞은편 건물을 설정할 수 있습니다. 창은 벽을 따라, 가구는 바닥 위에서 드래그합니다.
- **어느 날이든 움직입니다.** 내장된 도시 목록, 내 위치, 위도와 경도로 장소를 고르면 시계, 태양 경로, 빛 얼룩이 함께 움직입니다. 일광 절약 시간도 반영합니다.
- **짐작 대신 시간으로 봅니다.** 일조 시간 지도는 바닥(또는 높이를 정한 면)을 하루 직사광선 시간으로 칠합니다. 하루, 한 달, 1년, 고른 달 범위를 볼 수 있습니다.
- **오후 햇빛을 점검합니다.** 점수가 아니라 화면에 적힌 규칙입니다. 정한 시각 이후 직사광선이 바닥이나 벽에 닿는 시간(분)을 고른 달에 대해 평균합니다.
- **식물 자리를 찾습니다.** 양지, 반양지, 음지 중에서 고르면 30 cm 크기의 받침 기준으로 좋은 자리부터, 서로 60 cm 이상 떨어뜨려 보여 줍니다.
- **공유합니다.** 링크에 방 전체가 담겨 있습니다. PNG 카드, GIF, JSON 파일로도 저장할 수 있고, 스위치 하나로 위치를 정수 도 단위로 반올림하고 이름을 뺍니다.
- **어디서나 씁니다.** 9개 언어, 라이트와 다크 테마, 키보드와 터치, 휴대폰 레이아웃, 실행 취소와 다시 실행, 한 번 열면 오프라인 사용.

포함하지 않는 것: 반사, 하늘 산란광, 가구 그림자. 맑은 하늘에 직사광선만 반영합니다. 실제 방 사진과의 비교는 아직 하지 않았습니다. 사진을 찍을 수 있다면 이슈를 열어 주세요.

## 설치

브라우저에서 <https://arthur031221.github.io/Sunspill/>를 열면 바로 쓸 수 있습니다. 직접 실행하려면:

```sh
git clone https://github.com/Arthur031221/Sunspill.git
cd Sunspill
npm ci
npm run build
npx --yes serve dist
```

## 문서

문서는 영어입니다. [Usage](docs/USAGE.md) | [Install](docs/INSTALL.md) | [Config and file format](docs/CONFIG.md) | [Library API](docs/API.md) | [Architecture](docs/ARCHITECTURE.md) | [Validation](docs/VALIDATION.md) | [Contributing](CONTRIBUTING.md)

## 라이선스

MIT. 내장된 Fraunces 글꼴은 SIL Open Font License를 따릅니다. [THIRD_PARTY.md](THIRD_PARTY.md)를 참고하세요.
