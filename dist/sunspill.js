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
var ITEM_KINDS = ["bed", "desk", "sofa", "table", "plant", "box"];
var MAX_WINDOWS = 4;
var MAX_ITEMS = 12;
var YEAR = 2026;
var LIMITS = {
  room: { w: [1.5, 20], d: [1.5, 20], h: [2, 6], wall: [0, 0.6] },
  window: { w: [0.3, 12], h: [0.3, 4], sill: [0, 4] },
  eave: { depth: [0, 4], gap: [0, 1.5], ext: [0, 3] },
  across: { height: [0, 400], distance: [2, 300] }
};
var ITEM_SIZES = {
  bed: { w: 1.5, d: 2, h: 0.5 },
  desk: { w: 1.2, d: 0.6, h: 0.75 },
  sofa: { w: 2, d: 0.9, h: 0.8 },
  table: { w: 1.2, d: 0.8, h: 0.75 },
  plant: { w: 0.3, d: 0.3, h: 0.8 },
  box: { w: 0.6, d: 0.6, h: 0.6 }
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
    v: 1,
    room: { w: 3.6, d: 4.4, h: 2.6, wall: 0.15 },
    facing: 270,
    windows: [{ wall: "top", pos: 0.9, w: 1.8, h: 1.4, sill: 0.9, eave: { depth: 0, gap: 0.15, ext: 0.3 }, across: null }],
    place: { name: "Taipei", lat: 25.033, lon: 121.565, zone: "Asia/Taipei" },
    date: { month: 7, day: 15 },
    minutes: 990,
    items: [
      { kind: "bed", x: 0.25, y: 1.5, w: 1.5, d: 2, h: 0.5 },
      { kind: "desk", x: 2.2, y: 3.5, w: 1.2, d: 0.6, h: 0.75 }
    ]
  };
}
function normalizeWindow(raw, room) {
  const win = raw && typeof raw === "object" ? raw : {};
  const wall = WALLS.includes(win.wall) ? win.wall : "top";
  const length = wallLength(room, wall);
  const w = num(win.w, [LIMITS.window.w[0], Math.min(LIMITS.window.w[1], length)], Math.min(1.5, length));
  const h = num(win.h, [LIMITS.window.h[0], Math.min(LIMITS.window.h[1], room.h)], Math.min(1.4, room.h));
  const sill = num(win.sill, [0, Math.max(0, room.h - h)], Math.min(0.9, Math.max(0, room.h - h)));
  const pos = num(win.pos, [0, Math.max(0, length - w)], Math.max(0, (length - w) / 2));
  const e = win.eave && typeof win.eave === "object" ? win.eave : {};
  const across = win.across && typeof win.across === "object" ? { height: num(win.across.height, LIMITS.across.height, 30), distance: num(win.across.distance, LIMITS.across.distance, 15) } : null;
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
    across: across && { height: round(across.height, 1), distance: round(across.distance, 1) }
  };
}
function normalizeItem(raw, room) {
  if (!raw || typeof raw !== "object" || !ITEM_KINDS.includes(raw.kind)) return null;
  const base = ITEM_SIZES[raw.kind];
  const w = num(raw.w, [0.1, Math.min(4, room.w)], base.w);
  const d = num(raw.d, [0.1, Math.min(4, room.d)], base.d);
  const h = num(raw.h, [0.05, room.h], base.h);
  return {
    kind: raw.kind,
    x: round(num(raw.x, [0, room.w - w], 0)),
    y: round(num(raw.y, [0, room.d - d], 0)),
    w: round(w),
    d: round(d),
    h: round(h)
  };
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
  const p = input.place && typeof input.place === "object" ? input.place : {};
  const place = {
    name: typeof p.name === "string" ? p.name.slice(0, 60) : base.place.name,
    lat: round(num(p.lat, [-80, 80], base.place.lat), 3),
    lon: round(num(p.lon, [-180, 180], base.place.lon), 3),
    zone: isZone(p.zone) ? p.zone : base.place.zone
  };
  const dt = input.date && typeof input.date === "object" ? input.date : {};
  const month = Math.round(num(dt.month, [1, 12], base.date.month));
  const day = Math.round(num(dt.day, [1, daysInMonth(month)], base.date.day));
  const items = (Array.isArray(input.items) ? input.items : base.items).slice(0, MAX_ITEMS).map((i) => normalizeItem(i, room)).filter(Boolean);
  return {
    v: 1,
    room,
    facing: round((num(input.facing, [-1e6, 1e6], base.facing) % 360 + 360) % 360, 1),
    windows,
    place,
    date: { month, day },
    minutes: Math.round(num(input.minutes, [0, 1439], base.minutes)),
    items
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
function litOpening(room, win, s, minHeight = 0) {
  const frame = wallFrame(room, win.wall);
  const sn = s[0] * frame.n[0] + s[1] * frame.n[1];
  const st = s[0] * frame.t[0] + s[1] * frame.t[1];
  const sz = s[2];
  if (sn < MIN_NORMAL || sz < MIN_UP) return { pieces: [], frame, sn, st, sz };
  const top = win.sill + win.h;
  const shiftA = room.wall * st / sn;
  const shiftB = room.wall * sz / sn;
  const a0 = Math.max(0, shiftA);
  const a1 = Math.min(win.w, win.w + shiftA);
  const b0 = Math.max(win.sill, win.sill + shiftB, minHeight);
  const b1 = Math.min(top, top + shiftB);
  if (a1 - a0 < 1e-6 || b1 - b0 < 1e-6) return { pieces: [], frame, sn, st, sz };
  let pieces = [rect(a0, b0, a1, b1)];
  const shadows = [];
  const { eave, across } = win;
  if (eave.depth > 0) {
    const zE = top + eave.gap;
    const reach = zE - eave.depth * sz / sn;
    const k = st / sz;
    const lo = (b) => -eave.ext - (zE - b) * k;
    const hi = (b) => win.w + eave.ext - (zE - b) * k;
    shadows.push([[lo(reach), reach], [hi(reach), reach], [hi(zE), zE], [lo(zE), zE]]);
  }
  if (across) {
    const limit = across.height - across.distance * sz / sn;
    shadows.push(rect(-BIG, -BIG, BIG, limit));
  }
  for (const shadow of shadows) pieces = pieces.flatMap((p) => subtractConvex(p, shadow));
  return { pieces, frame, sn, st, sz };
}
function outerPoint(room, win, frame, a, b) {
  const along2 = win.pos + a;
  return [frame.o[0] + frame.t[0] * along2 + frame.n[0] * room.wall, frame.o[1] + frame.t[1] * along2 + frame.n[1] * room.wall, b];
}
var along = (p, s, tau) => [p[0] - tau * s[0], p[1] - tau * s[1], p[2] - tau * s[2]];
function windowPatches(room, win, s, { planeZ = 0, walls = true } = {}) {
  const whole = litOpening(room, win, s, 0);
  const { frame, sz } = whole;
  const out = { floor: [], walls: [], opening: whole.pieces };
  if (!whole.pieces.length) return out;
  const clipRoom = rect(0, 0, room.w, room.d);
  const above = planeZ > 0 ? litOpening(room, win, s, planeZ).pieces : whole.pieces;
  const outer = (piece) => piece.map(([a, b]) => outerPoint(room, win, frame, a, b));
  for (const piece of above) {
    const onPlane = outer(piece).map((p) => along(p, s, (p[2] - planeZ) / sz));
    const poly = clipConvex(onPlane.map((p) => [p[0], p[1]]), clipRoom);
    if (poly.length) out.floor.push(poly);
  }
  if (!walls) return out;
  for (const piece of whole.pieces) {
    const points = outer(piece);
    for (const wall of WALLS) {
      if (wall === win.wall) continue;
      const { axis, side } = SIDE_PLANES[wall];
      const c = side === "max" ? axis === 0 ? room.w : room.d : 0;
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
  const windows = scene.windows.map((win) => windowPatches(scene.room, win, s, options));
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
var MAX_LENGTH = 6e3;
function toBase64Url(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromBase64Url(text) {
  const bin = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
function packScene(scene) {
  const s = normalizeScene(scene);
  return [
    s.room.w,
    s.room.d,
    s.room.h,
    s.room.wall,
    s.facing,
    [s.place.name, s.place.lat, s.place.lon, s.place.zone],
    s.date.month,
    s.date.day,
    s.minutes,
    s.windows.map((w) => [WALLS.indexOf(w.wall), w.pos, w.w, w.h, w.sill, w.eave.depth, w.eave.gap, w.eave.ext, w.across ? [w.across.height, w.across.distance] : 0]),
    s.items.map((i) => [ITEM_KINDS.indexOf(i.kind), i.x, i.y, i.w, i.d, i.h])
  ];
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
function encodeScene(scene) {
  return PREFIX + toBase64Url(new TextEncoder().encode(JSON.stringify(packScene(scene))));
}
function decodeScene(hash) {
  const text = String(hash || "").replace(/^#/, "");
  if (!text.startsWith(PREFIX) || text.length > MAX_LENGTH) return null;
  try {
    const packed = JSON.parse(new TextDecoder().decode(fromBase64Url(text.slice(PREFIX.length))));
    return Array.isArray(packed) ? unpackScene(packed) : null;
  } catch {
    return null;
  }
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
export {
  CITIES,
  LIGHT_NEEDS,
  WALLS,
  afternoonSun,
  daySteps,
  dayTrack,
  daylightIntervals,
  decodeScene,
  defaultScene,
  encodeScene,
  hoursAt,
  hoursOver,
  isZone,
  litOpening,
  localToUtc,
  monthDays,
  normalizeScene,
  plantSpots,
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
  totalArea,
  utcToLocal,
  wallBearing,
  wallFrame,
  windowPatches,
  zoneOffset
};
