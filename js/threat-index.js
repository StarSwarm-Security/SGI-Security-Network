// Merge threats + bots + scam wallets into a single A–Z / type index.
export async function loadThreatIndex() {
  const [threats, bots, scams] = await Promise.all([
    fetch('data/threats.json').then(r => r.json()),
    fetch('data/bots.json').then(r => r.json()),
    fetch('data/scam-addresses.json').then(r => r.json()),
  ]);
  const items = [];
  for (const e of threats.entries || []) {
    items.push({
      type: 'threat', letter: (e.vendor || e.cve || '?')[0].toUpperCase(),
      title: e.cve + ' · ' + e.vendor, key: e.cve || e.id,
      blurb: e.name, detail: e.description, fix: e.fix, source: e.source || e.advisory,
      meta: e.product + (e.severity ? ' · ' + e.severity : ''),
    });
  }
  for (const e of bots.entries || []) {
    items.push({
      type: 'bot', letter: (e.name || '?')[0].toUpperCase(),
      title: e.name, key: e.id || e.name,
      blurb: e.kind || 'bot', detail: e.meaning, fix: e.block?.note || '', source: e.source,
      meta: e.pattern ? 'UA: ' + e.pattern : '',
    });
  }
  for (const e of scams.entries || []) {
    const a = e.address || '';
    items.push({
      type: 'wallet', letter: (e.chain || 'W')[0].toUpperCase(),
      title: (e.chain || 'chain') + ' · ' + a.slice(0, 6) + '…' + a.slice(-4),
      key: a, blurb: e.list || 'restricted address',
      detail: 'Listed address from a public restricted list. Verify on the upstream source before acting.',
      fix: 'Do not send funds. Check the OFAC / list source.', source: e.source || e.upstream,
      meta: a,
    });
  }
  // synthetic IP bucket note (toolkit has no standalone IP blacklist file)
  items.push({
    type: 'ip', letter: 'I', title: 'IP signals via Analyze', key: 'ip-analyze',
    blurb: 'No separate IP blacklist ships here',
    detail: 'Paste Cisco logs or traceroute output in Analyze. The offline rule engine flags RFC1918 misuse, overlapping subnets, and management exposure. A standalone IP reputation feed is not bundled.',
    fix: 'Use Analyze on your own device logs.', source: '', meta: 'offline',
  });
  items.sort((a, b) => a.title.localeCompare(b.title));
  return { items, meta: { threats: threats.updated, bots: bots.updated, scams: scams.updated } };
}
