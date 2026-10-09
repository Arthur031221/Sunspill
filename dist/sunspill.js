// Sunspill: sun position, window light and sun hours for a room. MIT license.
// See docs/API.md.

// src/core/solar.js
var RAD = Math.PI / 180;
var DEG = 180 / Math.PI;
var mod = (a, n) => (a % n + n) % n;
function refraction(elevation) {
  if (elevation > 85) return 0;
  const t = Math.tan(elevation * RAD);
  let seconds;
  if (elevation > 5) seconds = 58.1 / t - 0.07 / t ** 3 + 86e-6 / t ** 5;
  else if (elevation > -0.575) seconds = 1735 + elevation * (-518.2 + elevation * (103.4 + elevation * (-12.79 + elevation * 0.711)));
  else seconds = -20.772 / t;
  return seconds / 3600;
}
function solarPosition(when, lat, lon) {
  const ms = typeof when === "number" ? when : when.getTime();
  const jd = ms / 864e5 + 24405875e-1;
  const T = (jd - 2451545) / 36525;
  const L0 = mod(280.46646 + T * (36000.76983 + T * 3032e-7), 360);
  const M = 357.52911 + T * (35999.05029 - 1537e-7 * T);
  const e = 0.016708634 - T * (42037e-9 + 1267e-10 * T);
  const Mr = M * RAD;
  const C = Math.sin(Mr) * (1.914602 - T * (4817e-6 + 14e-6 * T)) + Math.sin(2 * Mr) * (0.019993 - 101e-6 * T) + Math.sin(3 * Mr) * 289e-6;
  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * T;
  const lambda = trueLong - 569e-5 - 478e-5 * Math.sin(omega * RAD);
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (59e-5 - T * 1813e-6))) / 60) / 60;
  const eps = eps0 + 256e-5 * Math.cos(omega * RAD);
  const decl = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD));
  const y = Math.tan(eps * RAD / 2) ** 2;
  const L0r = L0 * RAD;
  const eot = 4 * DEG * (y * Math.sin(2 * L0r) - 2 * e * Math.sin(Mr) + 4 * e * y * Math.sin(Mr) * Math.cos(2 * L0r) - 0.5 * y * y * Math.sin(4 * L0r) - 1.25 * e * e * Math.sin(2 * Mr));
  const utcMinutes = mod(ms / 6e4, 1440);
  const solarTime = mod(utcMinutes + eot + 4 * lon, 1440);
  const H = (solarTime / 4 - 180) * RAD;
  const phi = lat * RAD;
  const sinEl = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(H);
  const elevation = Math.asin(Math.max(-1, Math.min(1, sinEl))) * DEG;
  const azimuth = mod(Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi)) * DEG + 180, 360);
  return { azimuth, elevation, apparent: elevation + refraction(elevation), declination: decl * DEG, equationOfTime: eot };
}
function sunVector(azimuth, elevation) {
  const a = azimuth * RAD;
  const h = elevation * RAD;
  return [Math.cos(h) * Math.sin(a), Math.cos(h) * Math.cos(a), Math.sin(h)];
}
var formatters = /* @__PURE__ */ new Map();
function zoneFormat(zone) {
  let f = formatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" });
    formatters.set(zone, f);
  }
  return f;
}
var FIXED = /^UTC([+-])(\d{1,2})(?::?([0-5]\d))?$/;
function fixedOffset(zone) {
  const m = FIXED.exec(zone);
  if (!m || Number(m[2]) > 14) return null;
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0));
}
function isZone(zone) {
  if (typeof zone !== "string") return false;
  if (fixedOffset(zone) !== null) return true;
  if (FIXED.test(zone)) return false;
  try {
    zoneFormat(zone);
    return true;
  } catch {
    return false;
  }
}
function lookupOffset(zone, ms) {
  const p = {};
  for (const part of zoneFormat(zone).formatToParts(ms)) p[part.type] = Number(part.value);
  return (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1e3) * 1e3) / 6e4;
}
var offsetCache = /* @__PURE__ */ new Map();
var QUARTER = 15 * 6e4;
function zoneOffset(zone, ms) {
  const fixed = fixedOffset(zone);
  if (fixed !== null) return fixed;
  const bucket = Math.floor(ms / QUARTER);
  const key = `${zone}|${bucket}`;
  let hit = offsetCache.get(key);
  if (hit === void 0) {
    const start = lookupOffset(zone, bucket * QUARTER);
    if (start !== lookupOffset(zone, (bucket + 1) * QUARTER - 1e3)) return lookupOffset(zone, ms);
    if (offsetCache.size > 2e4) offsetCache.clear();
    offsetCache.set(key, start);
    hit = start;
  }
  return hit;
}
function localToUtc(year, month, day, minutes, zone) {
  const naive = Date.UTC(year, month - 1, day, 0, 0) + minutes * 6e4;
  const first = zoneOffset(zone, naive);
  const guess = naive - first * 6e4;
  const second = zoneOffset(zone, guess);
  return second === first ? guess : naive - second * 6e4;
}
function utcToLocal(ms, zone) {
  const offset = zoneOffset(zone, ms);
  const d = new Date(ms + offset * 6e4);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60 };
}
function daylightIntervals(year, month, day, lat, lon, zone) {
  const el = (m) => solarPosition(localToUtc(year, month, day, m, zone), lat, lon).apparent;
  const out = [];
  let prev = el(0);
  let start = prev > 0 ? 0 : null;
  for (let m = 1; m <= 1440; m++) {
    const cur = el(m);
    if (prev <= 0 && cur > 0) start = m - 1 + -prev / (cur - prev);
    if (prev > 0 && cur <= 0 && start !== null) {
      out.push([start, m - 1 + prev / (prev - cur)]);
      start = null;
    }
    prev = cur;
  }
  if (start !== null) out.push([start, 1440]);
  return out;
}
function sunTimes(year, month, day, lat, lon, zone) {
  const intervals = daylightIntervals(year, month, day, lat, lon, zone);
  if (!intervals.length) return { sunrise: null, sunset: null, polarDay: false, polarNight: true, intervals };
  const first = intervals[0];
  const last = intervals[intervals.length - 1];
  return {
    sunrise: first[0] === 0 ? null : first[0],
    sunset: last[1] === 1440 ? null : last[1],
    polarDay: first[0] === 0 && last[1] === 1440 && intervals.length === 1,
    polarNight: false,
    intervals
  };
}
function dayTrack(year, month, day, lat, lon, zone, stepMinutes = 5) {
  const { sunrise, sunset, polarDay, polarNight, intervals } = sunTimes(year, month, day, lat, lon, zone);
  const samples = [];
  for (const [from, to] of intervals) {
    for (let m = Math.ceil(from / stepMinutes) * stepMinutes; m <= to; m += stepMinutes) {
      const p = solarPosition(localToUtc(year, month, day, m, zone), lat, lon);
      if (p.apparent > 0) samples.push({ minutes: m, ...p });
    }
  }
  return { sunrise, sunset, polarDay, polarNight, samples };
}

// src/core/room.js
var WALLS = ["top", "right", "bottom", "left"];
var ITEM_KINDS = ["bed", "desk", "sofa", "table", "plant", "box", "shelf"];
var OBSTACLE_TYPES = ["building", "tree"];
var MAX_WINDOWS = 4;
var MAX_DOORS = 3;
var MAX_ITEMS = 16;
var MAX_OBSTACLES = 80;
var MAX_RING = 40;
var MAX_CHECKS = 6;
var YEAR = 2026;
var LIMITS = {
  room: { w: [1.5, 20], d: [1.5, 20], h: [2, 6], wall: [0, 0.6] },
  window: { w: [0.3, 12], h: [0.3, 4], sill: [0, 4] },
  eave: { depth: [0, 4], gap: [0, 1.5], ext: [0, 3] },
  across: { height: [0, 400], distance: [2, 300] },
  balcony: { depth: [0.3, 4], rail: [0, 2], ext: [0, 3] },
  floor: { n: [1, 99], storey: [2.4, 6] },
  door: { w: [0.5, 3] },
  building: { h: [1, 600], base: [0, 599], coord: [-1500, 1500] },
  tree: { r: [0.4, 15], h: [1, 45], base: [0, 44] }
};
var ITEM_SIZES = {
  bed: { w: 1.5, d: 2, h: 0.5 },
  desk: { w: 1.2, d: 0.6, h: 0.75 },
  sofa: { w: 2, d: 0.9, h: 0.8 },
  table: { w: 1.2, d: 0.8, h: 0.75 },
  plant: { w: 0.3, d: 0.3, h: 0.8 },
  box: { w: 0.6, d: 0.6, h: 0.6 },
  shelf: { w: 0.8, d: 0.3, h: 1.8 }
};
var DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
var daysInMonth = (month) => DAYS_IN_MONTH[month - 1];
var num = (v, [lo, hi], fallback) => Math.min(hi, Math.max(lo, typeof v === "number" && Number.isFinite(v) ? v : fallback));
var round = (v, places = 3) => Math.round(v * 10 ** places) / 10 ** places;
function wallLength(room, wall) {
  return wall === "top" || wall === "bottom" ? room.w : room.d;
}
function wallFrame(room, wall) {
  const { w, d } = room;
  switch (wall) {
    case "top":
      return { o: [0, d], t: [1, 0], n: [0, 1], length: w };
    case "right":
      return { o: [w, d], t: [0, -1], n: [1, 0], length: d };
    case "bottom":
      return { o: [w, 0], t: [-1, 0], n: [0, -1], length: w };
    default:
      return { o: [0, 0], t: [0, 1], n: [-1, 0], length: d };
  }
}
function wallBearing(scene, wall) {
  return ((scene.facing + WALLS.indexOf(wall) * 90) % 360 + 360) % 360;
}
function sunInRoom(scene, azimuth, elevation) {
  const a = azimuth * Math.PI / 180;
  const e = elevation * Math.PI / 180;
  const east = Math.cos(e) * Math.sin(a);
  const north = Math.cos(e) * Math.cos(a);
  const f = scene.facing * Math.PI / 180;
  return [east * Math.cos(f) - north * Math.sin(f), east * Math.sin(f) + north * Math.cos(f), Math.sin(e)];
}
function defaultScene() {
  return {
    v: 2,
    room: { w: 3.6, d: 4.4, h: 2.6, wall: 0.15 },
    facing: 270,
    floor: { n: 1, storey: 3 },
    windows: [{ wall: "top", pos: 0.9, w: 1.8, h: 1.4, sill: 0.9, eave: { depth: 0, gap: 0.15, ext: 0.3 }, across: null, balcony: null }],
    doors: [],
    place: { name: "Taipei", lat: 25.033, lon: 121.565, zone: "Asia/Taipei" },
    obstacles: [],
    date: { month: 7, day: 15 },
    minutes: 990,
    items: [
      { kind: "bed", x: 0.25, y: 1.5, w: 1.5, d: 2, h: 0.5, rot: 0 },
      { kind: "desk", x: 2.2, y: 3.5, w: 1.2, d: 0.6, h: 0.75, rot: 0 }
    ],
    checks: []
  };
}
function localToRoom(scene, east, north) {
  const f = scene.facing * Math.PI / 180;
  return [east * Math.cos(f) - north * Math.sin(f) + scene.room.w / 2, east * Math.sin(f) + north * Math.cos(f) + scene.room.d / 2];
}
var floorLift = (scene) => (scene.floor.n - 1) * scene.floor.storey;
function normalizeWindow(raw, room) {
  const win2 = raw && typeof raw === "object" ? raw : {};
  const wall = WALLS.includes(win2.wall) ? win2.wall : "top";
  const length = wallLength(room, wall);
  const w = num(win2.w, [LIMITS.window.w[0], Math.min(LIMITS.window.w[1], length)], Math.min(1.5, length));
  const h = num(win2.h, [LIMITS.window.h[0], Math.min(LIMITS.window.h[1], room.h)], Math.min(1.4, room.h));
  const sill = num(win2.sill, [0, Math.max(0, room.h - h)], Math.min(0.9, Math.max(0, room.h - h)));
  const pos = num(win2.pos, [0, Math.max(0, length - w)], Math.max(0, (length - w) / 2));
  const e = win2.eave && typeof win2.eave === "object" ? win2.eave : {};
  const across = win2.across && typeof win2.across === "object" ? { height: num(win2.across.height, LIMITS.across.height, 30), distance: num(win2.across.distance, LIMITS.across.distance, 15) } : null;
  const b = win2.balcony && typeof win2.balcony === "object" ? win2.balcony : null;
  return {
    wall,
    pos: round(pos),
    w: round(w),
    h: round(h),
    sill: round(sill),
    eave: {
      depth: round(num(e.depth, LIMITS.eave.depth, 0)),
      gap: round(num(e.gap, LIMITS.eave.gap, 0.15)),
      ext: round(num(e.ext, LIMITS.eave.ext, 0.3))
    },
    across: across && { height: round(across.height, 1), distance: round(across.distance, 1) },
    balcony: b && {
      depth: round(num(b.depth, LIMITS.balcony.depth, 1.2)),
      rail: round(num(b.rail, LIMITS.balcony.rail, 1)),
      ext: round(num(b.ext, LIMITS.balcony.ext, 0.3))
    }
  };
}
function normalizeDoor(raw, room) {
  const door = raw && typeof raw === "object" ? raw : {};
  const wall = WALLS.includes(door.wall) ? door.wall : "bottom";
  const length = wallLength(room, wall);
  const w = num(door.w, [LIMITS.door.w[0], Math.min(LIMITS.door.w[1], length)], Math.min(0.9, length));
  return { wall, pos: round(num(door.pos, [0, Math.max(0, length - w)], 0.2)), w: round(w) };
}
function turnedExtent(w, d, rot) {
  const r = rot * Math.PI / 180;
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  return [(c * w + s * d) / 2, (s * w + c * d) / 2];
}
function normalizeItem(raw, room) {
  if (!raw || typeof raw !== "object" || !ITEM_KINDS.includes(raw.kind)) return null;
  const base = ITEM_SIZES[raw.kind];
  const w = num(raw.w, [0.1, Math.min(4, room.w)], base.w);
  const d = num(raw.d, [0.1, Math.min(4, room.d)], base.d);
  const h = num(raw.h, [0.05, room.h], base.h);
  const rot = round((num(raw.rot, [-1e6, 1e6], 0) % 360 + 360) % 360, 1);
  const [ex, ey] = turnedExtent(w, d, rot);
  const cx = room.w >= 2 * ex ? Math.min(room.w - ex, Math.max(ex, num(raw.x, [-1e6, 1e6], 0) + w / 2)) : room.w / 2;
  const cy = room.d >= 2 * ey ? Math.min(room.d - ey, Math.max(ey, num(raw.y, [-1e6, 1e6], 0) + d / 2)) : room.d / 2;
  return { kind: raw.kind, x: round(cx - w / 2), y: round(cy - d / 2), w: round(w), d: round(d), h: round(h), rot };
}
var coord = (v) => round(num(v, LIMITS.building.coord, 0), 2);
function normalizeObstacle(raw) {
  if (!raw || typeof raw !== "object" || !OBSTACLE_TYPES.includes(raw.type)) return null;
  const common = {
    on: raw.on !== false,
    est: raw.est === true,
    src: raw.src === "osm" ? "osm" : "manual",
    own: raw.own === true,
    name: typeof raw.name === "string" ? raw.name.slice(0, 40) : ""
  };
  if (raw.type === "tree") {
    const h2 = num(raw.h, LIMITS.tree.h, 8);
    return {
      type: "tree",
      ...common,
      x: coord(raw.x),
      y: coord(raw.y),
      r: round(num(raw.r, LIMITS.tree.r, 2), 2),
      h: round(h2, 1),
      base: round(num(raw.base, [0, Math.max(0, h2 - 0.5)], Math.min(h2 * 0.3, 3)), 1)
    };
  }
  if (!Array.isArray(raw.ring)) return null;
  const ring = raw.ring.slice(0, MAX_RING).filter((p) => Array.isArray(p) && p.length >= 2).map((p) => [coord(p[0]), coord(p[1])]);
  while (ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]) ring.pop();
  if (ring.length < 3) return null;
  const h = num(raw.h, LIMITS.building.h, 9);
  const out = { type: "building", ...common, ring, h: round(h, 1), base: round(num(raw.base, [0, Math.max(0, h - 1)], 0), 1) };
  if (Number.isFinite(raw.id)) out.id = Math.round(raw.id);
  return out;
}
function normalizeCheck(raw, room, baseDate) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.poly)) return null;
  const poly = raw.poly.slice(0, 12).filter((p) => Array.isArray(p) && p.length >= 2).map((p) => [round(num(p[0], [0, room.w], 0), 2), round(num(p[1], [0, room.d], 0), 2)]);
  if (poly.length < 3) return null;
  const month = Math.round(num(raw.month, [1, 12], baseDate.month));
  return { month, day: Math.round(num(raw.day, [1, daysInMonth(month)], baseDate.day)), minutes: Math.round(num(raw.minutes, [0, 1439], 720)), poly };
}
function normalizeScene(raw) {
  const base = defaultScene();
  const input = raw && typeof raw === "object" ? raw : {};
  const r = input.room && typeof input.room === "object" ? input.room : {};
  const room = {
    w: round(num(r.w, LIMITS.room.w, base.room.w)),
    d: round(num(r.d, LIMITS.room.d, base.room.d)),
    h: round(num(r.h, LIMITS.room.h, base.room.h)),
    wall: round(num(r.wall, LIMITS.room.wall, base.room.wall))
  };
  const windows = (Array.isArray(input.windows) ? input.windows : base.windows).slice(0, MAX_WINDOWS).map((w) => normalizeWindow(w, room));
  const doors = (Array.isArray(input.doors) ? input.doors : []).slice(0, MAX_DOORS).map((d) => normalizeDoor(d, room));
  const p = input.place && typeof input.place === "object" ? input.place : {};
  const place = {
    name: typeof p.name === "string" ? p.name.slice(0, 60) : base.place.name,
    lat: round(num(p.lat, [-80, 80], base.place.lat), 7),
    lon: round(num(p.lon, [-180, 180], base.place.lon), 7),
    zone: isZone(p.zone) ? p.zone : base.place.zone
  };
  const f = input.floor && typeof input.floor === "object" ? input.floor : {};
  const floor = { n: Math.round(num(f.n, LIMITS.floor.n, 1)), storey: round(num(f.storey, LIMITS.floor.storey, 3), 2) };
  const dt = input.date && typeof input.date === "object" ? input.date : {};
  const month = Math.round(num(dt.month, [1, 12], base.date.month));
  const day = Math.round(num(dt.day, [1, daysInMonth(month)], base.date.day));
  const items = (Array.isArray(input.items) ? input.items : base.items).slice(0, MAX_ITEMS).map((i) => normalizeItem(i, room)).filter(Boolean);
  const obstacles = (Array.isArray(input.obstacles) ? input.obstacles : []).slice(0, MAX_OBSTACLES).map(normalizeObstacle).filter(Boolean);
  const date = { month, day };
  const checks = (Array.isArray(input.checks) ? input.checks : []).slice(0, MAX_CHECKS).map((c) => normalizeCheck(c, room, date)).filter(Boolean);
  return {
    v: 2,
    room,
    facing: round((num(input.facing, [-1e6, 1e6], base.facing) % 360 + 360) % 360, 1),
    floor,
    windows,
    doors,
    place,
    obstacles,
    date,
    minutes: Math.round(num(input.minutes, [0, 1439], base.minutes)),
    items,
    checks
  };
}

