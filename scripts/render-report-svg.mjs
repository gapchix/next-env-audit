// Regenerates docs/report.svg from the CLI's real output against the fixture
// app. Run after `npm run build` and `npm run fixture:build`:
//
//   node scripts/render-report-svg.mjs
//
// Dependency-free: parses the ANSI escape codes picocolors emits and lays the
// styled runs out as SVG tspans on a terminal-style card.

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const env = { ...process.env, FORCE_COLOR: '1' };
delete env.CMS_TOKEN; // severity assertions depend on it being unset

let raw = execFileSync(
  process.execPath,
  [join(root, 'dist', 'cli.js'), join(root, 'fixtures', 'basic-app')],
  { env, encoding: 'utf8' },
);

// The local absolute path is noise in a public image.
raw = raw.replace(/audited .*?[\\/]\.next/, 'audited ~/my-app/.next');

const COLORS = { 31: '#ff7b72', 32: '#3fb950', 33: '#d29922', 36: '#39c5cf' };
const DEFAULT_FILL = '#c9d1d9';
const BOLD_FILL = '#f0f6fc';
const DIM_FILL = '#8b949e';

function parseAnsiLine(line) {
  const spans = [];
  let bold = false;
  let dim = false;
  let color = null;
  let buf = '';
  const flush = () => {
    if (buf) spans.push({ text: buf, bold, dim, color });
    buf = '';
  };
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '\x1b') {
      const match = /^\x1b\[(\d+)m/.exec(line.slice(i));
      if (match) {
        flush();
        const code = Number(match[1]);
        if (code === 0) {
          bold = dim = false;
          color = null;
        } else if (code === 1) bold = true;
        else if (code === 2) dim = true;
        else if (code === 22) bold = dim = false;
        else if (code >= 31 && code <= 36) color = code;
        else if (code === 39) color = null;
        i += match[0].length - 1;
        continue;
      }
    }
    buf += line[i];
  }
  flush();
  return spans;
}

function escapeXml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const FONT_SIZE = 13;
const CHAR_W = FONT_SIZE * 0.602;
const LINE_H = 20;
const PAD = 24;
const TOP = 58;

const lines = raw.replace(/\n+$/, '').split('\n').map(parseAnsiLine);
const maxLen = Math.max(...lines.map((spans) => spans.reduce((n, s) => n + s.text.length, 0)));
const width = Math.ceil(maxLen * CHAR_W) + PAD * 2;
const height = TOP + lines.length * LINE_H + PAD;

const body = lines
  .map((spans, index) => {
    if (spans.length === 0) return '';
    const y = TOP + index * LINE_H + FONT_SIZE;
    const tspans = spans
      .map((span) => {
        const fill = span.color
          ? COLORS[span.color]
          : span.dim
            ? DIM_FILL
            : span.bold
              ? BOLD_FILL
              : DEFAULT_FILL;
        const weight = span.bold ? ' font-weight="600"' : '';
        return `<tspan fill="${fill}"${weight}>${escapeXml(span.text)}</tspan>`;
      })
      .join('');
    return `  <text x="${PAD}" y="${y}" xml:space="preserve">${tspans}</text>`;
  })
  .filter(Boolean)
  .join('\n');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="next-env-audit terminal report: one error, two warnings, one info, one allowlisted finding" font-family="ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace" font-size="${FONT_SIZE}">
  <rect width="${width}" height="${height}" rx="10" fill="#0d1117" stroke="#30363d"/>
  <circle cx="${PAD}" cy="24" r="6" fill="#ff5f57"/>
  <circle cx="${PAD + 20}" cy="24" r="6" fill="#febc2e"/>
  <circle cx="${PAD + 40}" cy="24" r="6" fill="#28c840"/>
  <text x="${width / 2}" y="28" text-anchor="middle" fill="${DIM_FILL}">npx next-env-audit</text>
${body}
</svg>
`;

mkdirSync(join(root, 'docs'), { recursive: true });
writeFileSync(join(root, 'docs', 'report.svg'), svg);
console.log(`wrote docs/report.svg (${width}x${height}, ${lines.length} lines)`);
