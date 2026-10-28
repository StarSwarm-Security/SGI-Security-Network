import { AIChatAgent } from "@cloudflare/ai-chat";
import { createAI } from "agents/models/ai-sdk";
import { convertToModelMessages, generateText, streamText } from "ai";
import { answerFromFaq, looksLikeSecret, supportLlmEnabled, supportSystemPrompt } from "./faq";

/** Workers AI model used only when ENABLE_SUPPORT_LLM=1. Spends quota. */
export const SUPPORT_MODEL = "@cf/zai-org/glm-4.7-flash";

interface TextPart {
  type: string;
  text?: string;
}

interface ChatLike {
  role: string;
  parts?: TextPart[];
}

export function lastUserText(messages: readonly ChatLike[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.role !== "user" || !message.parts) continue;
    const text = message.parts
      .filter((part) => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text ?? "")
      .join("");
    if (text.trim()) return text;
  }
  return "";
}

export async function answerWithModel(env: Env, prompt: string, abortSignal?: AbortSignal): Promise<string | null> {
  if (!env.AI) return null;
  const ai = createAI({ binding: env.AI });
  const result = await generateText({
    model: ai(SUPPORT_MODEL),
    system: supportSystemPrompt(),
    prompt,
    abortSignal,
  });
  return result.text;
}

/**
 * Agents SDK chat agent. The static widget uses POST /v1/support/chat.
 * This class is the websocket agent at /agents/support-chat/:id.
 * ENABLE_SUPPORT_LLM defaults to 0, so turns stay on the FAQ pack.
 */
export class SupportChat extends AIChatAgent<Env> {
  override async onChatMessage(
    onFinish: Parameters<AIChatAgent<Env>["onChatMessage"]>[0],
    options?: Parameters<AIChatAgent<Env>["onChatMessage"]>[1],
  ): Promise<Response | undefined> {
    void onFinish;
    const text = lastUserText(this.messages);
    if (looksLikeSecret(text) || !supportLlmEnabled(this.env)) {
      const answer = answerFromFaq(text);
      return new Response(answer.reply, {
        headers: { "content-type": "text/plain; charset=utf-8", "x-sgi-support-mode": "faq" },
      });
    }
    if (!this.env.AI) {
      const answer = answerFromFaq(text);
      return new Response(answer.reply, {
        headers: { "content-type": "text/plain; charset=utf-8", "x-sgi-support-mode": "faq" },
      });
    }
    const ai = createAI({ binding: this.env.AI });
    const result = streamText({
      model: ai(SUPPORT_MODEL),
      system: supportSystemPrompt(),
      messages: await convertToModelMessages(this.messages),
      abortSignal: options?.abortSignal,
    });
    return result.toUIMessageStreamResponse();
  }
}
