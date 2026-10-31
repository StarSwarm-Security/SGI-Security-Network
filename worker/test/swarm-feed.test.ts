import { beforeEach, describe, expect, it, vi } from "vitest";
import feed from "../../data/agent-threats.json";
import npmMalware from "./fixtures/swarm-feed/github-npm-malware.json";
import pipMalware from "./fixtures/swarm-feed/github-pip-malware.json";
import cwe1427 from "./fixtures/swarm-feed/github-cwe-1427.json";
import mcpSdk from "./fixtures/swarm-feed/github-mcp.json";
import osvQuery from "./fixtures/swarm-feed/osv-query.json";
import atomXml from "./fixtures/swarm-feed/socket-feed.atom?raw";
import { matchAgentIocs } from "../../js/threat-index.js";
import {
  agentItemsFromAlerts,
  encodeSnapshot,
  esc,
  filterAlerts,
  formatStamp,
  loadSwarmFeed,
  refreshPlan,
  renderAlertHtml,
  SNAPSHOT_MAX,
  statusLabel,
} from "../../js/swarm-feed.js";
import worker from "../../edge/sgi-worker-tail.js";
import {
  FEED_SOURCES,
  FRESH_MS,
  GITHUB_SOURCES,
  MAX_ALERTS,
  alertsFromBundled,
  capAlerts,
  dedupeAlerts,
  handleSwarmFeed,
  inferBundledCategory,
  normalizeGithubAdvisory,
  normalizeGithubPayload,
  normalizeOsvVuln,
  normalizeSocketEntry,
  parseAtomEntries,
  queryOsvPackage,
  resetSwarmFeedState,
} from "../../edge/swarm-feed.js";

const NOW = Date.parse("2026-10-30T23:30:00.000Z");
const ORIGIN = "https://sgi.test";

function request(path = "/api/swarm-feed") {
  return new Request(ORIGIN + path);
}

function memoryCache() {
  const store = new Map<string, { body: string; headers: Record<string, string> }>();
  return {
    async match(req: Request) {
      const hit = store.get(req.url);
      if (!hit) return undefined;
      return new Response(hit.body, { status: 200, headers: hit.headers });
    },
    async put(req: Request, res: Response) {
      store.set(req.url, { body: await res.text(), headers: Object.fromEntries(res.headers) });
    },
  };
}

function routeFetch(routes: Record<string, unknown>) {
  return vi.fn(async (url: string) => {
    const key = String(url);
    if (!Object.prototype.hasOwnProperty.call(routes, key)) {
      return new Response("missing", { status: 404 });
    }
    const body = routes[key];
    if (body instanceof Error) throw body;
    if (body && typeof body === "object" && "status" in (body as { status?: number })) {
      const row = body as { status: number; body?: string };
      return new Response(row.body || "", { status: row.status });
    }
    const text = typeof body === "string" ? body : JSON.stringify(body);
    return new Response(text, { status: 200, headers: { "Content-Type": "application/json" } });
  });
}

