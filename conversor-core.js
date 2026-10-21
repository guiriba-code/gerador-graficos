/* Conversor imagem → dados, 100% no navegador (sem servidor, sem IA).
 * Puro: recebe ImageData ({width,height,data}) e calibração, devolve números.
 * Usado por conversor-local.js (UI) e pelos testes em Node. */
import { oklab, rgb, hex } from './extrair.js';

const D = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * 100;
const px = (img, x, y) => { const i = (y * img.width + x) * 4; return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]]; };

/** Cores dominantes de série: ignora fundo, grade e texto (baixo croma). */
export function dominantColors(img, { max = 6, minChroma = 0.05 } = {}) {
  const bins = new Map();
  const step = Math.max(1, Math.floor(Math.sqrt(img.width * img.height / 250000)));
  let sampled = 0;
  for (let y = 0; y < img.height; y += step) for (let x = 0; x < img.width; x += step) {
    const [r, g, b, a] = px(img, x, y);
    if (a < 200) continue; sampled++;
    const L = oklab(r, g, b);
    if (Math.hypot(L[1], L[2]) < minChroma) continue;
    const k = `${r >> 4}_${g >> 4}_${b >> 4}`;
    const e = bins.get(k) || { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += r; e.g += g; e.b += b; bins.set(k, e);
  }
  const floor = Math.max(8, sampled * 0.0008);
  const cands = [...bins.values()].filter((e) => e.n >= floor)
    .map((e) => ({ c: [e.r / e.n, e.g / e.n, e.b / e.n].map(Math.round), n: e.n }))
    .sort((a, b) => b.n - a.n);
  const out = [];   // funde cores próximas (anti-aliasing da mesma série)
  for (const c of cands) {
    const L = oklab(...c.c);
    const hit = out.find((o) => D(o.L, L) < 12);
    if (hit) hit.n += c.n; else out.push({ L, hex: hex(...c.c), n: c.n });
  }
  return out.sort((a, b) => b.n - a.n).slice(0, max).map(({ hex: h, n }) => ({ hex: h, n }));
}

/** Máscara da cor: Uint8Array w*h. */
export function colorMask(img, colorHex, tol = 12) {
  const T = oklab(...rgb(colorHex));
  const m = new Uint8Array(img.width * img.height);
  for (let i = 0, p = 0; p < m.length; p++, i += 4) {
    if (img.data[i + 3] < 128) continue;
    if (D(oklab(img.data[i], img.data[i + 1], img.data[i + 2]), T) < tol) m[p] = 1;
  }
  return m;
}

/** Linhas horizontais longas (grade/eixo), de cima pra baixo. */
export function horizontalLines(img, { frac = 0.4 } = {}) {
  const lum = (x, y) => { const [r, g, b] = px(img, x, y); return 0.299 * r + 0.587 * g + 0.114 * b; };
  const bgS = [];
  for (let y = 0; y < img.height; y += 7) for (let x = 0; x < img.width; x += 7) bgS.push(lum(x, y));
  bgS.sort((a, b) => a - b);
  const bg = bgS[bgS.length >> 1];
  const rows = [];
  for (let y = 0; y < img.height; y++) {
    let run = 0, best = 0;
    for (let x = 0; x < img.width; x++) { if (Math.abs(lum(x, y) - bg) > 12) { run++; if (run > best) best = run; } else run = 0; }
    if (best >= img.width * frac) rows.push(y);
  }
  const lines = [];
  for (const y of rows) { const l = lines[lines.length - 1]; if (l && y - l.y1 <= 1) l.y1 = y; else lines.push({ y0: y, y1: y }); }
  return lines.map((l) => (l.y0 + l.y1) / 2);
}

function columns(mask, w, h) {
  const cols = [];
  for (let x = 0; x < w; x++) {
    let n = 0, top = -1, bot = -1, sum = 0;
    for (let y = 0; y < h; y++) if (mask[y * w + x]) { n++; sum += y; if (top < 0) top = y; bot = y; }
    cols.push(n ? { n, top, bot, mid: sum / n } : null);
  }
  return cols;
}
function groups(cols, minW = 3) {
  const g = []; let s = -1;
  for (let x = 0; x <= cols.length; x++) {
    const on = x < cols.length && cols[x];
    if (on && s < 0) s = x;
    if (!on && s >= 0) { if (x - s >= minW) g.push([s, x - 1]); s = -1; }
  }
  return g;
}

/** 'bar' se a máscara forma blocos sólidos separados; senão 'line'. */
export function detectType(mask, w, h) {
  const cols = columns(mask, w, h);
  const gs = groups(cols);
  if (gs.length < 2) return 'line';
  let solid = 0, tot = 0;
  for (const [a, b] of gs) for (let x = a; x <= b; x++) {
    const c = cols[x]; tot++;
    if (c.bot - c.top >= 4 && c.n / (c.bot - c.top + 1) > 0.85) solid++;
  }
  const flatTops = gs.filter(([a, b]) => {
    const t = []; for (let x = a + 1; x < b; x++) t.push(cols[x].top);
    return t.length && Math.max(...t) - Math.min(...t) <= 2;
  }).length;
  return solid / tot > 0.8 && flatTops / gs.length > 0.7 ? 'bar' : 'line';
}

/**
 * cal = { y1px, y1val, y2px, y2val }  (duas referências do eixo Y)
 * opts = { type?: 'line'|'bar'|'auto', n?: pontos (linha), xLeft?, xRight? (px), tol? }
 * Devolve { type, series:[{color, data, points:[{x,y}]}] , rect }.
 */
export function extractSeries(img, colors, cal, opts = {}) {
  const { width: w, height: h } = img;
  const toVal = (y) => cal.y1val + (y - cal.y1px) * (cal.y2val - cal.y1val) / (cal.y2px - cal.y1px);
  const masks = colors.map((c) => colorMask(img, c, opts.tol ?? 12));
  const type = !opts.type || opts.type === 'auto' ? detectType(masks[0], w, h) : opts.type;
  let xmin = Infinity, xmax = -Infinity;
  const series = masks.map((m, k) => {
    const cols = columns(m, w, h);
    if (type === 'bar') {
      const gs = groups(cols);
      const points = gs.map(([a, b]) => {
        const tops = []; for (let x = a; x <= b; x++) tops.push(cols[x].top);
        tops.sort((p, q) => p - q);
        const y = tops[tops.length >> 1];
        xmin = Math.min(xmin, a); xmax = Math.max(xmax, b);
        return { x: (a + b) / 2, y };
      });
      return { color: colors[k], points, data: points.map((p) => toVal(p.y)) };
    }
    const occ = cols.map((c, x) => (c ? x : -1)).filter((x) => x >= 0);
    const L = opts.xLeft ?? occ[0], R = opts.xRight ?? occ[occ.length - 1];
    xmin = Math.min(xmin, L); xmax = Math.max(xmax, R);
    const n = Math.max(2, opts.n || 12);
    const yAt = (x) => {   // centro da linha na coluna; procura vizinha se vazia
      for (let d = 0; d < w * 0.03; d++) for (const xx of [x - d, x + d]) {
        const c = cols[Math.round(xx)]; if (c) return c.mid;
      }
      return null;
    };
    const points = Array.from({ length: n }, (_, i) => {
      // nas pontas, entra meia espessura de linha (cap) pra não pegar só a borda
      const x = L + (R - L) * i / (n - 1);
      const xi = Math.min(R - 1, Math.max(L + 1, Math.round(x)));
      return { x, y: yAt(xi) };
    });
    return { color: colors[k], points, data: points.map((p) => (p.y == null ? null : toVal(p.y))) };
  });
  const ys = [cal.y1px, cal.y2px];
  return { type, series, rect: { x: xmin / w, w: (xmax - xmin) / w, y: Math.min(...ys) / h, h: Math.abs(ys[1] - ys[0]) / h } };
}