// src/core/poly.js
var EPS = 1e-9;
var rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
function signedArea(p) {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const [x0, y0] = p[i];
    const [x1, y1] = p[(i + 1) % p.length];
    s += x0 * y1 - x1 * y0;
  }
  return s / 2;
}
var area = (p) => Math.abs(signedArea(p));
var ccw = (p) => signedArea(p) < 0 ? p.slice().reverse() : p;
var hasLength = (p, q) => Math.abs(q[0] - p[0]) > 1e-12 || Math.abs(q[1] - p[1]) > 1e-12;
function centroid(p) {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < p.length; i++) {
    const [x0, y0] = p[i];
    const [x1, y1] = p[(i + 1) % p.length];
    const f = x0 * y1 - x1 * y0;
    a += f;
    cx += (x0 + x1) * f;
    cy += (y0 + y1) * f;
  }
  if (Math.abs(a) < EPS) return p.length ? [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length] : [0, 0];
  return [cx / (3 * a), cy / (3 * a)];
}
function dedupe(poly) {
  const out = [];
  for (const p of poly) {
    const last = out[out.length - 1];
    if (!last || Math.abs(p[0] - last[0]) > 1e-12 || Math.abs(p[1] - last[1]) > 1e-12) out.push(p);
  }
  while (out.length > 1 && Math.abs(out[0][0] - out[out.length - 1][0]) <= 1e-12 && Math.abs(out[0][1] - out[out.length - 1][1]) <= 1e-12) out.pop();
  return out;
}
function clipHalf(poly, a, b, c) {
  const out = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % n];
    const fp = a * p[0] + b * p[1] + c;
    const fq = a * q[0] + b * q[1] + c;
    if (fp >= 0) out.push(p);
    if (fp >= 0 !== fq >= 0) {
      const t = fp / (fp - fq);
      out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
    }
  }
  return dedupe(out);
}
var leftOf = (p, q) => [-(q[1] - p[1]), q[0] - p[0], (q[1] - p[1]) * p[0] - (q[0] - p[0]) * p[1]];
function clipConvex(poly, clip) {
  const c = ccw(dedupe(clip));
  let out = dedupe(poly);
  for (let i = 0; i < c.length && out.length; i++) {
    if (!hasLength(c[i], c[(i + 1) % c.length])) continue;
    const [a, b, k] = leftOf(c[i], c[(i + 1) % c.length]);
    out = clipHalf(out, a, b, k);
  }
  return out.length >= 3 && area(out) > EPS ? out : [];
}
function subtractConvex(poly, hole) {
  const h = ccw(dedupe(hole));
  if (h.length < 3 || area(h) < EPS) return [poly];
  const pieces = [];
  let rest = dedupe(poly);
  for (let i = 0; i < h.length && rest.length; i++) {
    const [a, b, k] = leftOf(h[i], h[(i + 1) % h.length]);
    const outside = clipHalf(rest, -a, -b, -k);
    if (outside.length >= 3 && area(outside) > EPS) pieces.push(outside);
    rest = clipHalf(rest, a, b, k);
  }
  return pieces;
}
function unionArea(polys) {
  const pieces = [];
  let total = 0;
  for (const poly of polys) {
    let fresh = [poly];
    for (const old of pieces) {
      fresh = fresh.flatMap((f) => subtractConvex(f, old));
      if (!fresh.length) break;
    }
    for (const f of fresh) {
      pieces.push(f);
      total += area(f);
    }
  }
  return total;
}
function insideConvex(poly, x, y) {
  const sign = signedArea(poly) < 0 ? -1 : 1;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    if (sign * ((q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0])) < -EPS) return false;
  }
  return true;
}
var side = (a, b, c) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
function selfCrossing(ring) {
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || i === 0 && j === n - 1) continue;
      const c = ring[j];
      const d = ring[(j + 1) % n];
      if (side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0) return true;
    }
  }
  return false;
}

// src/core/obstacles.js
var FRONT = 1e-6;
var cross = (a, b, p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
function hullOf(points) {
  const pts = points.slice().sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const keep = (list, p) => {
    while (list.length >= 2 && cross(list[list.length - 2], list[list.length - 1], p) <= 0) list.pop();
    list.push(p);
  };
  const lower = [];
  for (const p of pts) keep(lower, p);
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) keep(upper, pts[i]);
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}
var isConvex = (poly) => {
  for (let i = 0; i < poly.length; i++) if (cross(poly[i], poly[(i + 1) % poly.length], poly[(i + 2) % poly.length]) < -1e-9) return false;
  return true;
};
var inTriangle = (a, b, c, p) => cross(a, b, p) >= -1e-12 && cross(b, c, p) >= -1e-12 && cross(c, a, p) >= -1e-12;
function triangulate(ring) {
  const idx = ring.map((_, i) => i);
  const tris = [];
  let guard = ring.length * ring.length;
  while (idx.length > 3 && guard-- > 0) {
    let clipped = false;
    for (let k = 0; k < idx.length; k++) {
      const i0 = idx[(k + idx.length - 1) % idx.length];
      const i1 = idx[k];
      const i2 = idx[(k + 1) % idx.length];
      const [a, b, c] = [ring[i0], ring[i1], ring[i2]];
      const turn = cross(a, b, c);
      if (Math.abs(turn) < 1e-12) {
        idx.splice(k, 1);
        clipped = true;
        break;
      }
      if (turn < 0) continue;
      if (idx.some((j) => j !== i0 && j !== i1 && j !== i2 && inTriangle(a, b, c, ring[j]))) continue;
      tris.push([i0, i1, i2]);
      idx.splice(k, 1);
      clipped = true;
      break;
    }
    if (!clipped) return null;
  }
  if (idx.length === 3) tris.push(idx.slice());
  return tris;
}
function convexParts(ring) {
  let poly = dedupe(ring);
  if (poly.length < 3) return [];
  if (selfCrossing(poly)) {
    const hull = hullOf(poly);
    return hull.length >= 3 && area(hull) > 1e-9 ? [hull] : [];
  }
  if (signedArea(poly) < 0) poly = poly.slice().reverse();
  if (area(poly) < 1e-9) return [];
  if (isConvex(poly)) return [poly];
  const tris = triangulate(poly);
  if (!tris) return [hullOf(poly)];
  let parts = tris.map((t) => t.slice());
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let a = 0; a < parts.length; a++) {
      for (let b = a + 1; b < parts.length; b++) {
        const union = tryMerge(parts[a], parts[b], poly);
        if (union) {
          parts[a] = union;
          parts.splice(b, 1);
          merged = true;
          break outer;
        }
      }
    }
  }
  return parts.map((p) => p.map((i) => poly[i])).filter((p) => p.length >= 3 && area(p) > 1e-9);
}
function tryMerge(pa, pb, ring) {
  for (let i = 0; i < pa.length; i++) {
    const u = pa[i];
    const v = pa[(i + 1) % pa.length];
    const j = pb.findIndex((x, k) => x === v && pb[(k + 1) % pb.length] === u);
    if (j < 0) continue;
    const out = [];
    for (let k = 1; k <= pa.length; k++) out.push(pa[(i + k) % pa.length]);
    for (let k = 2; k < pb.length; k++) out.push(pb[(j + k) % pb.length]);
    const pts = out.map((x) => ring[x]);
    const trimmed = out.filter((x, k) => Math.abs(cross(pts[(k + pts.length - 1) % pts.length], pts[k], pts[(k + 1) % pts.length])) > 1e-12);
    return isConvex(trimmed.map((x) => ring[x])) ? trimmed : null;
  }
  return null;
}
function crownRing(x, y, r) {
  const R = r * 1.02;
  return Array.from({ length: 12 }, (_, i) => [x + R * Math.cos(i * Math.PI / 6), y + R * Math.sin(i * Math.PI / 6)]);
}
var memo = /* @__PURE__ */ new WeakMap();
function obstaclePrisms(scene, o) {
  const lift = floorLift(scene);
  if (o.type === "tree") {
    return [{ footprint: crownRing(o.x, o.y, o.r).map(([e, n]) => localToRoom(scene, e, n)), z0: o.base - lift, z1: o.h - lift }];
  }
  const ring = o.ring.map(([e, n]) => localToRoom(scene, e, n));
  return convexParts(ring).map((part) => ({ footprint: part, z0: o.base - lift, z1: o.h - lift }));
}
function sceneObstacles(scene) {
  let hit = memo.get(scene);
  if (hit) return hit;
  hit = [];
  for (const o of scene.obstacles || []) if (o.on) hit.push(...obstaclePrisms(scene, o));
  memo.set(scene, hit);
  return hit;
}
function balconyPrism(room, win2) {
  const b = win2.balcony;
  if (!b || b.rail < 0.05) return null;
  const f = wallFrame(room, win2.wall);
  const at = (u, v) => [f.o[0] + f.t[0] * u + f.n[0] * v, f.o[1] + f.t[1] * u + f.n[1] * v];
  const u0 = win2.pos - b.ext;
  const u1 = win2.pos + win2.w + b.ext;
  const v0 = room.wall + b.depth;
  const v1 = v0 + 0.1;
  return { footprint: [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)], z0: -0.3, z1: b.rail };
}
function prismShadow(room, win2, frame, s, prism) {
  const off = frame.n[0] * frame.o[0] + frame.n[1] * frame.o[1] + room.wall;
  const front = clipHalf(prism.footprint, frame.n[0], frame.n[1], -(off + FRONT));
  if (front.length < 3) return null;
  const sn = s[0] * frame.n[0] + s[1] * frame.n[1];
  const st = s[0] * frame.t[0] + s[1] * frame.t[1];
  const pts = [];
  for (const q of front) {
    const dist = frame.n[0] * q[0] + frame.n[1] * q[1] - off;
    const tau = dist / sn;
    const a = frame.t[0] * (q[0] - frame.o[0]) + frame.t[1] * (q[1] - frame.o[1]) - tau * st - win2.pos;
    pts.push([a, prism.z0 - tau * s[2]], [a, prism.z1 - tau * s[2]]);
  }
  const poly = hullOf(pts);
  return poly.length >= 3 ? poly : null;
}

