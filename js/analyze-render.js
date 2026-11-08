/**
 * Cisco Analyze result markup. Finding text is untrusted paste data.
 * Encode every interpolated field before it reaches innerHTML.
 */

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

export function renderCiscoAnalyze(res, specialistCount) {
  const findings = (res?.reports || []).flatMap((report) =>
    (report.findings || []).map((finding) => ({ ...finding, specialist: report.name })),
  );
  const summary = res?.summary || {};
  const count = Number.isFinite(specialistCount) ? specialistCount : 0;
  let html = `<p class="lede"><b>${findings.length}</b> findings · ${count} specialists offline` +
    (summary.headline ? ` · ${esc(summary.headline)}` : '') + `</p>`;
  if (!findings.length) {
    html += '<div class="find ok"><span class="sev">clear</span><strong> No rule hits on this paste.</strong><p class="fine">Try the sample or a fuller show run.</p></div>';
  }
  for (const finding of findings.slice(0, 40)) {
    const sev = esc((finding.severity || finding.level || finding.sev || 'info').toString().toLowerCase());
    const title = esc(finding.title || finding.name || finding.id || 'Finding');
    const specialist = esc(finding.specialist || '');
    const confidence = finding.confidence != null ? `confidence ${esc(finding.confidence)}` : '';
    const body = esc(finding.detail || finding.why || finding.message || finding.summary || '');
    const fix = finding.fix || finding.remediation;
    html += `<div class="find ${sev}"><span class="sev">${sev}</span> <strong>${title}</strong>` +
      `<p class="fine">${specialist} · ${confidence}</p>` +
      `<p>${body}</p>` +
      (fix ? `<p><b>Fix:</b> ${esc(fix)}</p>` : '') + `</div>`;
  }
  return html;
}
