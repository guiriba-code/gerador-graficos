/* "Converter imagem em gráfico" sem servidor: digitalizador por pixel no
 * navegador. Imagem → canvas, cores das séries, calibração do eixo Y,
 * linha/barra, amostragem e pré-visualização; devolve os dados pra tabela. */
import { pickColor } from './extrair.js';
import { makeLabels } from './extrair.js';
import { dominantColors, horizontalLines, extractSeries, detectType, colorMask } from './conversor-core.js';

const CSS = `
#cvlDlg{width:min(1120px,96vw);max-height:94vh;padding:0;border:1px solid var(--hair-strong);border-radius:12px;background:var(--ground);color:var(--ink)}
#cvlDlg .cvl{display:grid;grid-template-columns:1fr 300px;gap:0;max-height:94vh}
#cvlDlg .cvl-stage{padding:14px;overflow:auto;border-right:1px solid var(--hair)}
#cvlDlg canvas{max-width:100%;height:auto;display:block;border-radius:6px;cursor:crosshair;background:#fff}
#cvlDlg .cvl-side{padding:14px;overflow:auto;display:grid;gap:10px;align-content:start;font-size:.8rem}
#cvlDlg #cvlDrop{display:grid;gap:6px;place-content:center;text-align:center;min-height:380px;border:2px dashed var(--hair-strong);border-radius:10px;cursor:pointer;color:var(--muted)}#cvlDlg #cvlDrop b{color:var(--ink);font-size:1rem}#cvlDlg #cvlDrop.over,#cvlDlg #cvlDrop:hover{border-color:var(--violet);background:color-mix(in srgb,var(--violet) 10%,transparent)}
#cvlDlg h3{margin:0;font-size:.95rem}
#cvlDlg .sw{display:flex;flex-wrap:wrap;gap:6px}
#cvlDlg .sw label{display:flex;align-items:center;gap:4px;padding:3px 6px;border:1px solid var(--hair);border-radius:7px;cursor:pointer}
#cvlDlg .sw i{width:16px;height:16px;border-radius:4px;display:inline-block;border:1px solid var(--hair-strong)}
#cvlDlg .row{display:grid;grid-template-columns:1fr 1fr auto;gap:6px;align-items:end}
#cvlDlg input[type=number],#cvlDlg input[type=text],#cvlDlg textarea,#cvlDlg select{width:100%;box-sizing:border-box}
#cvlDlg textarea{min-height:48px}
#cvlDlg .mode{font-size:.72rem;color:var(--mint);min-height:1em}
#cvlDlg .acts{display:flex;gap:6px;justify-content:flex-end}
#cvlDlg .tiny{font-size:.7rem;padding:2px 6px;height:auto}
`;
const $ = (id) => document.getElementById(id);
let curFile = null, img, bmp, cal, clickMode = null, result = null, onDone, picked = [];