// src/core/light.js
var MIN_NORMAL = 0.02;
var MIN_UP = 3e-3;
var BIG = 1e3;
var SIDE_PLANES = {
  top: { axis: 1, side: "max" },
  bottom: { axis: 1, side: "min" },
  right: { axis: 0, side: "max" },
  left: { axis: 0, side: "min" }
};
var overlaps = (poly, [a0, b0, a1, b1]) => {
  let lo0 = Infinity;
  let lo1 = Infinity;
  let hi0 = -Infinity;
  let hi1 = -Infinity;
  for (const [x, y] of poly) {
    lo0 = Math.min(lo0, x);
    hi0 = Math.max(hi0, x);
    lo1 = Math.min(lo1, y);
    hi1 = Math.max(hi1, y);
  }
  return hi0 > a0 && lo0 < a1 && hi1 > b0 && lo1 < b1;
};
function litOpening(room, win2, s, minHeight = 0, prisms = []) {
  const frame = wallFrame(room, win2.wall);
  const sn = s[0] * frame.n[0] + s[1] * frame.n[1];
  const st = s[0] * frame.t[0] + s[1] * frame.t[1];
  const sz = s[2];
  if (sn < MIN_NORMAL || sz < MIN_UP) return { pieces: [], frame, sn, st, sz };
  const top = win2.sill + win2.h;
  const shiftA = room.wall * st / sn;
  const shiftB = room.wall * sz / sn;
  const a0 = Math.max(0, shiftA);
  const a1 = Math.min(win2.w, win2.w + shiftA);
  const b0 = Math.max(win2.sill, win2.sill + shiftB, minHeight);
  const b1 = Math.min(top, top + shiftB);
  if (a1 - a0 < 1e-6 || b1 - b0 < 1e-6) return { pieces: [], frame, sn, st, sz };
  let pieces = [rect(a0, b0, a1, b1)];
  const shadows = [];
  const { eave, across } = win2;
  if (eave.depth > 0) {
    const zE = top + eave.gap;
    const reach2 = zE - eave.depth * sz / sn;
    const k = st / sz;
    const lo = (b) => -eave.ext - (zE - b) * k;
    const hi = (b) => win2.w + eave.ext - (zE - b) * k;
    shadows.push([[lo(reach2), reach2], [hi(reach2), reach2], [hi(zE), zE], [lo(zE), zE]]);
  }
  if (across) {
    const limit = across.height - across.distance * sz / sn;
    shadows.push(rect(-BIG, -BIG, BIG, limit));
  }
  const rail = balconyPrism(room, win2);
  const casters = rail ? [rail, ...prisms] : prisms;
  const box = [a0, b0, a1, b1];
  for (const prism of casters) {
    const shadow = prismShadow(room, win2, frame, s, prism);
    if (shadow && overlaps(shadow, box)) shadows.push(shadow);
  }
  for (const shadow of shadows) pieces = pieces.flatMap((p) => subtractConvex(p, shadow));
  return { pieces, frame, sn, st, sz };
}
function outerPoint(room, win2, frame, a, b) {
  const along2 = win2.pos + a;
  return [frame.o[0] + frame.t[0] * along2 + frame.n[0] * room.wall, frame.o[1] + frame.t[1] * along2 + frame.n[1] * room.wall, b];
}
var along = (p, s, tau) => [p[0] - tau * s[0], p[1] - tau * s[1], p[2] - tau * s[2]];
function windowPatches(room, win2, s, { planeZ = 0, walls = true, obstacles = [] } = {}) {
  const whole = litOpening(room, win2, s, 0, obstacles);
  const { frame, sz } = whole;
  const out = { floor: [], walls: [], opening: whole.pieces };
  if (!whole.pieces.length) return out;
  const clipRoom = rect(0, 0, room.w, room.d);
  const above = planeZ > 0 ? litOpening(room, win2, s, planeZ, obstacles).pieces : whole.pieces;
  const outer = (piece) => piece.map(([a, b]) => outerPoint(room, win2, frame, a, b));
  for (const piece of above) {
    const onPlane = outer(piece).map((p) => along(p, s, (p[2] - planeZ) / sz));
    const poly = clipConvex(onPlane.map((p) => [p[0], p[1]]), clipRoom);
    if (poly.length) out.floor.push(poly);
  }
  if (!walls) return out;
  for (const piece of whole.pieces) {
    const points = outer(piece);
    for (const wall of WALLS) {
      if (wall === win2.wall) continue;
      const { axis, side: side2 } = SIDE_PLANES[wall];
      if (Math.abs(s[axis]) < 1e-9) continue;
      const c = side2 === "max" ? axis === 0 ? room.w : room.d : 0;
      const taus = points.map((p) => (p[axis] - c) / s[axis]);
      if (!taus.every((t) => t >= -1e-9)) continue;
      const hit = points.map((p, i) => along(p, s, taus[i]));
      const u = axis === 0 ? 1 : 0;
      const length = axis === 0 ? room.d : room.w;
      const flat = clipConvex(hit.map((p) => [p[u], p[2]]), rect(0, 0, length, room.h));
      if (!flat.length) continue;
      out.walls.push({ wall, poly: flat.map(([x, z]) => axis === 0 ? [c, x, z] : [x, c, z]) });
    }
  }
  return out;
}
function scenePatches(scene, sun, options) {
  if (!(sun.elevation > 0)) return { floor: [], walls: [], windows: scene.windows.map(() => ({ floor: [], walls: [], opening: [] })) };
  const s = sunInRoom(scene, sun.azimuth, sun.elevation);
  const opts = { ...options, obstacles: sceneObstacles(scene) };
  const windows = scene.windows.map((win2) => windowPatches(scene.room, win2, s, opts));
  return {
    floor: windows.flatMap((w) => w.floor),
    walls: windows.flatMap((w) => w.walls),
    windows
  };
}
var totalArea = unionArea;

