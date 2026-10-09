// A small offline list of cities, so choosing a place never sends anything
// anywhere. name|country|lat|lon|zone|alternative spellings.
const RAW = `
Taipei|TW|25.033|121.565|Asia/Taipei|台北 臺北 台北市 타이베이 台北
New Taipei|TW|25.012|121.465|Asia/Taipei|新北 新北市
Taoyuan|TW|24.994|121.301|Asia/Taipei|桃園 桃园
Taichung|TW|24.148|120.674|Asia/Taipei|台中 臺中 台中市
Tainan|TW|22.999|120.227|Asia/Taipei|台南 臺南 台南市
Kaohsiung|TW|22.627|120.301|Asia/Taipei|高雄 高雄市
Hsinchu|TW|24.804|120.971|Asia/Taipei|新竹
Keelung|TW|25.128|121.740|Asia/Taipei|基隆
Chiayi|TW|23.480|120.449|Asia/Taipei|嘉義 嘉义
Hualien|TW|23.977|121.607|Asia/Taipei|花蓮 花莲
Yilan|TW|24.702|121.738|Asia/Taipei|宜蘭 宜兰
Pingtung|TW|22.668|120.488|Asia/Taipei|屏東 屏东
Taitung|TW|22.756|121.144|Asia/Taipei|台東 臺東 台东
Miaoli|TW|24.560|120.821|Asia/Taipei|苗栗
Changhua|TW|24.075|120.542|Asia/Taipei|彰化
Magong|TW|23.571|119.566|Asia/Taipei|馬公 澎湖 Penghu
Hong Kong|HK|22.320|114.170|Asia/Hong_Kong|香港 ホンコン 홍콩
Macau|MO|22.199|113.544|Asia/Macau|澳門 澳门
Shanghai|CN|31.230|121.474|Asia/Shanghai|上海 上海 상하이
Beijing|CN|39.904|116.407|Asia/Shanghai|北京 北京 베이징
Shenzhen|CN|22.543|114.058|Asia/Shanghai|深圳 深セン 선전
Guangzhou|CN|23.129|113.264|Asia/Shanghai|廣州 广州 広州
Chengdu|CN|30.573|104.066|Asia/Shanghai|成都
Chongqing|CN|29.563|106.551|Asia/Shanghai|重慶 重庆
Wuhan|CN|30.593|114.305|Asia/Shanghai|武漢 武汉
Hangzhou|CN|30.274|120.155|Asia/Shanghai|杭州
Nanjing|CN|32.060|118.797|Asia/Shanghai|南京
Xi'an|CN|34.341|108.940|Asia/Shanghai|西安 Xian
Tianjin|CN|39.343|117.361|Asia/Shanghai|天津
Tokyo|JP|35.676|139.650|Asia/Tokyo|東京 东京 とうきょう 도쿄
Osaka|JP|34.694|135.502|Asia/Tokyo|大阪 오사카
Kyoto|JP|35.012|135.768|Asia/Tokyo|京都 교토
Nagoya|JP|35.181|136.906|Asia/Tokyo|名古屋
Sapporo|JP|43.062|141.354|Asia/Tokyo|札幌
Fukuoka|JP|33.590|130.402|Asia/Tokyo|福岡 福冈
Naha|JP|26.212|127.681|Asia/Tokyo|那覇 沖繩 冲绳 Okinawa
Seoul|KR|37.566|126.978|Asia/Seoul|首爾 首尔 ソウル 서울
Busan|KR|35.180|129.076|Asia/Seoul|釜山 부산
Incheon|KR|37.456|126.705|Asia/Seoul|仁川 인천
Singapore|SG|1.352|103.820|Asia/Singapore|新加坡 シンガポール 싱가포르
Kuala Lumpur|MY|3.139|101.687|Asia/Kuala_Lumpur|吉隆坡 クアラルンプール
Bangkok|TH|13.756|100.502|Asia/Bangkok|曼谷 バンコク 방콕
Hanoi|VN|21.028|105.854|Asia/Ho_Chi_Minh|河內 河内
Ho Chi Minh City|VN|10.823|106.630|Asia/Ho_Chi_Minh|胡志明 胡志明市 Saigon
Manila|PH|14.600|120.984|Asia/Manila|馬尼拉 马尼拉
Jakarta|ID|-6.209|106.846|Asia/Jakarta|雅加達 雅加达
Denpasar|ID|-8.670|115.213|Asia/Makassar|峇里島 巴厘岛 Bali
Phnom Penh|KH|11.562|104.916|Asia/Phnom_Penh|金邊 金边
Yangon|MM|16.841|96.173|Asia/Yangon|仰光
Delhi|IN|28.614|77.209|Asia/Kolkata|德里 New Delhi 델리
Mumbai|IN|19.076|72.878|Asia/Kolkata|孟買 孟买 Bombay
Bengaluru|IN|12.972|77.594|Asia/Kolkata|班加羅爾 Bangalore
Chennai|IN|13.083|80.271|Asia/Kolkata|清奈 Madras
Kolkata|IN|22.573|88.364|Asia/Kolkata|加爾各答 Calcutta
Dhaka|BD|23.810|90.412|Asia/Dhaka|達卡 达卡
Karachi|PK|24.861|67.010|Asia/Karachi|喀拉蚩 卡拉奇
Kathmandu|NP|27.717|85.324|Asia/Kathmandu|加德滿都 加德满都
Colombo|LK|6.927|79.861|Asia/Colombo|可倫坡 科伦坡
Dubai|AE|25.205|55.271|Asia/Dubai|杜拜 迪拜 ドバイ 두바이
Riyadh|SA|24.714|46.675|Asia/Riyadh|利雅德 利雅得
Tel Aviv|IL|32.085|34.782|Asia/Jerusalem|特拉維夫 特拉维夫
Istanbul|TR|41.008|28.978|Europe/Istanbul|伊斯坦堡 伊斯坦布尔 イスタンブール
Tehran|IR|35.689|51.389|Asia/Tehran|德黑蘭 德黑兰
Doha|QA|25.286|51.531|Asia/Qatar|多哈
London|GB|51.507|-0.128|Europe/London|倫敦 伦敦 ロンドン 런던
Paris|FR|48.857|2.352|Europe/Paris|巴黎 パリ 파리
Berlin|DE|52.520|13.405|Europe/Berlin|柏林 ベルリン 베를린
Madrid|ES|40.417|-3.704|Europe/Madrid|馬德里 马德里
Barcelona|ES|41.385|2.173|Europe/Madrid|巴塞隆納 巴塞罗那
Rome|IT|41.903|12.496|Europe/Rome|羅馬 罗马 Roma ローマ
Milan|IT|45.464|9.190|Europe/Rome|米蘭 米兰 Milano
Amsterdam|NL|52.368|4.904|Europe/Amsterdam|阿姆斯特丹
Brussels|BE|50.850|4.352|Europe/Brussels|布魯塞爾 布鲁塞尔 Bruxelles
Vienna|AT|48.208|16.374|Europe/Vienna|維也納 维也纳 Wien
Zurich|CH|47.377|8.541|Europe/Zurich|蘇黎世 苏黎世 Zürich
Prague|CZ|50.076|14.438|Europe/Prague|布拉格 Praha
Warsaw|PL|52.230|21.012|Europe/Warsaw|華沙 华沙 Warszawa
Stockholm|SE|59.329|18.069|Europe/Stockholm|斯德哥爾摩 斯德哥尔摩
Oslo|NO|59.914|10.752|Europe/Oslo|奧斯陸 奥斯陆
Copenhagen|DK|55.676|12.568|Europe/Copenhagen|哥本哈根 København
Helsinki|FI|60.170|24.938|Europe/Helsinki|赫爾辛基 赫尔辛基
Reykjavik|IS|64.147|-21.943|Atlantic/Reykjavik|雷克雅維克 雷克雅未克
Tromso|NO|69.649|18.955|Europe/Oslo|特羅姆瑟 Tromsø
Dublin|IE|53.350|-6.260|Europe/Dublin|都柏林
Lisbon|PT|38.722|-9.139|Europe/Lisbon|里斯本 Lisboa
Athens|GR|37.984|23.728|Europe/Athens|雅典 Athína
Budapest|HU|47.498|19.040|Europe/Budapest|布達佩斯 布达佩斯
Moscow|RU|55.756|37.617|Europe/Moscow|莫斯科 Москва
Kyiv|UA|50.450|30.523|Europe/Kyiv|基輔 基辅 Kiev
Cairo|EG|30.044|31.236|Africa/Cairo|開羅 开罗
Lagos|NG|6.524|3.379|Africa/Lagos|拉哥斯 拉各斯
Nairobi|KE|-1.286|36.818|Africa/Nairobi|奈洛比 内罗毕
Johannesburg|ZA|-26.204|28.047|Africa/Johannesburg|約翰尼斯堡 约翰内斯堡
Cape Town|ZA|-33.925|18.424|Africa/Johannesburg|開普敦 开普敦 Kapstadt
Casablanca|MA|33.573|-7.590|Africa/Casablanca|卡薩布蘭加 卡萨布兰卡
Addis Ababa|ET|9.030|38.740|Africa/Addis_Ababa|阿迪斯阿貝巴
Accra|GH|5.604|-0.187|Africa/Accra|阿克拉
New York|US|40.713|-74.006|America/New_York|紐約 纽约 NYC ニューヨーク 뉴욕
Los Angeles|US|34.052|-118.244|America/Los_Angeles|洛杉磯 洛杉矶 LA
Chicago|US|41.878|-87.630|America/Chicago|芝加哥
San Francisco|US|37.775|-122.419|America/Los_Angeles|舊金山 旧金山 SF
Seattle|US|47.606|-122.332|America/Los_Angeles|西雅圖 西雅图
Houston|US|29.760|-95.370|America/Chicago|休士頓 休斯敦
Miami|US|25.762|-80.192|America/New_York|邁阿密 迈阿密
Denver|US|39.739|-104.990|America/Denver|丹佛
Boston|US|42.360|-71.059|America/New_York|波士頓 波士顿
Washington|US|38.907|-77.037|America/New_York|華盛頓 华盛顿 Washington DC
Toronto|CA|43.653|-79.383|America/Toronto|多倫多 多伦多
Vancouver|CA|49.283|-123.121|America/Vancouver|溫哥華 温哥华
Montreal|CA|45.502|-73.567|America/Toronto|蒙特婁 蒙特利尔 Montréal
Mexico City|MX|19.433|-99.133|America/Mexico_City|墨西哥城 Ciudad de México
Bogota|CO|4.711|-74.072|America/Bogota|波哥大 Bogotá
Lima|PE|-12.046|-77.043|America/Lima|利馬 利马
Quito|EC|-0.181|-78.468|America/Guayaquil|基多
Santiago|CL|-33.449|-70.669|America/Santiago|聖地牙哥 圣地亚哥
Buenos Aires|AR|-34.604|-58.382|America/Argentina/Buenos_Aires|布宜諾斯艾利斯 布宜诺斯艾利斯
Sao Paulo|BR|-23.551|-46.633|America/Sao_Paulo|聖保羅 圣保罗 São Paulo
Rio de Janeiro|BR|-22.907|-43.173|America/Sao_Paulo|里約熱內盧 里约热内卢 Rio
Honolulu|US|21.307|-157.858|Pacific/Honolulu|檀香山 夏威夷 Hawaii
Anchorage|US|61.218|-149.900|America/Anchorage|安克拉治
Sydney|AU|-33.869|151.209|Australia/Sydney|雪梨 悉尼 シドニー 시드니
Melbourne|AU|-37.814|144.963|Australia/Melbourne|墨爾本 墨尔本
Brisbane|AU|-27.470|153.026|Australia/Brisbane|布里斯本
Perth|AU|-31.951|115.861|Australia/Perth|伯斯 珀斯
Auckland|NZ|-36.851|174.764|Pacific/Auckland|奧克蘭 奥克兰
Wellington|NZ|-41.287|174.776|Pacific/Auckland|威靈頓 惠灵顿
`

export const CITIES = RAW.trim().split('\n').map((line) => {
  const [name, country, lat, lon, zone, rest = ''] = line.split('|')
  return { name, country, lat: Number(lat), lon: Number(lon), zone, aliases: rest.split(' ').filter(Boolean) }
})

const fold = (text) => text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()

const index = CITIES.map((city) => ({ city, keys: [city.name, ...city.aliases, city.name.split(' ').join('')].map(fold) }))

/** Cities whose name or alternative spelling starts with, or contains, the query. Best matches first. */
export function searchCities(query, limit = 8) {
  const q = fold(query.trim())
  if (!q) return []
  const scored = []
  for (const { city, keys } of index) {
    let best = Infinity
    for (const key of keys) {
      const at = key.indexOf(q)
      if (at === -1) continue
      best = Math.min(best, at === 0 ? (key === q ? 0 : 1) : 2)
    }
    if (best < Infinity) scored.push([best, city])
  }
  scored.sort((a, b) => a[0] - b[0])
  return scored.slice(0, limit).map(([, city]) => city)
}

export const cityPlace = (city) => ({ name: city.name, lat: city.lat, lon: city.lon, zone: city.zone })