function ensure() {
  if ($('cvlDlg')) return;
  const st = document.createElement('style'); st.textContent = CSS; document.head.append(st);
  const d = document.createElement('dialog'); d.id = 'cvlDlg';
  d.innerHTML = `<div class="cvl">
  <div class="cvl-stage"><div id="cvlDrop" tabindex="0"><b>Arraste a imagem do gráfico aqui</b><span>ou clique pra escolher um arquivo · ou cole com ⌘V / Ctrl+V</span><span class="hint">PNG ou JPG · gráfico de linha ou barras</span></div><input id="cvlFile" type="file" accept="image/*" hidden><canvas id="cvlCv" hidden></canvas><button class="tiny" id="cvlOther" hidden>Trocar imagem…</button><p class="hint">Dica: cole uma imagem com ⌘V / Ctrl+V a qualquer momento.</p></div>
  <div class="cvl-side">
    <h3>Converter imagem em gráfico</h3>
    <p class="hint">Leitura por pixel, direto no navegador — nada é enviado pra servidor.</p>
    <div><div class="fieldtitle">1. Cores das séries</div>
      <div class="sw" id="cvlSw"></div>
      <button class="tiny" id="cvlPick">+ Escolher cor clicando na imagem</button></div>
    <div><div class="fieldtitle">2. Calibração do eixo Y</div>
      <div class="row"><label class="field">Pixel (y)<input id="cvlP1" type="number"></label><label class="field">Valor<input id="cvlV1" type="number" step="any" value="0"></label><button class="tiny" id="cvlC1" title="Clique numa linha de referência">clicar</button></div>
      <div class="row"><label class="field">Pixel (y)<input id="cvlP2" type="number"></label><label class="field">Valor<input id="cvlV2" type="number" step="any" value="100"></label><button class="tiny" id="cvlC2">clicar</button></div>
      <p class="hint">Pré-preenchido com a linha de grade mais baixa e a mais alta. Digite o valor de cada uma (ou clique em outra referência).</p></div>
    <div><div class="fieldtitle">3. Eixo X</div>
      <label class="field">Tipo<select id="cvlType"><option value="auto">Detectar (linha/barra)</option><option value="line">Linha</option><option value="bar">Barras</option></select></label>
      <label class="field">Nº de pontos (linha)<input id="cvlN" type="number" min="2" value="12"></label>
      <label class="field">Rótulos (vírgula ou um por linha)<textarea id="cvlLabels" placeholder="jan, fev, mar…"></textarea></label>
      <div class="row"><label class="field">ou 1ª data<input id="cvlD0" type="text" placeholder="01/2025"></label><label class="field">última<input id="cvlD1" type="text" placeholder="12/2025"></label><span></span></div></div>
    <div class="mode" id="cvlMode"></div>
    <div class="acts"><button id="cvlRun">Pré-visualizar</button></div>
    <div class="hint" id="cvlOut"></div>
    <div class="acts"><button id="cvlCancel">Cancelar</button><button class="primary" id="cvlApply" disabled>Usar estes dados</button></div>
  </div></div>`;
  document.body.append(d);
  const cv = $('cvlCv');
  const toImg = (e) => { const r = cv.getBoundingClientRect(); return [Math.round((e.clientX - r.left) * cv.width / r.width), Math.round((e.clientY - r.top) * cv.height / r.height)]; };
  cv.addEventListener('click', (e) => {
    const [x, y] = toImg(e);
    if (clickMode === 'pick') { const h = pickColor(img, x, y, 1); if (!picked.some((p) => p.hex === h)) picked.push({ hex: h, on: true }); renderSw(); }
    else if (clickMode === 'c1') $('cvlP1').value = y;
    else if (clickMode === 'c2') $('cvlP2').value = y;
    clickMode = null; $('cvlMode').textContent = ''; draw();
  });
  const mode = (m, t) => () => { clickMode = m; $('cvlMode').textContent = t; };
  $('cvlPick').onclick = mode('pick', 'Clique na linha/barra da série na imagem…');
  $('cvlC1').onclick = mode('c1', 'Clique na altura da 1ª referência (ex.: linha do zero)…');
  $('cvlC2').onclick = mode('c2', 'Clique na altura da 2ª referência (ex.: linha mais alta)…');
  ['cvlP1', 'cvlP2'].forEach((id) => $(id).addEventListener('input', draw));
  const drop = $('cvlDrop');
  drop.onclick = () => $('cvlFile').click();
  $('cvlOther').onclick = () => $('cvlFile').click();
  drop.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') $('cvlFile').click(); };
  $('cvlFile').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) load(f); };
  d.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  d.addEventListener('dragleave', () => drop.classList.remove('over'));
  d.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); const f = [...e.dataTransfer.files].find((x) => x.type.startsWith('image/')); if (f) load(f); else $('cvlOut').textContent = 'Solte um arquivo de imagem (PNG/JPG).'; });
  d.addEventListener('paste', (e) => { const f = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith('image/')); if (f) { e.preventDefault(); e.stopPropagation(); load(f); } });
  $('cvlRun').onclick = run;
  $('cvlCancel').onclick = () => d.close();
  $('cvlApply').onclick = () => { if (result) { d.close(); onDone(result, curFile); } };
}

function renderSw() {
  $('cvlSw').innerHTML = '';
  picked.forEach((p, i) => {
    const l = document.createElement('label');
    l.innerHTML = `<input type="checkbox" ${p.on ? 'checked' : ''}><i style="background:${p.hex}"></i>${p.hex}`;
    l.querySelector('input').onchange = (e) => { picked[i].on = e.target.checked; };
    $('cvlSw').append(l);
  });
  if (!picked.length) $('cvlSw').innerHTML = '<span class="hint">Nenhuma cor detectada — escolha clicando.</span>';
}