// src/core/hours.js
var MIN_ELEVATION = 0.2;
var pause = () => new Promise((resolve) => setTimeout(resolve, 0));
function slicer({ signal, onProgress, budget = 12 } = {}) {
  let t0 = performance.now();
  return async (done, total) => {
    if (signal?.aborted) return true;
    if (performance.now() - t0 > budget) {
      onProgress?.(done / total);
      await pause();
      t0 = performance.now();
      return Boolean(signal?.aborted);
    }
    return false;
  };
}
function daySteps(place, month, day, stepMinutes = 5) {
  const { lat, lon, zone } = place;
  const steps = [];
  let hours = 0;
  for (const [from, to] of sunTimes(YEAR, month, day, lat, lon, zone).intervals) {
    const count = Math.max(1, Math.ceil((to - from) / stepMinutes));
    const width = (to - from) / count;
    for (let i = 0; i < count; i++) {
      const minutes = from + width * (i + 0.5);
      const p = solarPosition(localToUtc(YEAR, month, day, minutes, zone), lat, lon);
      if (p.apparent > MIN_ELEVATION) {
        steps.push({ minutes, azimuth: p.azimuth, elevation: p.apparent, w: width / 60 });
        hours += width / 60;
      }
    }
  }
  return { steps, hours };
}
function sunAt(place, month, day, minutes) {
  const p = solarPosition(localToUtc(YEAR, month, day, minutes, place.zone), place.lat, place.lon);
  return { azimuth: p.azimuth, elevation: p.apparent, geometric: p.elevation };
}
function monthDays(month) {
  const days = [];
  for (let d = 2; d <= daysInMonth(month); d += 3) days.push({ month, day: d });
  return days;
}
function seasonDays(months) {
  return months.flatMap(monthDays);
}
function makeGrid(room, cell) {
  const nx = Math.max(1, Math.round(room.w / cell));
  const ny = Math.max(1, Math.round(room.d / cell));
  return { nx, ny, cx: room.w / nx, cy: room.d / ny, hours: new Float32Array(nx * ny) };
}
function stamp(grid, polys, mark) {
  const { nx, ny, cx, cy } = grid;
  for (const poly of polys) {
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const [x, y] of poly) {
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    const i0 = Math.max(0, Math.floor(x0 / cx - 0.5));
    const i1 = Math.min(nx - 1, Math.ceil(x1 / cx - 0.5));
    const j0 = Math.max(0, Math.floor(y0 / cy - 0.5));
    const j1 = Math.min(ny - 1, Math.ceil(y1 / cy - 0.5));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        if (!mark[j * nx + i] && insideConvex(poly, (i + 0.5) * cx, (j + 0.5) * cy)) mark[j * nx + i] = 1;
      }
    }
  }
}
async function sunHours(scene, days, { planeZ = 0, cell = 0.1, stepMinutes = 6, ...slicing } = {}) {
  const grid = makeGrid(scene.room, cell);
  const mark = new Uint8Array(grid.nx * grid.ny);
  const slice = slicer(slicing);
  let done = 0;
  for (const { month, day } of days) {
    if (await slice(done++, days.length)) return null;
    for (const step of daySteps(scene.place, month, day, stepMinutes).steps) {
      const patches = scenePatches(scene, step, { planeZ, walls: false });
      if (!patches.floor.length) continue;
      mark.fill(0);
      stamp(grid, patches.floor, mark);
      for (let i = 0; i < mark.length; i++) if (mark[i]) grid.hours[i] += step.w;
    }
  }
  const n = Math.max(1, days.length);
  for (let i = 0; i < grid.hours.length; i++) grid.hours[i] /= n;
  return grid;
}
function hoursAt(grid, room, x, y) {
  const i = Math.min(grid.nx - 1, Math.max(0, Math.floor(x / grid.cx)));
  const j = Math.min(grid.ny - 1, Math.max(0, Math.floor(y / grid.cy)));
  return grid.hours[j * grid.nx + i];
}
function hoursOver(grid, x, y, w, d) {
  const i0 = Math.max(0, Math.floor(x / grid.cx));
  const i1 = Math.min(grid.nx - 1, Math.ceil((x + w) / grid.cx) - 1);
  const j0 = Math.max(0, Math.floor(y / grid.cy));
  const j1 = Math.min(grid.ny - 1, Math.ceil((y + d) / grid.cy) - 1);
  let sum = 0;
  let count = 0;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++, count++) sum += grid.hours[j * grid.nx + i];
  return count ? sum / count : 0;
}
var LIGHT_NEEDS = {
  full: { min: 6, max: Infinity },
  partial: { min: 3, max: 6 },
  low: { min: 0.5, max: 3 }
};
function plantSpots(grid, need, { footprint = 0.3, count = 3, gap = 0.6 } = {}) {
  const range = LIGHT_NEEDS[need];
  if (!range) return [];
  const { nx, ny, cx, cy } = grid;
  const rx = Math.max(1, Math.ceil(footprint / cx - 1e-9));
  const ry = Math.max(1, Math.ceil(footprint / cy - 1e-9));
  const target = Number.isFinite(range.max) ? (range.min + range.max) / 2 : Infinity;
  const found = [];
  for (let j = 0; j + ry <= ny; j++) {
    for (let i = 0; i + rx <= nx; i++) {
      let lo = Infinity;
      let hi = -Infinity;
      for (let b = j; b < j + ry; b++) for (let a = i; a < i + rx; a++) {
        const v = grid.hours[b * nx + a];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      if (lo < range.min || hi >= range.max) continue;
      const mean = (lo + hi) / 2;
      found.push({ x: (i + rx / 2) * cx, y: (j + ry / 2) * cy, hours: mean, score: Number.isFinite(target) ? -Math.abs(mean - target) : mean });
    }
  }
  found.sort((p, q) => q.score - p.score);
  const picked = [];
  for (const spot of found) {
    if (picked.every((p) => Math.hypot(p.x - spot.x, p.y - spot.y) >= gap)) picked.push(spot);
    if (picked.length === count) break;
  }
  return picked.map(({ x, y, hours }) => ({ x, y, hours }));
}
async function afternoonSun(scene, days, { fromMinutes = 14 * 60, stepMinutes = 5, ...slicing } = {}) {
  let lit = 0;
  let peak = 0;
  let latest = null;
  let earliest = null;
  const slice = slicer(slicing);
  let done = 0;
  for (const { month, day } of days) {
    if (await slice(done++, days.length)) return null;
    for (const step of daySteps(scene.place, month, day, stepMinutes).steps) {
      if (step.minutes < fromMinutes) continue;
      const p = scenePatches(scene, step);
      if (!p.floor.length && !p.walls.length) continue;
      lit += step.w;
      peak = Math.max(peak, unionArea(p.floor));
      latest = latest === null ? step.minutes : Math.max(latest, step.minutes);
      earliest = earliest === null ? step.minutes : Math.min(earliest, step.minutes);
    }
  }
  const n = Math.max(1, days.length);
  return { hoursPerDay: lit / n, peakFloorArea: peak, earliest, latest, days: days.length };
}
function sunPath(place, month, day, stepMinutes = 15) {
  const t = dayTrack(YEAR, month, day, place.lat, place.lon, place.zone, stepMinutes);
  return { sunrise: t.sunrise, sunset: t.sunset, polarDay: t.polarDay, polarNight: t.polarNight, samples: t.samples.map((s) => ({ minutes: s.minutes, azimuth: s.azimuth, elevation: s.apparent })) };
}

// src/core/codec.js
var PREFIX = "r1=";
var PREFIX2 = "r2=";
var MAX_LENGTH = 16e3;
function toBase64Url(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromBase64Url(text) {
  const bin = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
function blurPlace(place) {
  return { name: "", lat: Math.round(place.lat), lon: Math.round(place.lon), zone: place.zone };
}
function blurScene(scene) {
  const s = normalizeScene(scene);
  return normalizeScene({ ...s, place: blurPlace(s.place), obstacles: s.obstacles.map(({ name, id, ...rest }) => ({ ...rest, name: "" })) });
}
function unpackScene(a) {
  const [w, d, h, wall, facing, place, month, day, minutes, windows, items] = a;
  return normalizeScene({
    room: { w, d, h, wall },
    facing,
    place: { name: place[0], lat: place[1], lon: place[2], zone: place[3] },
    date: { month, day },
    minutes,
    windows: windows.map((x) => ({ wall: WALLS[x[0]], pos: x[1], w: x[2], h: x[3], sill: x[4], eave: { depth: x[5], gap: x[6], ext: x[7] }, across: x[8] ? { height: x[8][0], distance: x[8][1] } : null })),
    items: items.map((x) => ({ kind: ITEM_KINDS[x[0]], x: x[1], y: x[2], w: x[3], d: x[4], h: x[5] }))
  });
}
var dm = (v) => Math.round(v * 10);
var cm = (v) => Math.round(v * 100);
var FLAGS = { on: 1, est: 2, own: 4, osm: 8 };
function packObstacle(o) {
  const flags = (o.on ? FLAGS.on : 0) | (o.est ? FLAGS.est : 0) | (o.own ? FLAGS.own : 0) | (o.src === "osm" ? FLAGS.osm : 0);
  if (o.type === "tree") return [1, flags, dm(o.h), dm(o.base), o.name, 0, dm(o.x), dm(o.y), dm(o.r)];
  const flat = [];
  let px = 0;
  let py = 0;
  for (const [x, y] of o.ring) {
    flat.push(dm(x) - px, dm(y) - py);
    px = dm(x);
    py = dm(y);
  }
  return [0, flags, dm(o.h), dm(o.base), o.name, o.id ?? 0, ...flat];
}
function unpackObstacle(a) {
  const [kind, flags, h, base, name, id] = a;
  const common = { on: Boolean(flags & FLAGS.on), est: Boolean(flags & FLAGS.est), own: Boolean(flags & FLAGS.own), src: flags & FLAGS.osm ? "osm" : "manual", name, h: h / 10, base: base / 10 };
  if (kind === 1) return { type: "tree", ...common, x: a[6] / 10, y: a[7] / 10, r: a[8] / 10 };
  const ring = [];
  let px = 0;
  let py = 0;
  for (let i = 6; i + 1 < a.length; i += 2) {
    px += a[i];
    py += a[i + 1];
    ring.push([px / 10, py / 10]);
  }
  return { type: "building", ...common, ring, ...id ? { id } : {} };
}
function packScene2(scene, { obstacles = true, checks = true } = {}) {
  const s = normalizeScene(scene);
  return [
    [s.room.w, s.room.d, s.room.h, s.room.wall],
    s.facing,
    [s.place.name, s.place.lat, s.place.lon, s.place.zone],
    [s.floor.n, s.floor.storey],
    [s.date.month, s.date.day, s.minutes],
    s.windows.map((w) => [WALLS.indexOf(w.wall), w.pos, w.w, w.h, w.sill, w.eave.depth, w.eave.gap, w.eave.ext, w.across ? [w.across.height, w.across.distance] : 0, w.balcony ? [w.balcony.depth, w.balcony.rail, w.balcony.ext] : 0]),
    s.doors.map((d) => [WALLS.indexOf(d.wall), d.pos, d.w]),
    s.items.map((i) => [ITEM_KINDS.indexOf(i.kind), i.x, i.y, i.w, i.d, i.h, i.rot]),
    obstacles ? s.obstacles.map(packObstacle) : [],
    checks ? s.checks.map((c) => [c.month, c.day, c.minutes, ...c.poly.flatMap(([x, y]) => [cm(x), cm(y)])]) : []
  ];
}
function unpackScene2(a) {
  const [room, facing, place, floor, when, windows, doors, items, obstacles, checks] = a;
  return normalizeScene({
    room: { w: room[0], d: room[1], h: room[2], wall: room[3] },
    facing,
    place: { name: place[0], lat: place[1], lon: place[2], zone: place[3] },
    floor: { n: floor[0], storey: floor[1] },
    date: { month: when[0], day: when[1] },
    minutes: when[2],
    windows: windows.map((x) => ({ wall: WALLS[x[0]], pos: x[1], w: x[2], h: x[3], sill: x[4], eave: { depth: x[5], gap: x[6], ext: x[7] }, across: x[8] ? { height: x[8][0], distance: x[8][1] } : null, balcony: x[9] ? { depth: x[9][0], rail: x[9][1], ext: x[9][2] } : null })),
    doors: doors.map((x) => ({ wall: WALLS[x[0]], pos: x[1], w: x[2] })),
    items: items.map((x) => ({ kind: ITEM_KINDS[x[0]], x: x[1], y: x[2], w: x[3], d: x[4], h: x[5], rot: x[6] })),
    obstacles: obstacles.map(unpackObstacle),
    checks: checks.map((x) => ({ month: x[0], day: x[1], minutes: x[2], poly: Array.from({ length: Math.floor((x.length - 3) / 2) }, (_, i) => [x[3 + 2 * i] / 100, x[4 + 2 * i] / 100]) }))
  });
}
var reach = (o) => o.type === "tree" ? Math.hypot(o.x, o.y) : Math.min(...o.ring.map(([x, y]) => Math.hypot(x, y)));
function encodeScene(scene) {
  const s = normalizeScene(scene);
  const write = (value) => PREFIX2 + toBase64Url(new TextEncoder().encode(JSON.stringify(packScene2(value))));
  let text = write(s);
  if (text.length <= MAX_LENGTH) return text;
  let trimmed = { ...s, checks: [] };
  text = write(trimmed);
  const byReach = s.obstacles.slice().sort((a, b) => reach(a) - reach(b));
  while (text.length > MAX_LENGTH && byReach.length) {
    byReach.pop();
    trimmed = { ...trimmed, obstacles: s.obstacles.filter((o) => byReach.includes(o)) };
    text = write(trimmed);
  }
  return text;
}
function decodeScene(hash) {
  const text = String(hash || "").replace(/^#/, "");
  const second = text.startsWith(PREFIX2);
  if (!(second || text.startsWith(PREFIX)) || text.length > MAX_LENGTH) return null;
  try {
    const packed = JSON.parse(new TextDecoder().decode(fromBase64Url(text.slice(PREFIX.length))));
    if (!Array.isArray(packed)) return null;
    return second ? unpackScene2(packed) : unpackScene(packed);
  } catch {
    return null;
  }
}

// src/core/geo.js
var RAD2 = Math.PI / 180;
function metresPerDegree(lat) {
  const p = lat * RAD2;
  return {
    lat: 111132.92 - 559.82 * Math.cos(2 * p) + 1.175 * Math.cos(4 * p) - 23e-4 * Math.cos(6 * p),
    lon: 111412.84 * Math.cos(p) - 93.5 * Math.cos(3 * p) + 0.118 * Math.cos(5 * p)
  };
}
function toLocal(center, lat, lon) {
  const m = metresPerDegree(center.lat);
  let dLon = lon - center.lon;
  if (dLon > 180) dLon -= 360;
  if (dLon < -180) dLon += 360;
  return [dLon * m.lon, (lat - center.lat) * m.lat];
}
function fromLocal(center, east, north) {
  const m = metresPerDegree(center.lat);
  return { lat: center.lat + north / m.lat, lon: center.lon + east / m.lon };
}
function haversine(a, b) {
  const dLat = (b.lat - a.lat) * RAD2;
  const dLon = (b.lon - a.lon) * RAD2;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD2) * Math.cos(b.lat * RAD2) * Math.sin(dLon / 2) ** 2;
  return 2 * 63710088e-1 * Math.asin(Math.min(1, Math.sqrt(h)));
}
function moveRoom(scene, dEast, dNorth) {
  const place = { ...scene.place, ...fromLocal(scene.place, dEast, dNorth) };
  const shift = (e, n) => [e - dEast, n - dNorth];
  const obstacles = scene.obstacles.map((o) => {
    if (o.type === "tree") {
      const [x, y] = shift(o.x, o.y);
      return { ...o, x, y };
    }
    return { ...o, ring: o.ring.map(([e, n]) => shift(e, n)) };
  });
  return { ...scene, place, obstacles };
}
function insideRing(ring, [x, y]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// src/core/osm.js
var OSM_LIMIT = 60;
var LEVEL = 3.2;
var TYPICAL = {
  house: 7,
  detached: 7,
  semidetached_house: 7,
  terrace: 7,
  bungalow: 4,
  cabin: 3,
  hut: 3,
  shed: 3,
  garage: 3,
  garages: 3,
  carport: 3,
  roof: 4,
  farm_auxiliary: 5,
  barn: 6,
  apartments: 15,
  residential: 12,
  dormitory: 12,
  hotel: 18,
  commercial: 14,
  office: 18,
  retail: 8,
  supermarket: 8,
  industrial: 9,
  warehouse: 8,
  school: 12,
  university: 14,
  hospital: 16,
  church: 12,
  temple: 10,
  shrine: 8,
  public: 10,
  civic: 10,
  government: 12,
  train_station: 10,
  parking: 9
};
var DEFAULT_HEIGHT = 9;
function parseLength(text) {
  if (typeof text !== "string" && typeof text !== "number") return null;
  const s = String(text).trim().toLowerCase().replace(",", ".");
  const feet = s.match(/^(\d+(?:\.\d+)?)\s*'\s*(?:(\d+(?:\.\d+)?)\s*"?)?$/);
  if (feet) return (Number(feet[1]) + (feet[2] ? Number(feet[2]) / 12 : 0)) * 0.3048;
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(m|ft|feet|meters|metres)?$/);
  if (!m) return null;
  const v = Number(m[1]);
  return m[2] === "ft" || m[2] === "feet" ? v * 0.3048 : v;
}
var hasHeight = (tags = {}) => parseLength(tags.height) > 0 || Number.isFinite(Number(tags["building:levels"])) && Number(tags["building:levels"]) > 0;
function buildingHeight(tags = {}, prior = null) {
  const top = parseLength(tags.height);
  const base = parseLength(tags.min_height);
  if (top != null && top > 0) return { h: top, base: base ?? 0, est: false };
  const levels = Number(tags["building:levels"]);
  const minLevel = Number(tags["building:min_level"]);
  if (Number.isFinite(levels) && levels > 0) {
    const roof = tags["roof:shape"] && tags["roof:shape"] !== "flat" ? 1.5 : 0;
    return { h: levels * LEVEL + roof, base: Number.isFinite(minLevel) && minLevel > 0 ? minLevel * LEVEL : base ?? 0, est: true };
  }
  return { h: TYPICAL[tags.building] ?? prior ?? DEFAULT_HEIGHT, base: base ?? 0, est: true };
}
function neighbourHeight([x, y], known, k = 5) {
  if (known.length < 3) return null;
  const near = known.map((o) => ({ h: o.h, d: Math.hypot(o.x - x, o.y - y) })).sort((a, b) => a.d - b.d).slice(0, k).map((o) => o.h).sort((a, b) => a - b);
  return near[Math.floor(near.length / 2)];
}
var area2 = (r) => r.reduce((s, p, i) => s + p[0] * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * p[1], 0) / 2;
var centroid2 = (r) => [r.reduce((s, p) => s + p[0], 0) / r.length, r.reduce((s, p) => s + p[1], 0) / r.length];
function simplifyRing(ring, tolerance) {
  if (ring.length <= 4) return ring;
  let a = 0;
  let b = 0;
  let best = -1;
  for (let i = 0; i < ring.length; i++) for (let j = i + 1; j < ring.length; j++) {
    const d = (ring[i][0] - ring[j][0]) ** 2 + (ring[i][1] - ring[j][1]) ** 2;
    if (d > best) {
      best = d;
      a = i;
      b = j;
    }
  }
  const half = (from, to) => {
    const pts = [];
    for (let i = from; i !== to; i = (i + 1) % ring.length) pts.push(ring[i]);
    pts.push(ring[to]);
    return dp(pts, tolerance);
  };
  const one = half(a, b);
  const two = half(b, a);
  return one.slice(0, -1).concat(two.slice(0, -1));
}
function dp(pts, tol) {
  if (pts.length < 3) return pts;
  const [ax, ay] = pts[0];
  const [bx, by] = pts[pts.length - 1];
  const len2 = Math.hypot(bx - ax, by - ay) || 1e-12;
  let worst = -1;
  let at = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / len2;
    if (d > worst) {
      worst = d;
      at = i;
    }
  }
  if (worst <= tol) return [pts[0], pts[pts.length - 1]];
  return dp(pts.slice(0, at + 1), tol).slice(0, -1).concat(dp(pts.slice(at), tol));
}
function fitRing(ring) {
  let tol = 0.3;
  let out = simplifyRing(ring, tol);
  while (out.length > MAX_RING && tol < 3) {
    tol *= 1.6;
    out = simplifyRing(ring, tol);
  }
  return out.length > MAX_RING ? out.filter((_, i) => i % Math.ceil(out.length / MAX_RING) === 0) : out;
}
function buildingQuery(lat, lon, radius = 200) {
  const around = `around:${Math.round(radius)},${lat.toFixed(5)},${lon.toFixed(5)}`;
  return `[out:json][timeout:20];(way["building"](${around});way["building:part"](${around}););out geom tags;(relation["building"](${around});relation["building:part"](${around}););out geom;`;
}
var ringOf = (geometry, center) => {
  if (!Array.isArray(geometry) || geometry.length < 4) return null;
  const pts = geometry.filter((g) => g && Number.isFinite(g.lat) && Number.isFinite(g.lon)).map((g) => toLocal(center, g.lat, g.lon));
  if (pts.length < 4) return null;
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (Math.hypot(first[0] - last[0], first[1] - last[1]) > 0.5) return null;
  pts.pop();
  return pts;
};
var pointKey = (g) => `${g.lat},${g.lon}`;
function splitPinches(chain) {
  const rings = [];
  const stack = [];
  const at = /* @__PURE__ */ new Map();
  for (const p of chain) {
    const key = pointKey(p);
    if (at.has(key)) {
      const from = at.get(key);
      const loop = stack.splice(from + 1);
      for (const q of loop) at.delete(pointKey(q));
      if (loop.length >= 2) rings.push([stack[from], ...loop, p]);
    } else {
      at.set(key, stack.length);
      stack.push(p);
    }
  }
  return rings;
}
function outerRings(members) {
  const closed = [];
  const open = [];
  for (const m of Array.isArray(members) ? members : []) {
    if (m?.type !== "way" || m.role !== "outer" || !Array.isArray(m.geometry)) continue;
    const pts = m.geometry.filter((g) => g && Number.isFinite(g.lat) && Number.isFinite(g.lon));
    if (pts.length < 2) continue;
    if (pts.length >= 4 && pointKey(pts[0]) === pointKey(pts[pts.length - 1])) closed.push(...splitPinches(pts));
    else open.push(pts);
  }
  while (open.length) {
    let chain = open.shift();
    let grew = true;
    while (grew && pointKey(chain[0]) !== pointKey(chain[chain.length - 1])) {
      grew = false;
      const tail = pointKey(chain[chain.length - 1]);
      for (let i = 0; i < open.length; i++) {
        const seg = open[i];
        if (pointKey(seg[0]) === tail) chain = chain.concat(seg.slice(1));
        else if (pointKey(seg[seg.length - 1]) === tail) chain = chain.concat(seg.slice(0, -1).reverse());
        else continue;
        open.splice(i, 1);
        grew = true;
        break;
      }
    }
    if (chain.length >= 4 && pointKey(chain[0]) === pointKey(chain[chain.length - 1])) closed.push(...splitPinches(chain));
  }
  return closed;
}
function parseBuildings(json, center, { limit = OSM_LIMIT, eye = 0 } = {}) {
  const found = [];
  for (const el of Array.isArray(json?.elements) ? json.elements : []) {
    const tags = el.tags || {};
    if (!tags.building && !tags["building:part"]) continue;
    const rings = [];
    if (el.type === "way") rings.push(ringOf(el.geometry, center));
    else if (el.type === "relation") for (const outer of outerRings(el.members)) rings.push(ringOf(outer, center));
    for (const ring of rings) {
      if (!ring || Math.abs(area2(ring)) < 2) continue;
      found.push({ id: el.id, part: Boolean(tags["building:part"]) && !tags.building, tags, ring });
    }
  }
  const parts = found.filter((b) => b.part);
  const kept = found.filter((b) => b.part || !parts.some((p) => insideRing(b.ring, centroid2(p.ring))));
  const known = kept.filter((b) => hasHeight(b.tags)).map((b) => {
    const [x, y] = centroid2(b.ring);
    return { x, y, h: buildingHeight(b.tags).h };
  });
  const mapped = kept.map((b) => {
    const prior = !hasHeight(b.tags) && TYPICAL[b.tags.building] == null ? neighbourHeight(centroid2(b.ring), known) : null;
    const { h, base, est } = buildingHeight(b.tags, prior);
    const own = insideRing(b.ring, [0, 0]);
    const name = typeof b.tags.name === "string" ? b.tags.name.slice(0, 40) : "";
    return { type: "building", src: "osm", id: b.id, name, ring: fitRing(b.ring), h: Math.min(h, LIMITS.building.h[1]), base: Math.min(base, Math.max(0, h - 1)), est, own, on: !own };
  });
  const rank = (o) => {
    const dist = Math.min(...o.ring.map(([x, y]) => Math.hypot(x, y)));
    return Math.atan2(o.h - eye, Math.max(dist, 1));
  };
  mapped.sort((a, b) => (b.own ? 1 : 0) - (a.own ? 1 : 0) || rank(b) - rank(a));
  const left = mapped.slice(limit);
  const cutoff = left.length ? Math.max(0, Math.max(...left.map(rank)) * (180 / Math.PI)) : 0;
  return { buildings: mapped.slice(0, limit), total: mapped.length, cutoff };
}

// src/core/wmm2025.js
var EPOCH = 2025;
var COEFFICIENTS = `1 0 -29351.8 0.0 12.0 0.0;1 1 -1410.8 4545.4 9.7 -21.5;2 0 -2556.6 0.0 -11.6 0.0;2 1 2951.1 -3133.6 -5.2 -27.7;2 2 1649.3 -815.1 -8.0 -12.1;3 0 1361.0 0.0 -1.3 0.0;3 1 -2404.1 -56.6 -4.2 4.0;3 2 1243.8 237.5 0.4 -0.3;3 3 453.6 -549.5 -15.6 -4.1;4 0 895.0 0.0 -1.6 0.0;4 1 799.5 278.6 -2.4 -1.1;4 2 55.7 -133.9 -6.0 4.1;4 3 -281.1 212.0 5.6 1.6;4 4 12.1 -375.6 -7.0 -4.4;5 0 -233.2 0.0 0.6 0.0;5 1 368.9 45.4 1.4 -0.5;5 2 187.2 220.2 0.0 2.2;5 3 -138.7 -122.9 0.6 0.4;5 4 -142.0 43.0 2.2 1.7;5 5 20.9 106.1 0.9 1.9;6 0 64.4 0.0 -0.2 0.0;6 1 63.8 -18.4 -0.4 0.3;6 2 76.9 16.8 0.9 -1.6;6 3 -115.7 48.8 1.2 -0.4;6 4 -40.9 -59.8 -0.9 0.9;6 5 14.9 10.9 0.3 0.7;6 6 -60.7 72.7 0.9 0.9;7 0 79.5 0.0 -0.0 0.0;7 1 -77.0 -48.9 -0.1 0.6;7 2 -8.8 -14.4 -0.1 0.5;7 3 59.3 -1.0 0.5 -0.8;7 4 15.8 23.4 -0.1 0.0;7 5 2.5 -7.4 -0.8 -1.0;7 6 -11.1 -25.1 -0.8 0.6;7 7 14.2 -2.3 0.8 -0.2;8 0 23.2 0.0 -0.1 0.0;8 1 10.8 7.1 0.2 -0.2;8 2 -17.5 -12.6 0.0 0.5;8 3 2.0 11.4 0.5 -0.4;8 4 -21.7 -9.7 -0.1 0.4;8 5 16.9 12.7 0.3 -0.5;8 6 15.0 0.7 0.2 -0.6;8 7 -16.8 -5.2 -0.0 0.3;8 8 0.9 3.9 0.2 0.2;9 0 4.6 0.0 -0.0 0.0;9 1 7.8 -24.8 -0.1 -0.3;9 2 3.0 12.2 0.1 0.3;9 3 -0.2 8.3 0.3 -0.3;9 4 -2.5 -3.3 -0.3 0.3;9 5 -13.1 -5.2 0.0 0.2;9 6 2.4 7.2 0.3 -0.1;9 7 8.6 -0.6 -0.1 -0.2;9 8 -8.7 0.8 0.1 0.4;9 9 -12.9 10.0 -0.1 0.1;10 0 -1.3 0.0 0.1 0.0;10 1 -6.4 3.3 0.0 0.0;10 2 0.2 0.0 0.1 -0.0;10 3 2.0 2.4 0.1 -0.2;10 4 -1.0 5.3 -0.0 0.1;10 5 -0.6 -9.1 -0.3 -0.1;10 6 -0.9 0.4 0.0 0.1;10 7 1.5 -4.2 -0.1 0.0;10 8 0.9 -3.8 -0.1 -0.1;10 9 -2.7 0.9 -0.0 0.2;10 10 -3.9 -9.1 -0.0 -0.0;11 0 2.9 0.0 0.0 0.0;11 1 -1.5 0.0 -0.0 -0.0;11 2 -2.5 2.9 0.0 0.1;11 3 2.4 -0.6 0.0 -0.0;11 4 -0.6 0.2 0.0 0.1;11 5 -0.1 0.5 -0.1 -0.0;11 6 -0.6 -0.3 0.0 -0.0;11 7 -0.1 -1.2 -0.0 0.1;11 8 1.1 -1.7 -0.1 -0.0;11 9 -1.0 -2.9 -0.1 0.0;11 10 -0.2 -1.8 -0.1 0.0;11 11 2.6 -2.3 -0.1 0.0;12 0 -2.0 0.0 0.0 0.0;12 1 -0.2 -1.3 0.0 -0.0;12 2 0.3 0.7 -0.0 0.0;12 3 1.2 1.0 -0.0 -0.1;12 4 -1.3 -1.4 -0.0 0.1;12 5 0.6 -0.0 -0.0 -0.0;12 6 0.6 0.6 0.1 -0.0;12 7 0.5 -0.1 -0.0 -0.0;12 8 -0.1 0.8 0.0 0.0;12 9 -0.4 0.1 0.0 -0.0;12 10 -0.2 -1.0 -0.1 -0.0;12 11 -1.3 0.1 -0.0 0.0;12 12 -0.7 0.2 -0.1 -0.1`.split(";").map((row) => row.split(" ").map(Number));

// src/core/declination.js
var RAD3 = Math.PI / 180;
var A = 6378.137;
var F = 1 / 298.257223563;
var E2 = F * (2 - F);
var RE = 6371.2;
var N = 12;
function decimalYear(when) {
  const d = new Date(when);
  const y = d.getUTCFullYear();
  const start = Date.UTC(y, 0, 1);
  const end = Date.UTC(y + 1, 0, 1);
  return y + (d.getTime() - start) / (end - start);
}
function declination(lat, lon, year = decimalYear(Date.now()), heightKm = 0) {
  const phi = lat * RAD3;
  const lam = lon * RAD3;
  const sp = Math.sin(phi);
  const cp = Math.cos(phi);
  const rc = A / Math.sqrt(1 - E2 * sp * sp);
  const p = (rc + heightKm) * cp;
  const z = (rc * (1 - E2) + heightKm) * sp;
  const r = Math.hypot(p, z);
  const phiG = Math.asin(z / r);
  const sg = Math.sin(phiG);
  const cg = Math.cos(phiG);
  const dt = year - EPOCH;
  const P = Array.from({ length: N + 1 }, () => new Float64Array(N + 1));
  const dP = Array.from({ length: N + 1 }, () => new Float64Array(N + 1));
  P[0][0] = 1;
  for (let n = 1; n <= N; n++) {
    for (let m = 0; m <= n; m++) {
      if (n === m) {
        const k = n === 1 ? 1 : Math.sqrt((2 * n - 1) / (2 * n));
        P[n][n] = k * cg * P[n - 1][n - 1];
        dP[n][n] = k * (cg * dP[n - 1][n - 1] + sg * P[n - 1][n - 1]);
      } else {
        const a = 2 * n - 1;
        const b = Math.sqrt(n * n - m * m);
        const c = n - 1 >= m ? Math.sqrt((n - 1) * (n - 1) - m * m) : 0;
        const p2 = n - 2 >= m ? P[n - 2][m] : 0;
        const d2 = n - 2 >= m ? dP[n - 2][m] : 0;
        P[n][m] = (a * sg * P[n - 1][m] - c * p2) / b;
        dP[n][m] = (a * (sg * dP[n - 1][m] - cg * P[n - 1][m]) - c * d2) / b;
      }
    }
  }
  let x = 0;
  let y = 0;
  let zz = 0;
  for (const [n, m, g0, h0, gd, hd] of COEFFICIENTS) {
    const g = g0 + dt * gd;
    const h = h0 + dt * hd;
    const k = (RE / r) ** (n + 2);
    const cm2 = Math.cos(m * lam);
    const sm = Math.sin(m * lam);
    const term = g * cm2 + h * sm;
    x += k * term * dP[n][m];
    y += k * m * (g * sm - h * cm2) * P[n][m] / cg;
    zz -= k * (n + 1) * term * P[n][m];
  }
  const dphi = phiG - phi;
  const north = x * Math.cos(dphi) - zz * Math.sin(dphi);
  return Math.atan2(y, north) / RAD3;
}

// src/core/compass.js
var RAD4 = Math.PI / 180;
var mod2 = (a, n) => (a % n + n) % n;
function rotationMatrix(alpha, beta, gamma) {
  const [ca, sa] = [Math.cos(alpha * RAD4), Math.sin(alpha * RAD4)];
  const [cb, sb] = [Math.cos(beta * RAD4), Math.sin(beta * RAD4)];
  const [cg, sg] = [Math.cos(gamma * RAD4), Math.sin(gamma * RAD4)];
  return [
    [ca * cg - sa * sb * sg, -sa * cb, ca * sg + sa * sb * cg],
    [sa * cg + ca * sb * sg, ca * cb, sa * sg - ca * sb * cg],
    [-cb * sg, sb, cb * cg]
  ];
}
var bearing = (east, north) => mod2(Math.atan2(east, north) / RAD4, 360);
function headingFromAngles(alpha, beta, gamma) {
  const R = rotationMatrix(alpha, beta, gamma);
  const back = [-R[0][2], -R[1][2]];
  const upright = Math.hypot(back[0], back[1]);
  if (upright >= 0.5) return { bearing: bearing(back[0], back[1]), from: "back", upright };
  return { bearing: bearing(R[0][1], R[1][1]), from: "top", upright };
}
function circularMean(angles) {
  let s = 0;
  let c = 0;
  for (const a of angles) {
    s += Math.sin(a * RAD4);
    c += Math.cos(a * RAD4);
  }
  return mod2(Math.atan2(s, c) / RAD4, 360);
}
var trueHeading = (magnetic, declination2) => mod2(magnetic + declination2, 360);

// src/core/fit.js
function predictedPatch(scene, check) {
  const sun = sunAt(scene.place, check.month, check.day, check.minutes);
  if (!(sun.elevation > 0)) return [];
  return scenePatches(scene, { azimuth: sun.azimuth, elevation: sun.elevation }, { walls: false }).floor;
}
function markOutline(points) {
  const ring = dedupe(points);
  if (ring.length < 3) return ring;
  return selfCrossing(ring) || area(ring) < 1e-9 ? hullOf(ring) : ring;
}
function observedPieces(check) {
  const outline = markOutline(check.poly);
  return outline.length >= 3 && area(outline) > 1e-9 ? convexParts(outline) : [];
}
function compareCheck(scene, check) {
  const pieces = observedPieces(check);
  const model = predictedPatch(scene, check);
  const observed = pieces.reduce((s, p) => s + area(p), 0);
  const predicted = unionArea(model);
  const shared = unionArea(model.flatMap((m) => pieces.map((p) => clipConvex(m, p))).filter((p) => p.length));
  const union = observed + predicted - shared;
  let shift = null;
  if (model.length && observed > 0) {
    const weighted = (list) => {
      let cx = 0;
      let cy = 0;
      let total = 0;
      for (const p of list) {
        const a = area(p);
        const c = centroid(p);
        cx += c[0] * a;
        cy += c[1] * a;
        total += a;
      }
      return [cx / total, cy / total];
    };
    const mc = weighted(model);
    const oc = weighted(pieces);
    shift = [oc[0] - mc[0], oc[1] - mc[1]];
  }
  return { iou: union > 1e-9 ? shared / union : 0, observed, predicted, shared, shift, covered: observed > 1e-9 ? shared / observed : 0 };
}
var average = (xs) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
function cost(scene, checks) {
  return average(checks.map((c) => {
    const r = compareCheck(scene, c);
    if (!r.shift) return 2;
    return 1 - r.iou + 0.05 * Math.min(1, Math.hypot(r.shift[0], r.shift[1]) / 3);
  }));
}
var withFacing = (scene, facing) => ({ ...scene, facing: (facing % 360 + 360) % 360 });
function withWindow(scene, index2, dPos, dSill) {
  const windows = scene.windows.map((w, i) => {
    if (i !== index2) return w;
    const length = wallFrame(scene.room, w.wall).length;
    return {
      ...w,
      pos: Math.min(Math.max(0, length - w.w), Math.max(0, w.pos + dPos)),
      sill: Math.min(Math.max(0, scene.room.h - w.h), Math.max(0, w.sill + dSill))
    };
  });
  return { ...scene, windows };
}
function azimuthSpread(scene, checks) {
  const az = checks.map((c) => sunAt(scene.place, c.month, c.day, c.minutes)).filter((s) => s.elevation > 0).map((s) => s.azimuth);
  if (az.length < 2) return 0;
  let best = 0;
  for (const a of az) for (const b of az) best = Math.max(best, Math.abs((a - b + 540) % 360 - 180));
  return best;
}
function fitScene(scene, checks, { window: windowIndex = null, maxTurn = 30 } = {}) {
  const usable = checks.filter((c) => c.poly.length >= 3);
  if (!usable.length || !scene.windows.length) return null;
  let evaluations = 0;
  const score = (sc) => {
    evaluations++;
    return cost(sc, usable);
  };
  const base = scene.facing;
  let best = { d: 0, c: score(scene) };
  for (let d = -maxTurn; d <= maxTurn; d += 1) {
    const c = score(withFacing(scene, base + d));
    if (c < best.c - 1e-12) best = { d, c };
  }
  const coarse = best.d;
  for (let k = -10; k <= 10; k++) {
    const d = Math.max(-maxTurn, Math.min(maxTurn, coarse + k / 10));
    const c = score(withFacing(scene, base + d));
    if (c < best.c - 1e-12) best = { d, c };
  }
  const facingOnly = withFacing(scene, base + best.d);
  let wi = windowIndex;
  if (wi == null) {
    let top = -1;
    scene.windows.forEach((_, i) => {
      const only = { ...facingOnly, windows: [facingOnly.windows[i]] };
      const v = average(usable.map((c) => compareCheck(only, c).shared));
      if (v > top) {
        top = v;
        wi = i;
      }
    });
  }
  let chosen = { scene: facingOnly, mode: "facing", dFacing: best.d, dPos: 0, dSill: 0, c: best.c };
  if (azimuthSpread(scene, usable) >= 15) {
    let cur = { d: best.d, p: 0, s: 0, c: best.c };
    const trial = (d, p, s) => score(withWindow(withFacing(scene, base + d), wi, p, s));
    for (const [dStep, pStep, sStep] of [[1, 0.1, 0.1], [0.4, 0.04, 0.04], [0.1, 0.01, 0.01]]) {
      for (let round2 = 0; round2 < 6; round2++) {
        let moved = false;
        for (const [dd, dp2, ds] of [[dStep, 0, 0], [-dStep, 0, 0], [0, pStep, 0], [0, -pStep, 0], [0, 0, sStep], [0, 0, -sStep]]) {
          const d = Math.max(-maxTurn, Math.min(maxTurn, cur.d + dd));
          const p = Math.max(-0.8, Math.min(0.8, cur.p + dp2));
          const s = Math.max(-0.5, Math.min(0.5, cur.s + ds));
          const c = trial(d, p, s) + 4e-3 * (Math.abs(p) / 0.8 + Math.abs(s) / 0.5);
          if (c < cur.c - 1e-9) {
            cur = { d, p, s, c };
            moved = true;
          }
        }
        if (!moved) break;
      }
    }
    const fitted = withWindow(withFacing(scene, base + cur.d), wi, cur.p, cur.s);
    if (cost(fitted, usable) <= best.c - 0.03) chosen = { scene: fitted, mode: "facing+window", dFacing: cur.d, dPos: cur.p, dSill: cur.s, c: cost(fitted, usable) };
  }
  const iou = (sc) => usable.map((c) => compareCheck(sc, c).iou);
  const before = iou(scene);
  const after = iou(chosen.scene);
  return {
    scene: chosen.scene,
    mode: chosen.mode,
    window: wi,
    dFacing: Math.round(chosen.dFacing * 10) / 10,
    dPos: Math.round(chosen.dPos * 1e3) / 1e3,
    dSill: Math.round(chosen.dSill * 1e3) / 1e3,
    before,
    after,
    meanBefore: average(before),
    meanAfter: average(after),
    evaluations
  };
}

// src/core/trace.js
var sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
var dot = (a, b) => a[0] * b[0] + a[1] * b[1];
var len = (a) => Math.hypot(a[0], a[1]);
function scaleFromPoints(p1, p2, metres) {
  const px = len(sub(p2, p1));
  if (!(px > 1e-6) || !(metres > 0)) return null;
  return px / metres;
}
function rectFromCorners(a, b, c, pxPerMetre) {
  if (!(pxPerMetre > 0)) return null;
  const A2 = [a[0], -a[1]];
  const B = [b[0], -b[1]];
  const C = [c[0], -c[1]];
  const ab = sub(B, A2);
  const width = len(ab);
  if (width < 1e-6) return null;
  let u = [ab[0] / width, ab[1] / width];
  let origin = A2;
  let v = [-u[1], u[0]];
  const side2 = dot(sub(C, A2), v);
  if (Math.abs(side2) < 1e-6) return null;
  if (side2 < 0) {
    origin = B;
    u = [-u[0], -u[1]];
    v = [-u[1], u[0]];
  }
  const depth = Math.abs(side2);
  const toRoom = (p) => {
    const q = sub([p[0], -p[1]], origin);
    return [dot(q, u) / pxPerMetre, dot(q, v) / pxPerMetre];
  };
  const toPicture = (q) => {
    const x = origin[0] + (u[0] * q[0] + v[0] * q[1]) * pxPerMetre;
    const y = origin[1] + (u[1] * q[0] + v[1] * q[1]) * pxPerMetre;
    return [x, -y];
  };
  const w = width / pxPerMetre;
  const d = depth / pxPerMetre;
  return { w, d, toRoom, toPicture, corners: [[0, 0], [w, 0], [w, d], [0, d]].map(toPicture), turn: Math.atan2(u[1], u[0]) * 180 / Math.PI };
}
function openingFromTaps(room, p, q, tolerance = 0.6) {
  let best = null;
  for (const wall of WALLS) {
    const f = wallFrame(room, wall);
    const dist = (pt) => Math.abs((pt[0] - f.o[0]) * f.n[0] + (pt[1] - f.o[1]) * f.n[1]);
    const along2 = (pt) => (pt[0] - f.o[0]) * f.t[0] + (pt[1] - f.o[1]) * f.t[1];
    const cost2 = dist(p) + dist(q);
    if (dist(p) > tolerance || dist(q) > tolerance) continue;
    if (!best || cost2 < best.cost) best = { wall, cost: cost2, a: along2(p), b: along2(q), length: f.length };
  }
  if (!best) return null;
  const lo = Math.max(0, Math.min(best.a, best.b));
  const hi = Math.min(best.length, Math.max(best.a, best.b));
  if (hi - lo < LIMITS.window.w[0]) return null;
  return { wall: best.wall, pos: lo, w: hi - lo };
}
function solve(m, rhs) {
  const n = rhs.length;
  const a = m.map((row, i) => [...row, rhs[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    if (Math.abs(a[p][c]) < 1e-12) return null;
    [a[c], a[p]] = [a[p], a[c]];
    for (let r = c + 1; r < n; r++) {
      const k = a[r][c] / a[c][c];
      for (let j = c; j <= n; j++) a[r][j] -= k * a[c][j];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = a[r][n];
    for (let j = r + 1; j < n; j++) s -= a[r][j] * x[j];
    x[r] = s / a[r][r];
  }
  return x;
}
function homography(src, dst) {
  const rows = [];
  const rhs = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    rhs.push(u);
    rows.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    rhs.push(v);
  }
  const h = solve(rows, rhs);
  return h ? [[h[0], h[1], h[2]], [h[3], h[4], h[5]], [h[6], h[7], 1]] : null;
}
function applyHomography(H, [x, y]) {
  const w = H[2][0] * x + H[2][1] * y + H[2][2];
  return [(H[0][0] * x + H[0][1] * y + H[0][2]) / w, (H[1][0] * x + H[1][1] * y + H[1][2]) / w];
}

// src/core/templates.js
var win = (wall, pos, w, h, sill, extra = {}) => ({ wall, pos, w, h, sill, eave: { depth: 0, gap: 0.15, ext: 0.3 }, across: null, balcony: null, ...extra });
var balcony = (depth, rail = 1) => ({ depth, rail, ext: 0.3 });
var covered = (b, ceiling, sill, h) => ({ depth: b.depth, gap: Math.round((ceiling - sill - h) * 100) / 100, ext: 0.3 });
var balconyWindow = (wall, pos, w, h, sill, depth, ceiling) => {
  const b = balcony(depth);
  return win(wall, pos, w, h, sill, { balcony: b, eave: covered(b, ceiling, sill, h) });
};
var TEMPLATES = [
  {
    id: "studio",
    room: { w: 3.3, d: 5.2, h: 2.6, wall: 0.15 },
    windows: [balconyWindow("top", 0.45, 2.4, 2.1, 0, 1.2, 2.6)],
    doors: [{ wall: "bottom", pos: 0.3, w: 0.9 }],
    items: [{ kind: "bed", x: 0.2, y: 2.6, w: 1.5, d: 1.9, h: 0.5 }, { kind: "desk", x: 2, y: 1.4, w: 1.2, d: 0.6, h: 0.75 }, { kind: "sofa", x: 0.2, y: 0.4, w: 1.8, d: 0.9, h: 0.8 }]
  },
  {
    id: "bedroom",
    room: { w: 3.3, d: 3.9, h: 2.6, wall: 0.15 },
    windows: [win("top", 0.75, 1.8, 1.3, 0.9)],
    doors: [{ wall: "bottom", pos: 0.2, w: 0.9 }],
    items: [{ kind: "bed", x: 0.9, y: 1.1, w: 1.5, d: 1.9, h: 0.5 }, { kind: "shelf", x: 0.1, y: 0.2, w: 0.8, d: 0.45, h: 2 }]
  },
  {
    id: "master",
    room: { w: 3.6, d: 4.5, h: 2.6, wall: 0.15 },
    windows: [balconyWindow("top", 0.7, 2.2, 2.1, 0, 1.3, 2.6)],
    doors: [{ wall: "bottom", pos: 0.25, w: 0.9 }],
    items: [{ kind: "bed", x: 0.9, y: 1.4, w: 1.8, d: 2, h: 0.5 }, { kind: "desk", x: 2.3, y: 0.3, w: 1.2, d: 0.6, h: 0.75 }, { kind: "shelf", x: 0.1, y: 0.2, w: 0.9, d: 0.5, h: 2.1 }]
  },
  {
    id: "small",
    room: { w: 2.7, d: 3.2, h: 2.6, wall: 0.15 },
    windows: [win("top", 0.75, 1.2, 1.2, 1)],
    doors: [{ wall: "bottom", pos: 0.2, w: 0.8 }],
    items: [{ kind: "bed", x: 0.1, y: 1.1, w: 1, d: 2, h: 0.5 }, { kind: "desk", x: 1.4, y: 0.2, w: 1.1, d: 0.55, h: 0.75 }]
  },
  {
    id: "living",
    room: { w: 4, d: 5.6, h: 2.7, wall: 0.15 },
    windows: [balconyWindow("top", 0.6, 2.8, 2.1, 0, 1.5, 2.7)],
    doors: [{ wall: "bottom", pos: 0.4, w: 1 }],
    items: [{ kind: "sofa", x: 0.9, y: 1.6, w: 2.2, d: 0.95, h: 0.8 }, { kind: "table", x: 1.3, y: 2.9, w: 1.2, d: 0.7, h: 0.45 }, { kind: "shelf", x: 0.1, y: 4.6, w: 1.6, d: 0.4, h: 1.8 }]
  },
  {
    id: "open",
    room: { w: 4.2, d: 7.2, h: 2.7, wall: 0.15 },
    windows: [balconyWindow("top", 0.7, 2.8, 2.1, 0, 1.5, 2.7), win("left", 5.6, 1.2, 1.2, 1)],
    doors: [{ wall: "bottom", pos: 0.5, w: 1 }],
    items: [{ kind: "sofa", x: 1, y: 5, w: 2.2, d: 0.95, h: 0.8 }, { kind: "table", x: 1.4, y: 3, w: 1.6, d: 0.9, h: 0.75 }, { kind: "plant", x: 3.6, y: 6.5, w: 0.35, d: 0.35, h: 1.1 }]
  },
  {
    id: "office",
    room: { w: 2.8, d: 3.3, h: 2.6, wall: 0.15 },
    windows: [win("top", 0.65, 1.5, 1.2, 0.95)],
    doors: [{ wall: "bottom", pos: 0.2, w: 0.8 }],
    items: [{ kind: "desk", x: 0.9, y: 2.2, w: 1.4, d: 0.65, h: 0.75 }, { kind: "shelf", x: 0.1, y: 0.2, w: 0.8, d: 0.35, h: 1.9 }]
  }
];
function applyTemplate(scene, id) {
  const t = TEMPLATES.find((x) => x.id === id);
  if (!t) return scene;
  return { ...scene, room: { ...t.room }, windows: structuredClone(t.windows), doors: structuredClone(t.doors), items: structuredClone(t.items), checks: [] };
}

// src/core/cities.js
var RAW = `
Taipei|TW|25.033|121.565|Asia/Taipei|\u53F0\u5317 \u81FA\u5317 \u53F0\u5317\u5E02 \uD0C0\uC774\uBCA0\uC774 \u53F0\u5317
New Taipei|TW|25.012|121.465|Asia/Taipei|\u65B0\u5317 \u65B0\u5317\u5E02
Taoyuan|TW|24.994|121.301|Asia/Taipei|\u6843\u5712 \u6843\u56ED
Taichung|TW|24.148|120.674|Asia/Taipei|\u53F0\u4E2D \u81FA\u4E2D \u53F0\u4E2D\u5E02
Tainan|TW|22.999|120.227|Asia/Taipei|\u53F0\u5357 \u81FA\u5357 \u53F0\u5357\u5E02
Kaohsiung|TW|22.627|120.301|Asia/Taipei|\u9AD8\u96C4 \u9AD8\u96C4\u5E02
Hsinchu|TW|24.804|120.971|Asia/Taipei|\u65B0\u7AF9
Keelung|TW|25.128|121.740|Asia/Taipei|\u57FA\u9686
Chiayi|TW|23.480|120.449|Asia/Taipei|\u5609\u7FA9 \u5609\u4E49
Hualien|TW|23.977|121.607|Asia/Taipei|\u82B1\u84EE \u82B1\u83B2
Yilan|TW|24.702|121.738|Asia/Taipei|\u5B9C\u862D \u5B9C\u5170
Pingtung|TW|22.668|120.488|Asia/Taipei|\u5C4F\u6771 \u5C4F\u4E1C
Taitung|TW|22.756|121.144|Asia/Taipei|\u53F0\u6771 \u81FA\u6771 \u53F0\u4E1C
Miaoli|TW|24.560|120.821|Asia/Taipei|\u82D7\u6817
Changhua|TW|24.075|120.542|Asia/Taipei|\u5F70\u5316
Magong|TW|23.571|119.566|Asia/Taipei|\u99AC\u516C \u6F8E\u6E56 Penghu
Hong Kong|HK|22.320|114.170|Asia/Hong_Kong|\u9999\u6E2F \u30DB\u30F3\u30B3\u30F3 \uD64D\uCF69
Macau|MO|22.199|113.544|Asia/Macau|\u6FB3\u9580 \u6FB3\u95E8
Shanghai|CN|31.230|121.474|Asia/Shanghai|\u4E0A\u6D77 \u4E0A\u6D77 \uC0C1\uD558\uC774
Beijing|CN|39.904|116.407|Asia/Shanghai|\u5317\u4EAC \u5317\u4EAC \uBCA0\uC774\uC9D5
Shenzhen|CN|22.543|114.058|Asia/Shanghai|\u6DF1\u5733 \u6DF1\u30BB\u30F3 \uC120\uC804
Guangzhou|CN|23.129|113.264|Asia/Shanghai|\u5EE3\u5DDE \u5E7F\u5DDE \u5E83\u5DDE
Chengdu|CN|30.573|104.066|Asia/Shanghai|\u6210\u90FD
Chongqing|CN|29.563|106.551|Asia/Shanghai|\u91CD\u6176 \u91CD\u5E86
Wuhan|CN|30.593|114.305|Asia/Shanghai|\u6B66\u6F22 \u6B66\u6C49
Hangzhou|CN|30.274|120.155|Asia/Shanghai|\u676D\u5DDE
Nanjing|CN|32.060|118.797|Asia/Shanghai|\u5357\u4EAC
Xi'an|CN|34.341|108.940|Asia/Shanghai|\u897F\u5B89 Xian
Tianjin|CN|39.343|117.361|Asia/Shanghai|\u5929\u6D25
Tokyo|JP|35.676|139.650|Asia/Tokyo|\u6771\u4EAC \u4E1C\u4EAC \u3068\u3046\u304D\u3087\u3046 \uB3C4\uCFC4
Osaka|JP|34.694|135.502|Asia/Tokyo|\u5927\u962A \uC624\uC0AC\uCE74
Kyoto|JP|35.012|135.768|Asia/Tokyo|\u4EAC\u90FD \uAD50\uD1A0
Nagoya|JP|35.181|136.906|Asia/Tokyo|\u540D\u53E4\u5C4B
Sapporo|JP|43.062|141.354|Asia/Tokyo|\u672D\u5E4C
Fukuoka|JP|33.590|130.402|Asia/Tokyo|\u798F\u5CA1 \u798F\u5188
Naha|JP|26.212|127.681|Asia/Tokyo|\u90A3\u8987 \u6C96\u7E69 \u51B2\u7EF3 Okinawa
Seoul|KR|37.566|126.978|Asia/Seoul|\u9996\u723E \u9996\u5C14 \u30BD\u30A6\u30EB \uC11C\uC6B8
Busan|KR|35.180|129.076|Asia/Seoul|\u91DC\u5C71 \uBD80\uC0B0
Incheon|KR|37.456|126.705|Asia/Seoul|\u4EC1\u5DDD \uC778\uCC9C
Singapore|SG|1.352|103.820|Asia/Singapore|\u65B0\u52A0\u5761 \u30B7\u30F3\u30AC\u30DD\u30FC\u30EB \uC2F1\uAC00\uD3EC\uB974
Kuala Lumpur|MY|3.139|101.687|Asia/Kuala_Lumpur|\u5409\u9686\u5761 \u30AF\u30A2\u30E9\u30EB\u30F3\u30D7\u30FC\u30EB
Bangkok|TH|13.756|100.502|Asia/Bangkok|\u66FC\u8C37 \u30D0\u30F3\u30B3\u30AF \uBC29\uCF55
Hanoi|VN|21.028|105.854|Asia/Ho_Chi_Minh|\u6CB3\u5167 \u6CB3\u5185
Ho Chi Minh City|VN|10.823|106.630|Asia/Ho_Chi_Minh|\u80E1\u5FD7\u660E \u80E1\u5FD7\u660E\u5E02 Saigon
Manila|PH|14.600|120.984|Asia/Manila|\u99AC\u5C3C\u62C9 \u9A6C\u5C3C\u62C9
Jakarta|ID|-6.209|106.846|Asia/Jakarta|\u96C5\u52A0\u9054 \u96C5\u52A0\u8FBE
Denpasar|ID|-8.670|115.213|Asia/Makassar|\u5CC7\u91CC\u5CF6 \u5DF4\u5398\u5C9B Bali
Phnom Penh|KH|11.562|104.916|Asia/Phnom_Penh|\u91D1\u908A \u91D1\u8FB9
Yangon|MM|16.841|96.173|Asia/Yangon|\u4EF0\u5149
Delhi|IN|28.614|77.209|Asia/Kolkata|\u5FB7\u91CC New Delhi \uB378\uB9AC
Mumbai|IN|19.076|72.878|Asia/Kolkata|\u5B5F\u8CB7 \u5B5F\u4E70 Bombay
Bengaluru|IN|12.972|77.594|Asia/Kolkata|\u73ED\u52A0\u7F85\u723E Bangalore
Chennai|IN|13.083|80.271|Asia/Kolkata|\u6E05\u5948 Madras
Kolkata|IN|22.573|88.364|Asia/Kolkata|\u52A0\u723E\u5404\u7B54 Calcutta
Dhaka|BD|23.810|90.412|Asia/Dhaka|\u9054\u5361 \u8FBE\u5361
Karachi|PK|24.861|67.010|Asia/Karachi|\u5580\u62C9\u86A9 \u5361\u62C9\u5947
Kathmandu|NP|27.717|85.324|Asia/Kathmandu|\u52A0\u5FB7\u6EFF\u90FD \u52A0\u5FB7\u6EE1\u90FD
Colombo|LK|6.927|79.861|Asia/Colombo|\u53EF\u502B\u5761 \u79D1\u4F26\u5761
Dubai|AE|25.205|55.271|Asia/Dubai|\u675C\u62DC \u8FEA\u62DC \u30C9\u30D0\u30A4 \uB450\uBC14\uC774
Riyadh|SA|24.714|46.675|Asia/Riyadh|\u5229\u96C5\u5FB7 \u5229\u96C5\u5F97
Tel Aviv|IL|32.085|34.782|Asia/Jerusalem|\u7279\u62C9\u7DAD\u592B \u7279\u62C9\u7EF4\u592B
Istanbul|TR|41.008|28.978|Europe/Istanbul|\u4F0A\u65AF\u5766\u5821 \u4F0A\u65AF\u5766\u5E03\u5C14 \u30A4\u30B9\u30BF\u30F3\u30D6\u30FC\u30EB
Tehran|IR|35.689|51.389|Asia/Tehran|\u5FB7\u9ED1\u862D \u5FB7\u9ED1\u5170
Doha|QA|25.286|51.531|Asia/Qatar|\u591A\u54C8
London|GB|51.507|-0.128|Europe/London|\u502B\u6566 \u4F26\u6566 \u30ED\u30F3\u30C9\u30F3 \uB7F0\uB358
Paris|FR|48.857|2.352|Europe/Paris|\u5DF4\u9ECE \u30D1\u30EA \uD30C\uB9AC
Berlin|DE|52.520|13.405|Europe/Berlin|\u67CF\u6797 \u30D9\u30EB\u30EA\u30F3 \uBCA0\uB97C\uB9B0
Madrid|ES|40.417|-3.704|Europe/Madrid|\u99AC\u5FB7\u91CC \u9A6C\u5FB7\u91CC
Barcelona|ES|41.385|2.173|Europe/Madrid|\u5DF4\u585E\u9686\u7D0D \u5DF4\u585E\u7F57\u90A3
Rome|IT|41.903|12.496|Europe/Rome|\u7F85\u99AC \u7F57\u9A6C Roma \u30ED\u30FC\u30DE
Milan|IT|45.464|9.190|Europe/Rome|\u7C73\u862D \u7C73\u5170 Milano
Amsterdam|NL|52.368|4.904|Europe/Amsterdam|\u963F\u59C6\u65AF\u7279\u4E39
Brussels|BE|50.850|4.352|Europe/Brussels|\u5E03\u9B6F\u585E\u723E \u5E03\u9C81\u585E\u5C14 Bruxelles
Vienna|AT|48.208|16.374|Europe/Vienna|\u7DAD\u4E5F\u7D0D \u7EF4\u4E5F\u7EB3 Wien
Zurich|CH|47.377|8.541|Europe/Zurich|\u8607\u9ECE\u4E16 \u82CF\u9ECE\u4E16 Z\xFCrich
Prague|CZ|50.076|14.438|Europe/Prague|\u5E03\u62C9\u683C Praha
Warsaw|PL|52.230|21.012|Europe/Warsaw|\u83EF\u6C99 \u534E\u6C99 Warszawa
Stockholm|SE|59.329|18.069|Europe/Stockholm|\u65AF\u5FB7\u54E5\u723E\u6469 \u65AF\u5FB7\u54E5\u5C14\u6469
Oslo|NO|59.914|10.752|Europe/Oslo|\u5967\u65AF\u9678 \u5965\u65AF\u9646
Copenhagen|DK|55.676|12.568|Europe/Copenhagen|\u54E5\u672C\u54C8\u6839 K\xF8benhavn
Helsinki|FI|60.170|24.938|Europe/Helsinki|\u8D6B\u723E\u8F9B\u57FA \u8D6B\u5C14\u8F9B\u57FA
Reykjavik|IS|64.147|-21.943|Atlantic/Reykjavik|\u96F7\u514B\u96C5\u7DAD\u514B \u96F7\u514B\u96C5\u672A\u514B
Tromso|NO|69.649|18.955|Europe/Oslo|\u7279\u7F85\u59C6\u745F Troms\xF8
Dublin|IE|53.350|-6.260|Europe/Dublin|\u90FD\u67CF\u6797
Lisbon|PT|38.722|-9.139|Europe/Lisbon|\u91CC\u65AF\u672C Lisboa
Athens|GR|37.984|23.728|Europe/Athens|\u96C5\u5178 Ath\xEDna
Budapest|HU|47.498|19.040|Europe/Budapest|\u5E03\u9054\u4F69\u65AF \u5E03\u8FBE\u4F69\u65AF
Moscow|RU|55.756|37.617|Europe/Moscow|\u83AB\u65AF\u79D1 \u041C\u043E\u0441\u043A\u0432\u0430
Kyiv|UA|50.450|30.523|Europe/Kyiv|\u57FA\u8F14 \u57FA\u8F85 Kiev
Cairo|EG|30.044|31.236|Africa/Cairo|\u958B\u7F85 \u5F00\u7F57
Lagos|NG|6.524|3.379|Africa/Lagos|\u62C9\u54E5\u65AF \u62C9\u5404\u65AF
Nairobi|KE|-1.286|36.818|Africa/Nairobi|\u5948\u6D1B\u6BD4 \u5185\u7F57\u6BD5
Johannesburg|ZA|-26.204|28.047|Africa/Johannesburg|\u7D04\u7FF0\u5C3C\u65AF\u5821 \u7EA6\u7FF0\u5185\u65AF\u5821
Cape Town|ZA|-33.925|18.424|Africa/Johannesburg|\u958B\u666E\u6566 \u5F00\u666E\u6566 Kapstadt
Casablanca|MA|33.573|-7.590|Africa/Casablanca|\u5361\u85A9\u5E03\u862D\u52A0 \u5361\u8428\u5E03\u5170\u5361
Addis Ababa|ET|9.030|38.740|Africa/Addis_Ababa|\u963F\u8FEA\u65AF\u963F\u8C9D\u5DF4
Accra|GH|5.604|-0.187|Africa/Accra|\u963F\u514B\u62C9
New York|US|40.713|-74.006|America/New_York|\u7D10\u7D04 \u7EBD\u7EA6 NYC \u30CB\u30E5\u30FC\u30E8\u30FC\u30AF \uB274\uC695
Los Angeles|US|34.052|-118.244|America/Los_Angeles|\u6D1B\u6749\u78EF \u6D1B\u6749\u77F6 LA
Chicago|US|41.878|-87.630|America/Chicago|\u829D\u52A0\u54E5
San Francisco|US|37.775|-122.419|America/Los_Angeles|\u820A\u91D1\u5C71 \u65E7\u91D1\u5C71 SF
Seattle|US|47.606|-122.332|America/Los_Angeles|\u897F\u96C5\u5716 \u897F\u96C5\u56FE
Houston|US|29.760|-95.370|America/Chicago|\u4F11\u58EB\u9813 \u4F11\u65AF\u6566
Miami|US|25.762|-80.192|America/New_York|\u9081\u963F\u5BC6 \u8FC8\u963F\u5BC6
Denver|US|39.739|-104.990|America/Denver|\u4E39\u4F5B
Boston|US|42.360|-71.059|America/New_York|\u6CE2\u58EB\u9813 \u6CE2\u58EB\u987F
Washington|US|38.907|-77.037|America/New_York|\u83EF\u76DB\u9813 \u534E\u76DB\u987F Washington DC
Toronto|CA|43.653|-79.383|America/Toronto|\u591A\u502B\u591A \u591A\u4F26\u591A
Vancouver|CA|49.283|-123.121|America/Vancouver|\u6EAB\u54E5\u83EF \u6E29\u54E5\u534E
Montreal|CA|45.502|-73.567|America/Toronto|\u8499\u7279\u5A41 \u8499\u7279\u5229\u5C14 Montr\xE9al
Mexico City|MX|19.433|-99.133|America/Mexico_City|\u58A8\u897F\u54E5\u57CE Ciudad de M\xE9xico
Bogota|CO|4.711|-74.072|America/Bogota|\u6CE2\u54E5\u5927 Bogot\xE1
Lima|PE|-12.046|-77.043|America/Lima|\u5229\u99AC \u5229\u9A6C
Quito|EC|-0.181|-78.468|America/Guayaquil|\u57FA\u591A
Santiago|CL|-33.449|-70.669|America/Santiago|\u8056\u5730\u7259\u54E5 \u5723\u5730\u4E9A\u54E5
Buenos Aires|AR|-34.604|-58.382|America/Argentina/Buenos_Aires|\u5E03\u5B9C\u8AFE\u65AF\u827E\u5229\u65AF \u5E03\u5B9C\u8BFA\u65AF\u827E\u5229\u65AF
Sao Paulo|BR|-23.551|-46.633|America/Sao_Paulo|\u8056\u4FDD\u7F85 \u5723\u4FDD\u7F57 S\xE3o Paulo
Rio de Janeiro|BR|-22.907|-43.173|America/Sao_Paulo|\u91CC\u7D04\u71B1\u5167\u76E7 \u91CC\u7EA6\u70ED\u5185\u5362 Rio
Honolulu|US|21.307|-157.858|Pacific/Honolulu|\u6A80\u9999\u5C71 \u590F\u5A01\u5937 Hawaii
Anchorage|US|61.218|-149.900|America/Anchorage|\u5B89\u514B\u62C9\u6CBB
Sydney|AU|-33.869|151.209|Australia/Sydney|\u96EA\u68A8 \u6089\u5C3C \u30B7\u30C9\u30CB\u30FC \uC2DC\uB4DC\uB2C8
Melbourne|AU|-37.814|144.963|Australia/Melbourne|\u58A8\u723E\u672C \u58A8\u5C14\u672C
Brisbane|AU|-27.470|153.026|Australia/Brisbane|\u5E03\u91CC\u65AF\u672C
Perth|AU|-31.951|115.861|Australia/Perth|\u4F2F\u65AF \u73C0\u65AF
Auckland|NZ|-36.851|174.764|Pacific/Auckland|\u5967\u514B\u862D \u5965\u514B\u5170
Wellington|NZ|-41.287|174.776|Pacific/Auckland|\u5A01\u9748\u9813 \u60E0\u7075\u987F
`;
var CITIES = RAW.trim().split("\n").map((line) => {
  const [name, country, lat, lon, zone, rest = ""] = line.split("|");
  return { name, country, lat: Number(lat), lon: Number(lon), zone, aliases: rest.split(" ").filter(Boolean) };
});
var fold = (text) => text.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
var index = CITIES.map((city) => ({ city, keys: [city.name, ...city.aliases, city.name.split(" ").join("")].map(fold) }));
function searchCities(query, limit = 8) {
  const q = fold(query.trim());
  if (!q) return [];
  const scored = [];
  for (const { city, keys } of index) {
    let best = Infinity;
    for (const key of keys) {
      const at = key.indexOf(q);
      if (at === -1) continue;
      best = Math.min(best, at === 0 ? key === q ? 0 : 1 : 2);
    }
    if (best < Infinity) scored.push([best, city]);
  }
  scored.sort((a, b) => a[0] - b[0]);
  return scored.slice(0, limit).map(([, city]) => city);
}

// src/core/address.js
var CJK_NUMBER = /^(.*?)(\d+)(?:\s*[之-]\s*\d+)?\s*[號号]/;
var LANE = /\s*\d+\s*[巷弄]$/;
var UNIT = /(?:[,，\s]+|^)(?:\d+\s*(?:[Ff]|[Ff]loor|樓|楼|層|层)|[Ff]loor\s*\d+|[Ff]l\.?\s*\d+|\d+\s*(?:st|nd|rd|th)\s+[Ff]loor|[Aa]pt\.?\s*\w+|[Uu]nit\s*\w+|[Ss]uite\s*\w+|[Rr]oom\s*\w+|#\s*\w+|[Bb]\d+)\s*$/;
var LATIN_NUMBER = /\b(?:No|Nr|Num)\.?\s*\d+[-\w]*\s*,?\s*/i;
var LEADING_NUMBER = /^\d+[A-Za-z]?(?:-\d+)?\s*[,\s]\s*/;
function addressVariants(text) {
  const clean = String(text ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
  const out = [];
  const add = (query, exact) => {
    query = query.replace(/[,，、\s]+$/, "").replace(/^[,，、\s]+/, "").trim();
    if (query.length >= 2 && query !== clean && !out.some((v) => v.query === query)) out.push({ query, exact });
  };
  const house = CJK_NUMBER.exec(clean);
  if (house && house[1].trim()) {
    let road = house[1].trim();
    add(`${road} ${house[2]}`, true);
    add(road, false);
    while (LANE.test(road)) {
      road = road.replace(LANE, "").trim();
      if (road) add(road, false);
    }
    return out;
  }
  const bare = clean.replace(UNIT, "");
  add(bare, true);
  const noNumber = bare.replace(LATIN_NUMBER, "").replace(LEADING_NUMBER, "");
  add(noNumber, false);
  return out;
}
export {
  CITIES,
  LIGHT_NEEDS,
  TEMPLATES,
  WALLS,
  addressVariants,
  afternoonSun,
  applyHomography,
  applyTemplate,
  blurScene,
  buildingHeight,
  buildingQuery,
  circularMean,
  compareCheck,
  convexParts,
  daySteps,
  dayTrack,
  daylightIntervals,
  decimalYear,
  declination,
  decodeScene,
  defaultScene,
  encodeScene,
  fitScene,
  fromLocal,
  haversine,
  headingFromAngles,
  homography,
  hoursAt,
  hoursOver,
  isZone,
  litOpening,
  localToUtc,
  monthDays,
  moveRoom,
  normalizeScene,
  openingFromTaps,
  parseBuildings,
  parseLength,
  plantSpots,
  predictedPatch,
  prismShadow,
  rectFromCorners,
  scaleFromPoints,
  sceneObstacles,
  scenePatches,
  searchCities,
  seasonDays,
  solarPosition,
  sunAt,
  sunHours,
  sunInRoom,
  sunPath,
  sunTimes,
  sunVector,
  toLocal,
  totalArea,
  trueHeading,
  utcToLocal,
  wallBearing,
  wallFrame,
  windowPatches,
  zoneOffset
};
