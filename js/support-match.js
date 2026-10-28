/** Shared FAQ matcher. No network. Does not echo secrets. */

export function looksLikeSecret(text) {
  const raw = String(text || "");
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(raw)) return true;
  if (/\b(0x)?[a-f0-9]{64}\b/i.test(raw)) return true;
  if (/\b(seed phrase|mnemonic|private key|secret key|password\s*[:=])\b/i.test(raw)) return true;
  return false;
}

function normalize(text) {
  return String(text || "").toLowerCase().replace(/[^a-z0-9.$ ]+/g, " ").replace(/\s+/g, " ").trim();
}

export function matchFaq(pack, text) {
  if (!pack || !Array.isArray(pack.entries)) {
    return { topic: "fallback", reply: "Support FAQ is unavailable.", links: [], redacted: false };
  }
  if (looksLikeSecret(text)) {
    return {
      topic: "privacy",
      reply: pack.secretReply || "Do not paste secrets here.",
      links: [],
      redacted: true,
    };
  }
  const norm = normalize(text);
  let best = null;
  let bestScore = 0;
  for (const entry of pack.entries) {
    let score = 0;
    const keywords = Array.isArray(entry.keywords) ? entry.keywords : [];
    for (const keyword of keywords) {
      const needle = String(keyword || "").toLowerCase();
      if (needle && norm.includes(needle)) score += needle.length;
    }
    if (score > bestScore) {
      best = entry;
      bestScore = score;
    }
  }
  if (!best) {
    return { topic: "fallback", reply: pack.fallback || "I do not have an answer for that.", links: [], redacted: false };
  }
  const links = best.id === "human" && pack.sponsors ? [pack.sponsors] : [];
  return { topic: best.id, reply: best.answer, links, redacted: false };
}
