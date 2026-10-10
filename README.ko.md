<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg">
    <img src="assets/logo.svg" width="64" alt="">
  </picture><br>
  Sunspill
</h1>

<p align="center"><strong>내 방을 몇 분 만에 설정하고, 시간과 계절에 따라 햇빛이 바닥 어디에 떨어지는지 확인하세요.</strong></p>

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
        <img src="assets/hero-light.png" alt="서향 침실에서 오후의 햇빛 조각이 바닥과 침대에 떨어지는 Sunspill 화면" width="560">
      </picture>
    </td>
    <td valign="middle"><img src="assets/setup.gif" alt="휴대폰에서: 주소를 검색하고, 방 유형을 고르고, 지도의 건물 윤곽에 맞춰 방을 돌려 길 쪽으로 향하게 하면 햇빛 조각이 바닥을 가로지릅니다" width="220"></td>
  </tr>
</table>

**[라이브 데모 열기](https://arthur031221.github.io/Sunspill/)** . 무료이고 로그인이 필요 없으며, 한 번 열면 오프라인에서도 열립니다. 휴대폰에 맞춰 만들었고, 주소에서 내 방까지 일곱 단계, 몇 분이면 됩니다. 방 데이터는 브라우저 밖으로 나가지 않습니다. 주소 검색, 지도, 건물 윤곽은 OpenStreetMap에 요청하지만, 각각 허용한 뒤에만 합니다.

렌더링도 AR 앱도 아닙니다. 바닥의 햇빛 조각은 정확한 다각형이고, 광선 추적기로 확인할 수 있습니다.

## 내 방 설정하기

"내 방 설정하기"를 누르세요. 휴대폰에서 몇 분이면 되고, 7단계에 각각 이전과 다음 버튼이 있습니다.

1. **위치.** 주소를 입력하거나 OpenStreetMap 지도에 핀을 놓습니다. 위도, 경도, 시간대는 자동으로 채워집니다.번지와 층이 들어간 주소도 검색됩니다. 예: 台北市信義區市府路45號7樓. OpenStreetMap에 그 번지가 없으면 같은 길을 보여 주고 건물에 핀을 놓으라고 안내합니다.
2. **방.** 원룸, 침실, 거실, 서재로 시작하거나(크기는 대만의 흔한 구조를 따랐으니 내 방에 맞게 고치세요), 평면도나 매물 사진을 두 점 축척으로 따라 그립니다. 층도 설정합니다.
3. **창문과 문.** 벽을 따라 실제 치수가 표시되고, 벽 끝, 가운데, 다른 창문에 달라붙습니다. 발코니와 난간, 차양, 문도 있습니다.
4. **방향.** 지도에서 방을 내 건물의 윤곽에 맞게 돌리거나, 휴대폰을 창문에 대고 나침반을 읽습니다(자기편각을 더합니다). 북쪽은 항상 화면에 보입니다.
5. **주변.** 가까운 건물과 높이를 OpenStreetMap에서 불러옵니다. 추정한 높이는 표시되고 고칠 수 있습니다.높이가 없는 건물은 가장 가까운 높이 있는 건물들로 추정합니다. 건물과 나무를 직접 추가할 수도 있습니다. 지도의 시계로 태양의 위치를 보고, 그 시각에 창문에 그림자를 드리우는 건물이 테두리로 표시됩니다.
6. **가구.** 침대, 책상, 소파, 선반, 식물을 놓고, 옮기고, 돌려 보며 햇빛이 닿는 모습을 봅니다.
7. **실제 햇빛과 대조.** 햇빛을 본 시각과 바닥에서 햇빛이 있던 자리를 표시하거나, 바닥 사진을 평면도 밑에 깝니다. 모델이 얼마나 어긋났는지 보여 주고, 표시에 맞춰 방향과 창문을 맞춥니다.

## 전후 비교

타이베이의 같은 침실, 7월 15일 16:30. 창문을 서쪽에서 동쪽으로 돌리면 오후 햇빛이 사라집니다.

| 서쪽 창문 | 동쪽 창문 |
| :---: | :---: |
| <img src="assets/before.png" alt="서쪽 창문, 햇빛 조각이 바닥과 침대에 떨어짐" width="380"> | <img src="assets/after.png" alt="동쪽 창문, 실내에 햇빛 없음" width="380"> |
| 14:00 이후 하루 직사광선 <b>4시간 28분</b> | <b>0분</b> |

<sub>6월부터 9월까지 40일(사흘마다)의 하루 평균. 맑은 하늘, 직사광선만 계산합니다. 결과 탭의 오후 햇빛 확인에서 나온 값이며, 규칙은 앱에도 표시됩니다.</sub>

## 할 수 있는 것

- **방 그리기.** 크기, 벽 두께, 창문 최대 4개(차양, 발코니, 난간 포함), 문 최대 3개, 층, 돌릴 수 있는 가구.
- **아무 날이나 보기.** 도시, 주소, 내 위치, 위도와 경도로 장소를 고르면 시계, 태양 궤적, 햇빛 조각이 따라 움직입니다. 서머타임도 처리합니다.
- **무엇이 햇빛을 가리는지 보기.** OpenStreetMap의 건물과 높이, 나무, 내 발코니와 차양. 하나씩 꺼 보면 일조 시간이 얼마나 줄어드는지 알 수 있습니다.
- **짐작 말고 시간으로 보기.** 일조 시간 지도가 하루 직사광선 시간으로 바닥(또는 정한 높이의 면)을 색칠합니다.
- **오후 햇빛 확인.** 점수가 아니라 표시된 규칙입니다. 정한 시각 이후 직사광선이 바닥이나 벽에 닿는 분 수.
- **식물 자리 찾기.** 양지, 반양지, 음지 순으로 추천 위치를 보여 줍니다.
- **현실과 비교.** 본 햇빛 조각을 표시하고, 겹침과 센티미터 단위의 어긋남을 보고, 방향을 맞춥니다.
- **여러 방 저장.** 방에 이름을 붙여 이 브라우저에 최대 열두 개까지 저장해서, 집을 오가며 비교할 수 있습니다.
- **공유.** 방 전체가 담긴 링크, PNG 카드, GIF, JSON 파일. 스위치 하나로 위치를 정수 도로 반올림하고 이름을 뺍니다.
- **어디서나.** 9개 언어, 밝은 테마와 어두운 테마, 키보드와 터치, 실행 취소, 한 번 열면 오프라인에서도 동작.

포함하지 않는 것: 반사, 하늘빛, 가구 그림자. 맑은 하늘과 직사광선만 다룹니다. 건물은 평평한 지붕의 기둥으로, 나무는 빛을 막는 것으로 취급합니다. 실제로 찍은 방 사진과 비교한 적은 아직 없으니, 찍을 수 있다면 issue를 열어 주세요.

## 얼마나 정확한가

태양 고도는 NREL 기준값과 <b>0.007도</b> 이내로 일치합니다. 건물, 나무, 발코니가 창문에 그늘을 드리우는 계산은 pvlib, shapely와 비교해 <b>54,000개 검사 지점에서 불일치 0건</b>입니다(그중 1,275개는 건물, 나무, 발코니 난간 때문에만 어두워진 지점).

기하의 모든 부분을 독립된 기준과 비교했습니다. 태양은 pvlib(NREL SPA), 그림자는 광선 추적기와 shapely, 자기편각은 pygeomag, 지도 위 변위는 pyproj, 사진 펴기는 OpenCV입니다. <code>node scripts/validate.mjs</code>로 재현할 수 있고, 확인하지 않은 가정은 <a href="docs/VALIDATION.md">docs/VALIDATION.md</a>에 있습니다. 실제로 찍은 방 사진과 비교한 적은 아직 없어서, 본 햇빛과 모델을 견주는 확인 모드를 넣었습니다. 입력이 틀리면 햇빛 조각이 얼마나 밀리는지는 <a href="docs/ACCURACY.md">docs/ACCURACY.md</a>에 있습니다.

OpenStreetMap에 없는 건물 높이는 가장 가까운 높이 있는 건물들로 추정합니다. 타이베이 다섯 곳에서 건물을 하나씩 빼고 추정해 보니 오차의 중앙값이 1.2에서 1.3배였고, 고정값 9m는 1.7에서 5.7배였습니다.

## 개인정보

방, 따라 그린 그림, 남긴 표시는 브라우저 밖으로 나가지 않습니다. 이름을 붙여 저장한 방도 이 브라우저 안에만 있습니다. 계정도 분석도 쿠키도 없습니다. 선택 서비스 세 가지가 OpenStreetMap 서버에 요청하며, 모두 처음에는 꺼져 있고 허용한 뒤에만 쓰이며, 무엇을 보내는지 먼저 알려 줍니다.

| 서비스 | 보내는 내용 |
| --- | --- |
| 주소 검색(Nominatim) | 입력한 글자 |
| 지도 이미지(OpenStreetMap 타일) | 보고 있는 부분의 지도 |
| 건물 윤곽(Overpass) | 방의 위치(약 1m 정밀도) |

"온라인 서비스"에서 언제든 다시 끌 수 있습니다. 페이지의 콘텐츠 보안 정책에는 이 호스트들만 적혀 있고, 브라우저 테스트가 이를 확인합니다. 자세한 내용은 [docs/PRIVACY.md](docs/PRIVACY.md).

## 설치

브라우저에서 <https://arthur031221.github.io/Sunspill/> 를 열면 바로 쓸 수 있습니다. 직접 실행하려면:

```sh
git clone https://github.com/Arthur031221/Sunspill.git
cd Sunspill
npm ci
npm run build
npx --yes serve dist
```

## 문서

문서는 영어입니다. [Usage](docs/USAGE.md) | [Privacy](docs/PRIVACY.md) | [Accuracy](docs/ACCURACY.md) | [Validation](docs/VALIDATION.md) | [Install](docs/INSTALL.md) | [Config and file format](docs/CONFIG.md) | [Library API](docs/API.md) | [Architecture](docs/ARCHITECTURE.md) | [Contributing](CONTRIBUTING.md) | [Changelog](CHANGELOG.md)

## 라이선스와 데이터

MIT. 내장된 Fraunces 글꼴은 SIL Open Font License를 따릅니다. 지도 이미지, 건물 윤곽, 주소 검색은 OpenStreetMap 기여자의 것이며 Open Database License를 따릅니다. 시간대 표는 `@photostructure/tz-lookup`(CC0), 지자기 모델은 World Magnetic Model 2025(퍼블릭 도메인)입니다. [THIRD_PARTY.md](THIRD_PARTY.md) 참조.

Assisted by Claude/Codex.