describe("swarm feed normalize", () => {
  beforeEach(() => resetSwarmFeedState());

  it("keeps GitHub calls at four and skips bulk OSV", () => {
    expect(GITHUB_SOURCES).toHaveLength(4);
    expect(FEED_SOURCES).toHaveLength(5);
    expect(FEED_SOURCES.map((source) => source.url).join(" ")).not.toContain("osv.dev");
    expect(GITHUB_SOURCES.some((source) => source.url.includes("cwes=1427"))).toBe(true);
    expect(GITHUB_SOURCES.some((source) => source.url.includes("type=malware"))).toBe(true);
    expect(GITHUB_SOURCES.some((source) => source.url.includes("@modelcontextprotocol/sdk"))).toBe(true);
  });

  it("normalizes an npm malware advisory and defangs hostile text", () => {
    const alerts = normalizeGithubPayload(npmMalware, "github-malware");
    expect(alerts).toHaveLength(3);
    const first = alerts[0];
    expect(first.id).toBe("GHSA-w4v4-fj9q-cfj5");
    expect(first.category).toBe("malware-pkg");
    expect(first.severity).toBe("critical");
    expect(first.iocs).toEqual(["@pcb-dp/qa-commons"]);
    expect(first.url).toBe("https://github.com/advisories/GHSA-w4v4-fj9q-cfj5");
    expect(first.source).toBe(first.url);
    expect(first.title).not.toMatch(/<script/i);
    expect(first.detail).not.toMatch(/<script/i);
    expect(first.detail).toContain("hxxps://evil[.]example/steal");
    expect(first.detail).not.toMatch(/https:\/\//i);
    const worm = alerts.find((alert) => alert.id === "GHSA-npm0-worm-0002");
    expect(worm?.url).toBe("");
    expect(worm?.source).toBe("");
  });

  it("categorizes CWE-1427 and a prompt-injection keyword without using keyword=", () => {
    const alerts = normalizeGithubPayload(cwe1427, "github-cwe");
    expect(alerts.map((alert) => alert.category)).toEqual(["prompt-injection", "prompt-injection"]);
    expect(alerts[0].severity).toBe("medium");
    expect(alerts[1].severity).toBe("low");
    expect(GITHUB_SOURCES.every((source) => !source.url.includes("keyword="))).toBe(true);
  });

  it("maps MCP advisories and moderate severity", () => {
    const alert = normalizeGithubAdvisory(mcpSdk[0], "github-mcp");
    expect(alert?.category).toBe("mcp-skill");
    expect(alert?.severity).toBe("medium");
    expect(alert?.iocs).toEqual(["@modelcontextprotocol/sdk"]);
  });

  it("parses the Socket atom feed and drops unrelated posts", () => {
    const entries = parseAtomEntries(atomXml);
    expect(entries).toHaveLength(3);
    const kept = entries.map(normalizeSocketEntry).filter(Boolean);
    expect(kept).toHaveLength(2);
    expect(kept[0]?.category).toBe("mcp-skill");
    expect(kept[0]?.severity).toBe("unknown");
    expect(kept[0]?.sourceName).toBe("Socket.dev");
    expect(kept[1]?.category).toBe("campaign");
    expect(kept[1]?.severity).toBe("high");
    expect(entries[2] && normalizeSocketEntry(entries[2])).toBeNull();
  });

  it("infers a category for every bundled incident", () => {
    const expected: Record<string, string> = {
      "hf-rogue-swarm-2026-08-27": "campaign",
      "deadbugz-2026-08-12": "mcp-skill",
      "shai-hulud-2026-08-06": "malware-pkg",
      "anthropic-threat-report-2026-09": "campaign",
      "bioshocking-2026-06-30": "prompt-injection",
      "bankrbot-2026-05-15": "prompt-injection",
      "sandworm-2026-02-20": "malware-pkg",
      "openclaw-skills-2026-02-23": "mcp-skill",
      "fbi-ai-impersonation-2026-09-17": "campaign",
      "gtg-1002-2025-11-13": "campaign",
    };
    expect(feed.entries.map((entry) => entry.id)).toEqual(Object.keys(expected));
    for (const entry of feed.entries) {
      expect(inferBundledCategory(entry)).toBe(expected[entry.id]);
    }
    const alerts = alertsFromBundled(feed);
    expect(alerts).toHaveLength(10);
    expect(alerts.every((alert) => alert.fromBundled)).toBe(true);
  });

  it("dedupes by GHSA, CVE, and package name, and keeps bundled rows under the cap", () => {
    const duped = dedupeAlerts(normalizeGithubPayload(npmMalware, "github-malware"));
    expect(duped).toHaveLength(2);
    expect(duped.find((alert) => alert.id === "GHSA-w4v4-fj9q-cfj5")?.severity).toBe("critical");

    const shared = dedupeAlerts([
      {
        id: "GHSA-aaaa-bbbb-ccc1",
        title: "First CVE-2026-10001",
        category: "malware-pkg" as const,
        severity: "low" as const,
        published: "2026-10-01T00:00:00.000Z",
        source: "https://example.com/a",
        sourceName: "GitHub Advisory DB",
        url: "https://example.com/a",
        iocs: ["shared-pkg"],
        detail: "CVE-2026-10001",
        check: "check",
      },
      {
        id: "CVE-2026-10001",
        title: "Second",
        category: "prompt-injection" as const,
        severity: "high" as const,
        published: "2026-10-02T00:00:00.000Z",
        source: "https://example.com/b",
        sourceName: "GitHub Advisory DB",
        url: "https://example.com/b",
        iocs: ["shared-pkg"],
        detail: "same package",
        check: "check",
      },
    ]);
    expect(shared).toHaveLength(1);
    expect(shared[0].severity).toBe("high");
    expect(shared[0].category).toBe("prompt-injection");

    const live = Array.from({ length: 120 }, (_, index) => ({
      id: `GHSA-${String(index).padStart(4, "0")}-0000-0000`,
      title: `Malware ${index}`,
      category: "malware-pkg" as const,
      severity: "high" as const,
      published: new Date(Date.parse("2026-10-30T00:00:00Z") - index * 1000).toISOString(),
      source: `https://example.com/a/${index}`,
      sourceName: "GitHub Advisory DB",
      url: `https://example.com/a/${index}`,
      iocs: [`pkg-${index}`],
      detail: "d",
      check: "c",
      fromBundled: false,
    }));
    const bundled = {
      id: "old-bundle",
      title: "Old bundled note",
      category: "campaign" as const,
      severity: "unknown" as const,
      published: "2020-01-01T00:00:00.000Z",
      source: "",
      sourceName: "Bundled agent incidents",
      url: "",
      iocs: [] as string[],
      detail: "d",
      check: "c",
      fromBundled: true,
    };
    const capped = capAlerts([...live, bundled]);
    expect(MAX_ALERTS).toBe(100);
    expect(capped).toHaveLength(100);
    expect(capped.some((alert) => alert.id === "old-bundle")).toBe(true);
  });

  it("keeps only OSV malware rows", () => {
    const alerts = (osvQuery.vulns).map(normalizeOsvVuln).filter(Boolean);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.id).toBe("MAL-2026-4242");
    expect(alerts[0]?.category).toBe("malware-pkg");
    expect(alerts[0]?.iocs).toEqual(["hostile-pkg"]);
    expect(alerts[0]?.title).not.toMatch(/<script/i);
    expect(alerts[0]?.detail).toContain("hxxps://evil[.]example/drop");
    expect(alerts[0]?.url).toMatch(/^https:\/\/osv\.dev\/vulnerability\/MAL-2026-4242$/);
  });
});

