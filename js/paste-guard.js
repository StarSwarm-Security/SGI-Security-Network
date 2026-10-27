/** Offline Paste Guard — never sends paste off-device. Heuristic only. */
const RULES = [
  { id: 'seed-phrase', sev: 'dangerous', title: 'Seed / recovery phrase pattern',
    re: /\b([a-z]+(?:\s+[a-z]+){11,23})\b/i,
    why: 'Looks like a 12–24 word wallet seed. Never paste seeds into websites or chat.',
    fix: 'Close this tab. If you already shared it, move funds to a new wallet you control.' },
  { id: 'private-key', sev: 'dangerous', title: 'Private key / hex key material',
    re: /\b(0x)?[a-f0-9]{64}\b/i,
    why: '64-hex string looks like a private key or raw secret.',
    fix: 'Do not import unknown keys. Rotate if this was exposed.' },
  { id: 'clickfix-run', sev: 'dangerous', title: 'ClickFix / Run dialog lure',
    re: /\b(win\s*\+\s*r|windows\s*key\s*\+\s*r|press\s+win(dows)?\s*\+\s*r|run\s+dialog|curl\s+[^\n]{0,40}\|\s*(ba)?sh|iwr\s+.+\|\s*iex|invoke-expression|powershell\s+-enc)\b/i,
    why: 'Classic ClickFix / living-off-the-land paste: open Run, then pipe a download to a shell.',
    fix: 'Do not press Win+R or run pasted commands. Close the chat or page that asked.' },
  { id: 'powershell-encoded', sev: 'dangerous', title: 'Encoded PowerShell',
    re: /\bpowershell(\.exe)?\b[^\n]{0,80}-e(nc|ncodedcommand)\b/i,
    why: 'Encoded PowerShell is a common malware dropper pattern.',
    fix: 'Do not run it. Scan the source URL on VirusTotal if you must investigate.' },
  { id: 'wallet-connect-drain', sev: 'dangerous', title: 'Wallet-connect / drain lure',
    re: /\b(connect\s+(your\s+)?wallet|sync\s+(your\s+)?wallet|claim\s+(airdrop|reward)|mint\s+now|approve\s+unlimited| eth_sign|personal_sign|setApprovalForAll)\b/i,
    why: 'Urgency + wallet connect / approve language often precedes drainers.',
    fix: 'Use official app bookmarks. Revoke approvals on a trusted revoker if you signed.' },
  { id: 'lookalike-brand', sev: 'suspicious', title: 'Lookalike brand / support lure',
    re: /\b(microsoft|apple|google|metamask|coinbase|binance|ledger|trezor|paypal|kraken)[-_\s]?(support|helpdesk|security|verify)|case\s*#?\s*\d{4,}\b/i,
    why: 'Brand + support / case-number language is a common social-engineering opener.',
    fix: 'Contact support only via the official site you typed yourself.' },
  { id: 'shortener', sev: 'suspicious', title: 'Link shortener',
    re: /\b(bit\.ly|t\.co|tinyurl\.com|goo\.gl|rebrand\.ly|cutt\.ly|is\.gd|rb\.gy|ow\.ly)\/\S+/i,
    why: 'Short links hide the real destination.',
    fix: 'Expand the URL with a trusted preview tool before clicking.' },
  { id: 'ip-url', sev: 'suspicious', title: 'Raw IP URL',
    re: /\bhttps?:\/\/(\d{1,3}\.){3}\d{1,3}(:\d+)?(\/\S*)?/i,
    why: 'Legitimate sites rarely ask you to open a bare IP in the browser.',
    fix: 'Prefer named HTTPS domains you recognize.' },
  { id: 'punycode', sev: 'suspicious', title: 'Punycode / IDN host',
    re: /\bhttps?:\/\/xn--[a-z0-9-]+/i,
    why: 'Punycode hosts can spoof familiar brand names.',
    fix: 'Copy the host and inspect it carefully before logging in.' },
  { id: 'homoglyph-domain', sev: 'suspicious', title: 'Odd TLD / free host on “secure” link',
    re: /\bhttps?:\/\/[^\s]+(\.tk|\.ml|\.ga|\.cf|\.gq|\.zip|\.mov|trycloudflare\.com|ngrok\.io|page\.link)(\/\S*)?/i,
    why: 'Free or odd TLDs / tunnels show up often in phishing kits.',
    fix: 'Verify the brand’s real domain on a separate channel.' },
  { id: 'urgency', sev: 'suspicious', title: 'Urgency / account lock language',
    re: /\b(act\s+now|within\s+\d+\s*(hours?|minutes?)|account\s+(will\s+be\s+)?(locked|suspended|closed)|verify\s+(immediately|now)|final\s+notice|limited\s+time)\b/i,
    why: 'Pressure language is meant to skip your usual checks.',
    fix: 'Slow down. Use a bookmarked login, not the link in the message.' },
  { id: 'credential-harvest', sev: 'suspicious', title: 'Credential harvest phrasing',
    re: /\b(enter\s+(your\s+)?(password|seed|recovery|2fa|otp|ssn|routing)|confirm\s+(your\s+)?(password|identity)|update\s+(billing|payment)\s+(details|info))\b/i,
    why: 'Unsolicited asks for passwords, seeds, or payment details are high risk.',
    fix: 'Never type secrets from a cold message. Go to the app yourself.' },
  { id: 'http-login', sev: 'suspicious', title: 'HTTP (not HTTPS) link',
    re: /\bhttp:\/\/[a-z0-9.-]+\.[a-z]{2,}\S*/i,
    why: 'Cleartext HTTP can be intercepted or downgraded.',
    fix: 'Prefer HTTPS. If the brand only offers HTTP, treat as high risk.' },
  { id: 'discord-nitro', sev: 'suspicious', title: 'Free Nitro / gift bait',
    re: /\b(free\s+nitro|discord\s+gift|steam\s+gift\s+card|claim\s+your\s+gift)\b/i,
    why: 'Gift / Nitro bait is a long-running malware and token-stealer lure.',
    fix: 'Ignore unsolicited gifts. Open Discord/Steam from the official app only.' },
];

