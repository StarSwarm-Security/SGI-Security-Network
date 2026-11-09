/** Snippet windows and secret masking for on-device scanners. No network. */

const TOKEN = /(?:sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z\-_]{20,})/g;

export function maskSecrets(text) {
  return String(text || '').replace(TOKEN, (token) => {
    if (token.length <= 8) return '…';
    return `${token.slice(0, 6)}…${token.slice(-2)}`;
  });
}

export function snippetAt(text, start, end) {
  const raw = String(text || '');
  const safeStart = Math.max(0, Math.min(start, raw.length));
  const safeEnd = Math.max(safeStart, Math.min(end, raw.length));
  const lineStart = raw.lastIndexOf('\n', safeStart - 1) + 1;
  let lineEnd = raw.indexOf('\n', safeEnd);
  if (lineEnd < 0) lineEnd = raw.length;
  const pad = 72;
  const viewStart = Math.max(lineStart, safeStart - pad);
  const viewEnd = Math.min(lineEnd, safeEnd + pad);
  const snippet = raw.slice(viewStart, viewEnd).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '·');
  return {
    line: raw.slice(0, safeStart).split('\n').length,
    snippet,
    markStart: safeStart - viewStart,
    markEnd: safeEnd - viewStart,
  };
}

export function scrubFinding(finding) {
  const snippet = maskSecrets(finding.snippet || '');
  const changed = snippet.length !== String(finding.snippet || '').length;
  return {
    ...finding,
    why: maskSecrets(finding.why || ''),
    fix: maskSecrets(finding.fix || ''),
    title: maskSecrets(finding.title || ''),
    snippet,
    markStart: changed ? 0 : (finding.markStart || 0),
    markEnd: changed ? 0 : (finding.markEnd || 0),
  };
}
