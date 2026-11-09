/**
 * Markup for the on-device scanners.
 * Every interpolated field goes through esc() before innerHTML.
 */
import { esc } from './analyze-render.js';

const CATEGORY_LABEL = {
  'instruction-override': 'Instruction override',
  'hidden-text': 'Hidden text',
  'exfiltration': 'Exfiltration',
  'tool-coercion': 'Tool-call coercion',
  'encoded-payload': 'Encoded payload',
  'tool-shadowing': 'Tool shadowing',
  'cross-tool': 'Cross-tool reference',
  'schema-secret': 'Secret in schema',
  'rug-pull': 'Rug-pull risk',
  'suspicious-command': 'Suspicious command',
  'skill-behavior': 'Skill behavior',
};

const ITEM_KIND = {
  server: 'MCP server',
  tool: 'Tool',
  skill: 'Skill',
  rules: 'Rules',
  file: 'File',
};

function verdictOf(value) {
  return value === 'dangerous' || value === 'suspicious' || value === 'safe' ? value : 'safe';
}

function verdictLabel(value) {
  const verdict = verdictOf(value);
  if (verdict === 'dangerous') return 'Dangerous';
  if (verdict === 'suspicious') return 'Suspicious';
  return 'Safe';
}

function sevWord(value) {
  return value === 'dangerous' || value === 'suspicious' ? value : 'info';
}

function scoreOf(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function categoryLabel(value) {
  return CATEGORY_LABEL[value] || 'Finding';
}

function renderSnippet(finding) {
  const snippet = String(finding.snippet || '');
  if (!snippet) return '';
  const start = Math.max(0, Math.min(snippet.length, Number(finding.markStart) || 0));
  const end = Math.max(start, Math.min(snippet.length, Number(finding.markEnd) || 0));
  if (end <= start) return `<pre>${esc(snippet)}</pre>`;
  return `<pre>${esc(snippet.slice(0, start))}<mark>${esc(snippet.slice(start, end))}</mark>${esc(snippet.slice(end))}</pre>`;
}

function renderFinding(finding) {
  const sev = sevWord(finding.sev);
  const line = Number.isFinite(Number(finding.line)) && Number(finding.line) > 0
    ? `Line ${esc(String(Math.floor(Number(finding.line))))} · `
    : '';
  return `<div class="find ${sev === 'dangerous' ? 'high' : ''}">` +
    `<span class="sev">${esc(sev)}</span> ` +
    `<span class="scan-cat">${esc(categoryLabel(finding.category))}</span> ` +
    `<strong>${esc(finding.title || 'Finding')}</strong>` +
    `<p class="fine">${line}${esc(finding.id || '')}</p>` +
    renderSnippet(finding) +
    `<p>${esc(finding.why || '')}</p>` +
    (finding.fix ? `<p><b>Do:</b> ${esc(finding.fix)}</p>` : '') +
    `</div>`;
}

function renderCleaned(res) {
  if (!res || !res.scanned) return '';
  return `<div class="find"><span class="sev">cleaned</span> <strong>Cleaned copy</strong>` +
    `<p class="fine">${esc(res.cleanNote || '')}</p>` +
    `<textarea readonly class="scan-cleaned" aria-label="Cleaned copy with hidden content removed">${esc(res.cleaned || '')}</textarea>` +
    `<div class="row"><button type="button" class="chip" data-scan-copy="1">Cleaned copy</button></div>` +
    `<p class="fine" data-scan-copy-status role="status"></p></div>`;
}

function renderVerdict(res) {
  const verdict = verdictOf(res && res.verdict);
  return `<div class="pg-verdict ${verdict}"><span class="pg-pill">${verdictLabel(verdict)}</span>` +
    `<p><span class="scan-score">Score ${scoreOf(res && res.score)} / 100</span> ${esc((res && res.note) || '')}</p></div>`;
}

export function renderInjectionReport(res) {
  const report = res || {};
  let html = renderVerdict(report);
  const findings = Array.isArray(report.findings) ? report.findings : [];
  if (!findings.length) {
    html += '<div class="find ok"><span class="sev">clear</span><strong> No injection rule hits.</strong><p class="fine">Still treat unexpected pages and tool text with care. This is a heuristic.</p></div>';
  }
  for (const finding of findings) html += renderFinding(finding);
  html += renderCleaned(report);
  return html;
}

export function renderPoisonReport(res) {
  const report = res || {};
  let html = renderVerdict(report);
  const items = Array.isArray(report.items) ? report.items : [];
  if (report.scanned && items.every((item) => !(item.findings || []).length)) {
    html += '<div class="find ok"><span class="sev">clear</span><strong> No poison rule hits.</strong><p class="fine">Still read the tool descriptions yourself. This is a heuristic.</p></div>';
  }
  for (const item of items) {
    const verdict = verdictOf(item && item.verdict);
    const findings = Array.isArray(item && item.findings) ? item.findings : [];
    html += `<section class="scan-item find ${verdict === 'dangerous' ? 'high' : ''}">` +
      `<span class="sev">${esc(verdictLabel(verdict))}</span> ` +
      `<strong>${esc((item && item.name) || 'Item')}</strong>` +
      `<p class="fine">${esc(ITEM_KIND[(item && item.kind)] || 'Item')}</p>`;
    if (!findings.length) {
      html += '<p>No finding on this item.</p>';
    }
    for (const finding of findings) html += renderFinding(finding);
    html += '</section>';
  }
  return html;
}

export function bindCleanedCopy(root) {
  if (!root) return;
  const button = root.querySelector('[data-scan-copy]');
  const area = root.querySelector('textarea.scan-cleaned');
  const status = root.querySelector('[data-scan-copy-status]');
  if (!button || !area || button.dataset.bound === '1') return;
  button.dataset.bound = '1';
  button.addEventListener('click', async () => {
    const text = area.value;
    try {
      await navigator.clipboard.writeText(text);
      if (status) status.textContent = 'Copied. Hidden characters are not in this text. It stayed on this device.';
    } catch {
      area.focus();
      area.select();
      if (status) status.textContent = 'Clipboard is blocked. The cleaned text is selected — copy it from there.';
    }
  });
}