const SAMPLES = {
  safe: 'Meeting notes: ship the CCNA lab Thursday. Docs are on the internal wiki. No links.',
  suspicious: 'Your Coinbase account will be locked in 2 hours. Verify immediately: https://bit.ly/cb-secure-login case #44821',
  dangerous: 'Press Win+R and paste: powershell -enc SQBFAFgAIAAoAE4AZQB3AC0ATwBiAGoAZQBjAHQAIABOAGUAdAAuAFcAZQBiAEMAbABpAGUAbgB0ACkA',
};

function worst(a, b) {
  const rank = { safe: 0, suspicious: 1, dangerous: 2 };
  return (rank[a] || 0) >= (rank[b] || 0) ? a : b;
}

export function scanPaste(text) {
  const raw = (text || '').trim();
  if (!raw) return { verdict: 'safe', hits: [], note: 'Paste something to scan. Nothing leaves this device.' };
  const hits = [];
  for (const rule of RULES) {
    if (rule.re.test(raw)) {
      hits.push({ id: rule.id, sev: rule.sev, title: rule.title, why: rule.why, fix: rule.fix });
    }
  }
  let verdict = 'safe';
  for (const h of hits) verdict = worst(verdict, h.sev);
  return {
    verdict,
    hits,
    note: hits.length
      ? `Offline heuristic · ${hits.length} rule hit${hits.length === 1 ? '' : 's'} · paste never uploaded`
      : 'Offline heuristic · no rule hits · not a guarantee of safety',
  };
}

export function samplePaste(kind = 'suspicious') {
  return SAMPLES[kind] || SAMPLES.suspicious;
}

export { RULES, SAMPLES };
