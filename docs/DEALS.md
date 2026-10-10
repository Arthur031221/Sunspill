# Past deals data

The quick check can say what sold and what let near a building. The numbers come from 實價登錄, the Ministry of the Interior's register of real prices, and they are past deals. They are not listings and they are not an appraisal. This page says where the data comes from, what is kept, how a deal finds its place, what the files look like and how to build them again.

## Where it comes from

Only government open data, under the Open Government Data License, version 1 (政府資料開放授權條款第1版), which asks for the source to be named. The quick check names it next to the numbers.

| Data | From | Used for |
| --- | --- | --- |
| Sales (`*_lvr_land_a.csv`) and rentals (`*_lvr_land_c.csv`) of Taipei (`a`), New Taipei (`f`), Taichung (`b`) and Taoyuan (`h`) | 內政部不動產交易實價查詢服務網, https://plvr.land.moi.gov.tw/DownloadOpenData, the seasons by `DownloadSeason?season=115S3&type=zip&fileName=lvr_landcsv.zip` | the deals |
| House number points of Taipei | data.gov.tw 155472, 臺北市門牌位置數值資料 | the place of a deal |
| House number points of New Taipei | data.gov.tw 168887, 新北市門牌位置數值資料 | the same |
| House number points of Taichung | data.gov.tw 169806, 臺中市空間資訊建物及門牌號碼位置 (a list of files, and the newest is a Google Drive link that the city gives) | the same |
| House number points of Taoyuan | data.gov.tw 157689, 桃園市門牌位置坐標資料 (a file for each month, the newest is read) | the same |

The presale files (`_b`) are not used. No listing site (591, 信義房屋, 永慶, 好房網, 樂屋網 or any other) is read, copied or proxied. Their terms forbid it, and the register has what is needed.

## What is kept

A season file has every registered transaction, land and car parks included. `scripts/lib/lvr.mjs` keeps a row when it is:

- a building or a flat (the target names 建物 or 房), of the kind 公寓, 華廈, 住宅大樓, 透天厝 or 套房, for living in (the main use is 住, 集合住宅, or not given). Land, parking, shops, offices, factories and farm houses are left out.
- not a deal that says nothing of the market: between relatives, staff or co-owners, between those who owe each other, forced sales and auctions, government purchases, presales, a land and a building registered apart, a car park alone, a land alone, a building with no title, a right of superficies. A rent of part of a flat, and of a room in a shared flat (分租雅房, 分層出租), is left out too.
- priced and sized sensibly: 3 to 400 ping, a sale of 500,000 NTD or more and 20,000 to 8,000,000 NTD a ping, a rent of 1,000 to 3,000,000 NTD a month and 50 to 20,000 NTD a ping a month.
- made in the 13 months before the end of the data. The register publishes a season only when it is closed, and the data runs to the end of the newest closed season (`asof` in the index, 2026-09 for the first build). A deal is dated by the day it was made (sales) or the contract (rentals), not by the day it was registered, so a deal can be some months older than the season it is in.

The area is the one the unit price was worked out on: the register's unit price leaves a car park that is priced on its own out, and so does the area given here. A sale's price is the total of the register, car park included.

## How a deal gets a place

The register has the full address and no coordinates. Each city publishes the point of every house number. `core/addresskey.js` turns both into the same key, the road with its section, lane and alley and the house number, in plain digits, with no city, district or floor:

- 臺 and 台, 号 and 號, full width digits, spaces, 之 and a hyphen (`221－4號`), a section as `1段`, `一段` or `貳段` and a house number in Chinese (`七號`) are one thing each. The city and the district come off with `extractAddress` of `twaddress.js`, and the rest is read in `addresskey.js`, which also reads a lane with a name (`正隆巷`), the third level of Taoyuan (`17衖9號`) and a list of houses (`419、421號`, which is put between the two when they are near each other).
- A key that two districts share (中山路1號 is in several) is told apart by the district written in the deal. The district codes of the point files carry no names, so the name of each is learned from the keys that only one district has, and only when at least three of them agree for at least 80 percent.
- A deal whose key has no point (a building newer than the file, a typing mistake, a character the register lost), whose only point is in another district, or whose key is at two places in its district or spread over more than 150 metres, is left out. They are counted.
- The points of New Taipei, Taipei and Taoyuan are on the TWD97 TM2 grid (EPSG:3826) and are converted by `scripts/lib/twd97.mjs`, which agrees with pyproj to 0.6 millimetres (`test/twd97.test.js`, with `scripts/make-twd97-reference.py`). Taichung gives longitude and latitude as well.

The first build, on 2026-10-10 with data to 2026-09:

| City | Homes on the market | Found a place | Not found: no point, other district, ambiguous |
| --- | --- | --- | --- |
| Taipei 臺北市 | 23,385 | 23,180 (99.1 percent) | 204, 1, 0 |
| New Taipei 新北市 | 52,415 | 51,841 (98.9 percent) | 444, 25, 105 |
| Taichung 臺中市 | 35,677 | 34,653 (97.1 percent) | 936, 27, 61 |
| Taoyuan 桃園市 | 50,442 | 49,863 (98.9 percent) | 541, 20, 18 |
| All | 161,919 | 159,537 (98.5 percent) | 2,382 |