describe("swarm feed handler", () => {
  beforeEach(() => resetSwarmFeedState());

  function liveRoutes(overrides: Record<string, unknown> = {}) {
    return {
      [GITHUB_SOURCES[0].url]: npmMalware,
      [GITHUB_SOURCES[1].url]: pipMalware,
      [GITHUB_SOURCES[2].url]: cwe1427,
      [GITHUB_SOURCES[3].url]: mcpSdk,
      [FEED_SOURCES[4].url]: atomXml,
      ...overrides,
    };
  }

  it("returns other sources when one upstream fails", async () => {
    const fetchImpl = routeFetch(liveRoutes({
      [GITHUB_SOURCES[1].url]: new Error("down"),
      [GITHUB_SOURCES[3].url]: { status: 500, body: "nope" },
    }));
    const res = await handleSwarmFeed(request(), {
      fetchImpl,
      now: () => NOW,
      cache: null,
      bundled: feed,
      state: { memo: null },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=300, stale-while-revalidate=900");
    expect(res.headers.get("Content-Type")).toContain("application/json");
    const body = await res.json() as {
      status: string;
      alerts: { id: string; iocs: string[] }[];
      sources: { name: string; ok: boolean; count: number; error?: string }[];
    };
    expect(body.status).toBe("live");
    const byName = Object.fromEntries(body.sources.map((source) => [source.name, source]));
    expect(byName["GitHub Advisory DB npm malware"]).toMatchObject({ ok: true, count: 3 });
    expect(byName["GitHub Advisory DB pip malware"]).toMatchObject({ ok: false, error: "down" });
    expect(byName["GitHub Advisory DB prompt injection"]).toMatchObject({ ok: true, count: 2 });
    expect(byName["GitHub Advisory DB MCP SDK"]).toMatchObject({ ok: false });
    expect(byName["Socket.dev blog"]).toMatchObject({ ok: true, count: 2 });
    expect(byName["Bundled agent incidents"]).toMatchObject({ ok: true, count: 10 });
    expect(body.alerts.some((alert) => alert.id === "GHSA-w4v4-fj9q-cfj5")).toBe(true);
    expect(body.alerts.some((alert) => alert.id === "GHSA-pip0-mal-0001")).toBe(false);
    expect(body.alerts.some((alert) => alert.id === "shai-hulud-2026-08-06")).toBe(true);
    expect(JSON.stringify(body).length).toBeLessThanOrEqual(150 * 1024);
    expect(fetchImpl).toHaveBeenCalledTimes(5);
  });

  it("falls back to the bundled set when every upstream call fails and nothing is cached", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("offline");
    });
    const res = await handleSwarmFeed(request(), {
      fetchImpl,
      now: () => NOW,
      cache: null,
      bundled: feed,
      state: { memo: null },
    });
    const body = await res.json() as { status: string; alerts: { id: string }[] };
    expect(res.status).toBe(200);
    expect(body.status).toBe("bundled");
    expect(body.alerts).toHaveLength(10);
    expect(body.alerts.map((alert) => alert.id)).toContain("shai-hulud-2026-08-06");
  });

  it("serves a fresh cache hit without another fetch and a stale copy when refresh fails", async () => {
    const cache = memoryCache();
    const state = { memo: null as { envelope: { fetchedAt: string; alerts: { id: string }[]; status: string } } | null };
    const fetchImpl = routeFetch(liveRoutes());
    const first = await handleSwarmFeed(request(), {
      fetchImpl, now: () => NOW, cache, bundled: feed, state,
    });
    const live = await first.json() as { status: string; alerts: { id: string }[] };
    expect(live.status).toBe("live");
    const calls = fetchImpl.mock.calls.length;

    const fetchAgain = vi.fn(async () => { throw new Error("should not fetch"); });
    const again = await handleSwarmFeed(request(), {
      fetchImpl: fetchAgain,
      now: () => NOW + 1000,
      cache,
      bundled: feed,
      state: { memo: null },
    });
    const cached = await again.json() as { status: string; alerts: { id: string }[] };
    expect(cached.status).toBe("cached");
    expect(cached.alerts.map((alert) => alert.id)).toEqual(live.alerts.map((alert) => alert.id));
    expect(fetchImpl.mock.calls.length).toBe(calls);
    expect(fetchAgain).not.toHaveBeenCalled();

    const staleState = {
      memo: {
        envelope: {
          ...live,
          fetchedAt: new Date(NOW - (FRESH_MS + 60_000)).toISOString(),
          status: "live",
        },
      },
    };
    const staleRes = await handleSwarmFeed(request(), {
      fetchImpl: vi.fn(async () => { throw new Error("offline"); }),
      now: () => NOW,
      cache: null,
      bundled: feed,
      state: staleState,
    });
    const stale = await staleRes.json() as { status: string; alerts: { id: string }[] };
    expect(stale.status).toBe("stale");
    expect(stale.alerts.some((alert) => alert.id === "GHSA-w4v4-fj9q-cfj5")).toBe(true);
  });

  it("enriches one package from OSV without treating it as a bulk source", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).includes("api.osv.dev")) {
        return new Response(JSON.stringify(osvQuery), { status: 200 });
      }
      throw new Error("offline");
    });
    const res = await handleSwarmFeed(request("/api/swarm-feed?package=hostile-pkg"), {
      fetchImpl,
      now: () => NOW,
      cache: null,
      bundled: feed,
      state: { memo: null },
    });
    const body = await res.json() as { status: string; alerts: { id: string }[]; sources: { name: string; ok: boolean; count: number }[] };
    expect(body.status).toBe("bundled");
    expect(body.alerts.some((alert) => alert.id === "MAL-2026-4242")).toBe(true);
    expect(body.sources.find((source) => source.name === "OSV.dev")).toMatchObject({ ok: true, count: 1 });
    const direct = await queryOsvPackage("hostile-pkg", fetchImpl);
    expect(direct.map((alert) => alert.id)).toEqual(["MAL-2026-4242"]);
    expect(await queryOsvPackage("not a package name", fetchImpl)).toEqual([]);
  });
});

