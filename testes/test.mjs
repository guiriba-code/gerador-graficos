import fs from 'fs'; import { PNG } from 'pngjs';
import { dominantColors, horizontalLines, extractSeries } from '../conversor-core.js';
const truth = JSON.parse(fs.readFileSync(new URL('truth.json', import.meta.url)));
for (const [name, t] of Object.entries(truth)) {
  const img = PNG.sync.read(fs.readFileSync(new URL(name + '.png', import.meta.url)));
  const cols = dominantColors(img); const lines = horizontalLines(img);
  const near = (p) => lines.reduce((a, b) => (Math.abs(b - p) < Math.abs(a - p) ? b : a));
  const cal = { y1px: near(t.calpx[0]), y1val: t.ticks[0], y2px: near(t.calpx[1]), y2val: t.ticks[1] };
  const ns = Object.keys(t.data).length;
  const r = extractSeries(img, cols.slice(0, ns).map((c) => c.hex), cal, { type: 'auto', n: t.data.s1.length });
  console.log(name, 'cores', cols.map(c=>c.hex).join(' '), 'linhas', lines.map(Math.round).join(','), 'cal', cal, 'tipo', r.type);
  const range = t.ticks[1] - t.ticks[0];
  r.series.forEach((s, k) => {
    const tr = Object.values(t.data).find((d) => Math.abs(d[0] - s.data[0]) < range*0.1) || Object.values(t.data)[k];
    const errs = s.data.map((v, i) => Math.abs(v - tr[i]) / Math.abs(tr[i]) * 100);
    const errsR = s.data.map((v, i) => Math.abs(v - tr[i]) / range * 100);
    console.log(' ', s.color, s.data.map((v) => v.toFixed(2)).join(' '), `| erro máx ${Math.max(...errs).toFixed(2)}% do valor, ${Math.max(...errsR).toFixed(2)}% da escala, médio ${(errs.reduce((a,b)=>a+b)/errs.length).toFixed(2)}%`);
  });
}
