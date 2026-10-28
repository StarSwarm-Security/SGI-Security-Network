import { describe, expect, it } from "vitest";
import { SELF } from "cloudflare:test";
import { answerFromFaq, looksLikeSecret } from "../src/support/faq";

const PAGES = "https://starswarm-sgi.pages.dev";

async function postChat(message: string): Promise<Response> {
  return SELF.fetch(new Request("https://sgi-api.test/v1/support/chat", {
    method: "POST",
    headers: {
      Origin: PAGES,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message }),
  }));
}

describe("support FAQ fallback", () => {
  it("answers pricing from the pack when the model is off", async () => {
    const local = answerFromFaq("how much is the yearly plan");
    expect(local.topic).toBe("pricing");
    expect(local.reply).toContain("$9.99");
    expect(local.reply).toContain("$39.99");
    expect(local.reply).toContain("3-day");

    const response = await postChat("how much is pro");
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(PAGES);
    const body = await response.json() as { mode: string; llm: boolean; topic: string; reply: string };
    expect(body.mode).toBe("faq");
    expect(body.llm).toBe(false);
    expect(body.topic).toBe("pricing");
    expect(body.reply).toContain("$9.99/month");
    expect(body.reply).toContain("$39.99/year");
  });

  it("covers shield, paste guard, swarm pass, and redeem", () => {
    expect(answerFromFaq("what is honest shield").topic).toBe("honest-shield");
    expect(answerFromFaq("does paste guard upload my paste").reply).toMatch(/device/i);
    expect(answerFromFaq("how do swarm credits work").topic).toBe("swarm-pass");
    expect(answerFromFaq("can I redeem a btc gift card").reply).toMatch(/Coming soon/i);
  });

  it("escalates to the existing GitHub Sponsors link only", () => {
    const answer = answerFromFaq("I want to talk to a human");
    expect(answer.topic).toBe("human");
    expect(answer.links).toEqual([{
      label: "GitHub Sponsors",
      href: "https://github.com/sponsors/StarSwarm-Security",
    }]);
    expect(answer.reply).not.toMatch(/t\.me|twitter\.com|x\.com/i);
  });

  it("does not echo or log a pasted key", async () => {
    const secret = `0x${"ab".repeat(32)}`;
    expect(looksLikeSecret(secret)).toBe(true);
    const logs: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map((part) => String(part)).join(" "));
      original(...args);
    };
    try {
      const response = await postChat(secret);
      const text = await response.text();
      expect(response.status).toBe(200);
      expect(text).not.toContain(secret);
      expect(text).toContain("Do not paste");
      expect(logs.join("\n")).not.toContain(secret);
    } finally {
      console.log = original;
    }
  });
});
