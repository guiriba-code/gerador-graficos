# gerador-graficos

Static replica of the chart generator page (`graficos.html`) from
[oviniciusramosp/gerador-relatorios](https://github.com/oviniciusramosp/gerador-relatorios),
published via GitHub Pages: https://guiriba-code.github.io/gerador-graficos/graficos.html

Original code by oviniciusramosp. The upstream repo has no license file; all
rights remain with the original author. Features that depend on the upstream
local Node server (`/api/candles`, `/api/llama`, `/api/convert`, `/api/refine`)
do not work on static hosting (same as the upstream GitHub Pages deploy).

## Mudanças desta versão estática
- **Converter imagem em gráfico** roda 100% no navegador (`conversor-core.js` + `conversor-local.js`):
  upload ou colar (⌘V/Ctrl+V), cores dominantes detectadas (ou escolhidas por clique),
  calibração do eixo Y por duas referências (pré-preenchidas pelas linhas de grade),
  detecção linha × barras, rótulos do X (lista ou 1ª/última data), prévia dos pontos e
  envio pra tabela. Teste: `cd testes && npm i pngjs && node test.mjs`.
- Recursos que dependem do servidor (`/api/*`: corretora, DefiLlama, IA) mostram aviso em português.
- Menu de navegação mostra só esta página.