function draw(points) {
  const cv = $('cvlCv'), ctx = cv.getContext('2d');
  ctx.drawImage(bmp, 0, 0);
  ctx.lineWidth = Math.max(1, cv.width / 600);
  for (const [id, c] of [['cvlP1', '#29E899'], ['cvlP2', '#29E899']]) {
    const y = +$(id).value; if (!$(id).value) continue;
    ctx.strokeStyle = c; ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cv.width, y); ctx.stroke();
  }
  ctx.setLineDash([]);
  if (points) for (const s of points) for (const p of s.points) {
    if (p.y == null) continue;
    ctx.fillStyle = '#4E39FF'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(4, cv.width / 220), 0, 7); ctx.fill(); ctx.stroke();
  }
}

function labelsFor(n) {
  const raw = $('cvlLabels').value.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
  if (raw.length) return Array.from({ length: n }, (_, i) => raw[i] ?? String(i + 1));
  if ($('cvlD0').value && $('cvlD1').value) return makeLabels($('cvlD0').value, $('cvlD1').value, n);
  return Array.from({ length: n }, (_, i) => String(i + 1));
}

function run() {
  const colors = picked.filter((p) => p.on).map((p) => p.hex);
  if (!colors.length) return ($('cvlOut').textContent = 'Escolha ao menos uma cor de série.');
  const c = { y1px: +$('cvlP1').value, y1val: +$('cvlV1').value, y2px: +$('cvlP2').value, y2val: +$('cvlV2').value };
  if (!$('cvlP1').value || !$('cvlP2').value || c.y1px === c.y2px) return ($('cvlOut').textContent = 'Defina duas referências diferentes no eixo Y.');
  const labN = $('cvlLabels').value.split(/[\n,;]+/).filter((s) => s.trim()).length;
  const n = labN || +$('cvlN').value || 12;
  const r = extractSeries(img, colors, c, { type: $('cvlType').value, n });
  const len = Math.max(...r.series.map((s) => s.data.length));
  if (!len) return ($('cvlOut').textContent = 'Nenhum ponto encontrado com essas cores.');
  const labels = labelsFor(len);
  const dec = Math.max(0, 4 - Math.ceil(Math.log10(Math.abs(c.y2val - c.y1val) || 1)));
  const series = r.series.map((s, k) => ({ name: `Série ${k + 1}`, data: Array.from({ length: len }, (_, i) => (s.data[i] == null ? null : +s.data[i].toFixed(dec))) }));
  result = { type: r.type, labels, series, plotRect: r.rect };
  draw(r.series);
  $('cvlOut').innerHTML = `Tipo: <b>${r.type === 'bar' ? 'barras' : 'linha'}</b> · ${len} pontos × ${series.length} série(s)<br>` +
    series.map((s) => s.data.join(' · ')).join('<br>');
  $('cvlApply').disabled = false;
}

/** Abre o conversor. Sem arquivo: mostra a área de upload (clique/arraste/cole). */
export async function openLocalConverter(file, handler) {
  ensure(); onDone = handler; result = null; $('cvlApply').disabled = true; $('cvlOut').textContent = '';
  $('cvlDrop').hidden = false; $('cvlCv').hidden = true; $('cvlOther').hidden = true;
  if (!$('cvlDlg').open) $('cvlDlg').showModal();
  if (file) await load(file); else $('cvlDrop').focus();
}
async function load(file) {
  if (!file.type?.startsWith('image/')) { $('cvlOut').textContent = 'Mande uma imagem (PNG/JPG).'; return; }
  curFile = file; result = null; $('cvlApply').disabled = true; $('cvlOut').textContent = '';
  try { bmp = await createImageBitmap(file); } catch { $('cvlOut').textContent = 'Não consegui ler essa imagem.'; return; }
  const cv = $('cvlCv'); cv.width = bmp.width; cv.height = bmp.height;
  $('cvlDrop').hidden = true; cv.hidden = false; $('cvlOther').hidden = false;
  const ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.drawImage(bmp, 0, 0);
  img = ctx.getImageData(0, 0, bmp.width, bmp.height);
  picked = dominantColors(img).map((c, i) => ({ hex: c.hex, on: i < 2 }));
  if (picked.length > 1 && picked[1].n < picked[0].n * 0.15) picked[1].on = false;
  renderSw();
  const lines = horizontalLines(img);
  $('cvlP1').value = lines.length ? Math.round(lines[lines.length - 1]) : bmp.height - 1;
  $('cvlP2').value = lines.length > 1 ? Math.round(lines[0]) : 0;
  $('cvlType').value = 'auto';
  draw();
}
export { detectType, colorMask };