That is 51,391 sales and 108,146 rentals. The points are marked by hand by the household registration offices, and the city of Taoyuan says that they may be some metres off or now and then wrong. A check of six deals against OpenStreetMap by reverse search found the same road and house number at five of them and the next house at the sixth.

## The files

`data/deals/index.json` says what is there:

```json
{ "v": 1, "zoom": 15, "maxZoom": 17, "asof": "2026-09", "built": "2026-10-10",
  "cols": ["lat", "lon", "kind", "date", "floor", "floors", "type", "built", "ping", "price", "unit", "lift", "addr"],
  "kinds": ["sale", "rent"], "types": ["walkup", "mid", "high", "house", "studio"],
  "counts": { "sale": 51391, "rent": 108146 }, "sources": ["..."],
  "tiles": { "15": ["27351-14112", "..."] } }
```

`tiles` lists the files that exist at each map tile level. A tile at level 15 (about 1.1 kilometres across) has `15-<x>-<y>.json`. One that would be over 190 KB is cut into its four tiles of the next level (`16-<x>-<y>.json`, and 17 at most), and has no file of its own. A tile file is one row to a line:

```json
{"v":1,"z":15,"x":27449,"y":14029,"cols":[...],"addrs":["復興南路二段151巷5號","..."],"rows":[
[25.02847,121.54394,0,"2026-08",6,8,1,1998,31.5,2560,81.3,1,0],
...
]}
```

| Column | Meaning |
| --- | --- |
| `lat`, `lon` | the house number point, rounded to five decimals (about a metre) |
| `kind` | 0 a sale, 1 a rental |
| `date` | `yyyy-mm`, when the deal was made |
| `floor`, `floors` | the lowest floor of the deal (negative below ground, `null` for a whole house), and the floors of the building |
| `type` | 0 公寓 (walk up), 1 華廈 (mid rise with a lift), 2 住宅大樓 (high rise), 3 透天厝 (house), 4 套房 (studio) |
| `built` | the year it was finished, or `null` |
| `ping` | the area in ping (坪, 3.305785 square metres) to a tenth |
| `price` | a sale: the total in 10,000 NTD. A rental: the rent in NTD a month |
| `unit` | a sale: 10,000 NTD a ping. A rental: NTD a ping a month |
| `lift` | 1 a lift, 0 none, `null` not given |
| `addr` | the number of the address key in `addrs`, which the page uses to find the deals of the house that was typed |

The files hold the 159,537 deals in 1,440 files, none over 98,074 bytes (the limit is 200,000) and 12.8 MB in all (the limit is 60 MB). `test/deals-data.test.js` checks the limits, that each row can be read and that each place is in its tile.

## What the page does with them

For the selected building the page reads the index and the files of the tiles that a 450 metre circle touches, and `summarise` in `core/deals.js` gives:

- sales within 300 metres in the last 12 calendar months: how many, the middle of the unit prices (萬 a ping), the lowest and the highest floor, the middle age of the buildings when the deals were made.
- rentals within 300 metres in the same time: how many, the middle rent and the middle rent a ping.
- the deals of the same building, newest first, whatever their age in the data: the ones whose point is on its outline (6 metres of room for the point), and the ones that carry the address that was typed and are within 40 metres of it.
- the five nearest of the others within 450 metres, sales and rentals together.

The middle of an even number of values is the mean of the two in the middle.

## Limits

- **Freshness.** The data runs to the end of the newest closed season, which is up to three months behind. The section says to which month.
- **Registration.** A deal is in the register once it is registered, which can be some weeks after it was made. The newest weeks are always thin.
- **The prices are what was written down.** The register is declared by the parties, with the checks of the Ministry. Prices with fittings, furniture, a car park or a rooftop addition are not told apart, and the unit price counts the whole area including the shared parts of a building.
- **A deal is not a flat.** The unit price of a deal says what that flat made, and the middle of a few says little about yours. Three sales are not a market.
- **Places.** A point is a house number, not a flat. A building with many numbers is many points, and a house number on a lane can be on a lane of another building with the same road name when the city file lists it so.
- **Only four cities.** Everywhere else the section says there is no data.

## Building the files

```sh
node scripts/make-deals.mjs                 # data/deals from the last four seasons, downloads kept in .tmp/deals-cache
node scripts/make-deals.mjs --strict        # stop without writing if any dataset failed (the monthly workflow does this)
node scripts/make-deals.mjs --dry           # the report only
node scripts/make-deals.mjs --offline       # from the cache only
```

Node 20 or newer, no packages. The options are `--out`, `--cache`, `--seasons`, `--cities a,f,b,h`, `--now yyyy-mm-dd` and `--max-bytes`. It downloads about 600 MB (the city files are big), takes a few minutes, and prints what it left out and for what reason, the match rate for each city, and the size of the files.

`.github/workflows/deals.yml` runs it on the 12th of each month and on request, with `--strict`, checks the files with `test/deals-data.test.js`, commits `data/deals` and asks `pages.yml` to publish, since a commit made with the workflow's own token does not start other workflows. `pages.yml` copies `data/deals` into the site.

If a dataset cannot be fetched, the script says which one (a season, or the address points of a city with the data.gov.tw number) and `--strict` writes nothing, so the last good data stays. The link of the Taichung file is a Google Drive link that the city changes with its files. The script reads the newest from the city's own list, and the address points of the other cities fall back to the links that worked on 2026-10-10 when data.gov.tw does not answer.
