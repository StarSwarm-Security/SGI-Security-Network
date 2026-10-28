import pack from "../../../data/support-faq.json";
import { looksLikeSecret, matchFaq } from "../../../js/support-match.js";

export interface SupportLink {
  label: string;
  href: string;
}

export interface FaqAnswer {
  topic: string;
  reply: string;
  links: SupportLink[];
  redacted: boolean;
}

export interface FaqPack {
  warning: string;
  greeting: string;
  secretReply: string;
  fallback: string;
  sponsors: SupportLink;
  entries: Array<{ id: string; title: string; keywords: string[]; answer: string }>;
}

const faqPack = pack as FaqPack;

function isLink(value: unknown): value is SupportLink {
  if (typeof value !== "object" || value === null) return false;
  const link = value as { label?: unknown; href?: unknown };
  return typeof link.label === "string" && typeof link.href === "string";
}

function isAnswer(value: unknown): value is FaqAnswer {
  if (typeof value !== "object" || value === null) return false;
  const row = value as { topic?: unknown; reply?: unknown; links?: unknown; redacted?: unknown };
  return typeof row.topic === "string"
    && typeof row.reply === "string"
    && typeof row.redacted === "boolean"
    && Array.isArray(row.links)
    && row.links.every(isLink);
}

export function supportPack(): FaqPack {
  return faqPack;
}

export function supportSystemPrompt(): string {
  const topics = faqPack.entries.map((entry) => `## ${entry.title}\n${entry.answer}`).join("\n\n");
  return [
    "You are StarSwarm SGI support inside the glass chat.",
    "Answer only from the FAQ below. If it is not covered, say you do not know.",
    "Never ask for or repeat passwords, seed phrases, private keys, or payment details.",
    "The only human link on this site is GitHub Sponsors. Do not invent an X or Telegram handle.",
    faqPack.warning,
    topics,
  ].join("\n\n");
}

export function answerFromFaq(text: string): FaqAnswer {
  const raw: unknown = matchFaq(faqPack, text);
  if (!isAnswer(raw)) {
    return { topic: "fallback", reply: faqPack.fallback, links: [], redacted: false };
  }
  return raw;
}

export { looksLikeSecret };

export function supportLlmEnabled(env: Env): boolean {
  const flag: string = env.ENABLE_SUPPORT_LLM;
  return flag === "1";
}
