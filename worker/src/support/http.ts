import { asRecord, json, readJson } from "../http";
import { logError } from "../log";
import { answerWithModel } from "./agent";
import { answerFromFaq, supportLlmEnabled, supportPack } from "./faq";

const MAX_MESSAGE = 1000;

export function handleSupportFaq(): Response {
  return json({
    warning: supportPack().warning,
    greeting: supportPack().greeting,
    sponsors: supportPack().sponsors,
    entries: supportPack().entries.map((entry) => ({ id: entry.id, title: entry.title })),
  });
}

export async function handleSupportChat(request: Request, env: Env): Promise<Response> {
  const parsed = await readJson(request, 8 * 1024);
  if (!parsed.ok) return parsed.response;
  const body = asRecord(parsed.value);
  if (!body || typeof body.message !== "string") return json({ error: "invalid_message" }, 400);
  const message = body.message.trim();
  if (!message) return json({ error: "empty_message" }, 400);
  if (message.length > MAX_MESSAGE) return json({ error: "payload_too_large", maxBytes: MAX_MESSAGE }, 413);

  const faq = answerFromFaq(message);
  if (faq.redacted || !supportLlmEnabled(env)) {
    return json({
      mode: "faq",
      llm: false,
      topic: faq.topic,
      reply: faq.reply,
      links: faq.links,
      redacted: faq.redacted,
      warning: supportPack().warning,
    });
  }

  try {
    const reply = await answerWithModel(env, message, request.signal);
    if (reply == null) {
      return json({
        mode: "faq",
        llm: false,
        topic: faq.topic,
        reply: faq.reply,
        links: faq.links,
        redacted: false,
        warning: supportPack().warning,
        note: "Workers AI binding AI is not configured. Answer is from the FAQ pack.",
      });
    }
    return json({
      mode: "llm",
      llm: true,
      topic: "model",
      reply,
      links: [],
      redacted: false,
      warning: supportPack().warning,
    });
  } catch (error) {
    logError("support_model_failed", error);
    return json({
      mode: "faq",
      llm: false,
      topic: faq.topic,
      reply: faq.reply,
      links: faq.links,
      redacted: false,
      warning: supportPack().warning,
      note: "Model call failed. Answer is from the FAQ pack.",
    }, 200);
  }
}