describe("swarm feed client", () => {
  it("labels status, stamps the countdown, and pauses while hidden", () => {
    expect(statusLabel("live")).toBe("Live");
    expect(statusLabel("cached")).toBe("Cached");
    expect(statusLabel("stale")).toBe("Cached");
    expect(statusLabel("bundled")).toBe("Offline: bundled feed");
    expect(formatStamp("2026-10-30T23:30:00.000Z", NOW + 5000, NOW)).toMatch(/^Last updated \d{2}:\d{2} · next refresh in 5s$/);
    expect(refreshPlan(true, true, 10, 0)).toBe("pause");
    expect(refreshPlan(false, false, 10, 0)).toBe("pause");
    expect(refreshPlan(false, true, 10, 10)).toBe("now");
    expect(refreshPlan(false, true, 10, 20)).toBe("wait");
  });

  it("escapes hostile markup and only links https URLs", () => {
    const html = renderAlertHtml({
      id: "GHSA-w4v4-fj9q-cfj5",
      title: '<img src=x onerror="alert(1)">',
      category: "malware-pkg",
      severity: "critical",
      published: "2026-10-30T22:10:00Z",
      source: "javascript:alert(1)",
      sourceName: "GitHub Advisory DB",
      url: "javascript:alert(1)",
      iocs: ["@pcb-dp/qa-commons"],
      detail: "https://evil.example/steal",
      check: "Do not install",
    }, NOW);
    expect(html).toContain("&lt;img");
    expect(html).not.toMatch(/<img/i);
    expect(html).not.toMatch(/href="javascript:/);
    expect(html).not.toContain("<a ");
    expect(esc(`<script>alert(1)</script>`)).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
    const linked = renderAlertHtml({
      id: "ok",
      title: "Plain",
      category: "campaign",
      severity: "unknown",
      published: "2026-10-30T00:00:00Z",
      source: "https://example.com/advisory",
      sourceName: "Example",
      url: "https://example.com/advisory",
      iocs: [],
      detail: "",
      check: "",
    }, NOW);
    expect(linked).toContain('href="https://example.com/advisory"');
    expect(linked).toContain('rel="noopener"');
    expect(linked).toContain('target="_blank"');
  });

  it("filters by category, severity, and the threat-index query", () => {
    const alerts = [
      { id: "1", title: "Malware in @pcb-dp/qa-commons", category: "malware-pkg", severity: "critical", detail: "", check: "", sourceName: "", iocs: ["@pcb-dp/qa-commons"] },
      { id: "2", title: "Prompt injection in gateway", category: "prompt-injection", severity: "medium", detail: "", check: "", sourceName: "", iocs: [] },
      { id: "3", title: "MCP SDK issue", category: "mcp-skill", severity: "medium", detail: "", check: "", sourceName: "", iocs: [] },
    ];
    expect(filterAlerts(alerts, { category: "malware-pkg" }).map((alert) => alert.id)).toEqual(["1"]);
    expect(filterAlerts(alerts, { severity: "medium" })).toHaveLength(2);
    expect(filterAlerts(alerts, { q: "qa-commons" })).toHaveLength(1);
    expect(filterAlerts(alerts, { category: "campaign", q: "qa" })).toEqual([]);
  });

  it("feeds live malware package names into matchAgentIocs", () => {
    const alerts = normalizeGithubPayload(npmMalware, "github-malware");
    const items = agentItemsFromAlerts(alerts);
    const commons = matchAgentIocs(items, "@pcb-dp/qa-commons");
    expect(commons.length).toBeGreaterThan(0);
    expect(commons.every((item) => item.key === "GHSA-w4v4-fj9q-cfj5")).toBe(true);
    expect(matchAgentIocs(items, "left-pad-worm")).toHaveLength(1);
    expect(matchAgentIocs(items, "nope-pkg")).toEqual([]);
    expect(agentItemsFromAlerts(normalizeGithubPayload(cwe1427, "github-cwe"))).toHaveLength(0);
  });

  it("tries the API, then GitHub, then the bundled file", async () => {
    const liveAlert = {
      id: "from-api",
      title: "From the worker",
      category: "malware-pkg",
      severity: "high",
      published: "2026-10-30T00:00:00.000Z",
      source: "https://example.com/api",
      sourceName: "GitHub Advisory DB",
      url: "https://example.com/api",
      iocs: ["api-pkg"],
      detail: "d",
      check: "c",
    };
    let githubCalls = 0;
    const apiFirst = await loadSwarmFeed({
      now: () => NOW,
      bundled: feed,
      fetchImpl: async (url: string) => {
        if (String(url).includes("github")) githubCalls += 1;
        return new Response(JSON.stringify({
          updated: "2026-10-30",
          fetchedAt: new Date(NOW).toISOString(),
          status: "live",
          sources: [],
          alerts: [liveAlert],
        }), { status: 200 });
      },
    });
    expect(apiFirst.alerts[0].id).toBe("from-api");
    expect(githubCalls).toBe(0);

    const githubDirect = await loadSwarmFeed({
      now: () => NOW,
      bundled: feed,
      fetchImpl: async (url: string) => {
        const key = String(url);
        if (key === "/api/swarm-feed") return new Response("down", { status: 503 });
        if (key === GITHUB_SOURCES[0].url) return new Response(JSON.stringify(npmMalware), { status: 200 });
        if (key.includes("api.github.com")) return new Response("[]", { status: 200 });
        throw new Error("unexpected " + key);
      },
    });
    expect(githubDirect.status).toBe("live");
    expect(githubDirect.alerts.some((alert) => alert.iocs.includes("@pcb-dp/qa-commons"))).toBe(true);
    expect(githubDirect.alerts.some((alert) => alert.id === "shai-hulud-2026-08-06")).toBe(true);

    const offline = await loadSwarmFeed({
      now: () => NOW,
      bundled: feed,
      fetchImpl: async () => { throw new Error("offline"); },
    });
    expect(offline.status).toBe("bundled");
    expect(offline.alerts).toHaveLength(10);
  });

  it("trims the last-good snapshot to 200 KB", () => {
    const alerts = Array.from({ length: 40 }, (_, index) => ({
      id: `id-${index}`,
      title: "t".repeat(4000),
      detail: "d".repeat(8000),
      check: "c",
      category: "campaign",
      severity: "unknown",
      iocs: [] as string[],
    }));
    const raw = encodeSnapshot({ status: "live", alerts }, SNAPSHOT_MAX);
    expect(raw.length).toBeLessThanOrEqual(SNAPSHOT_MAX);
    expect(raw.length).toBeGreaterThan(0);
    const parsed = JSON.parse(raw) as { alerts: unknown[] };
    expect(parsed.alerts.length).toBeGreaterThan(0);
    expect(parsed.alerts.length).toBeLessThan(40);
  });
});

describe("sgi worker tail", () => {
  beforeEach(() => resetSwarmFeedState());

  it("routes GET /api/swarm-feed and leaves static responses unchanged", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    try {
      if (typeof caches !== "undefined" && caches.default) {
        await caches.default.delete(new Request(ORIGIN + "/api/swarm-feed"));
      }
      const feedRes = await worker.fetch(request("/api/swarm-feed"));
      expect(feedRes.status).toBe(200);
      expect(feedRes.headers.get("Content-Type")).toContain("application/json");
      const body = await feedRes.json() as { status: string; alerts: { id: string }[] };
      expect(body.status === "bundled" || body.status === "cached" || body.status === "stale").toBe(true);
      expect(body.alerts.map((alert) => alert.id)).toContain("deadbugz-2026-08-12");

      const head = await worker.fetch(new Request(ORIGIN + "/api/swarm-feed", { method: "HEAD" }));
      expect(head.status).toBe(404);
      expect(head.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
      expect(await head.text()).toBe("Not found");

      const missing = await worker.fetch(request("/no-such-file.txt"));
      expect(missing.status).toBe(404);
      expect(await missing.text()).toBe("Not found");
      expect(missing.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
      expect(missing.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(missing.headers.get("X-Frame-Options")).toBe("DENY");

      const pretty = await worker.fetch(request("/privacy.html"));
      expect(pretty.status).toBe(308);
      expect(pretty.headers.get("Location")).toBe(ORIGIN + "/privacy");

      const denied = await worker.fetch(new Request(ORIGIN + "/index.html", { method: "POST" }));
      expect(denied.status).toBe(405);
      expect(await denied.text()).toBe("Method not allowed");
      expect(denied.headers.get("Allow")).toBe("GET, HEAD");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
