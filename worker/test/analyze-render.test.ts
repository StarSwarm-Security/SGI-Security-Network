import { describe, expect, it } from "vitest";
import { SPECIALISTS, runSwarm } from "../../js/analyzers.js";
import { esc, renderCiscoAnalyze } from "../../js/analyze-render.js";

const MARKER = "username <svg/onload=document.documentElement.dataset.xss=1> password hunter";

const SAMPLE = `Router# show ip interface brief
Interface              IP-Address      OK? Method Status                Protocol
GigabitEthernet0/0     203.0.113.2     YES NVRAM  up                    up
GigabitEthernet0/1     10.10.10.1      YES NVRAM  up                    up
Vlan1                  192.168.1.1     YES NVRAM  up                    up
Router# show running-config | include enable|line vty|password|username
enable password cisco
username admin privilege 15 password 0 admin
line vty 0 4
 login
 transport input telnet
`;

function assertNoExecutableMarkup(html: string) {
  expect(html).not.toMatch(/<(?:svg|img|script|iframe|details|math)\b/i);
}

describe("Cisco Analyze rendering", () => {
  it("encodes the audit marker instead of creating an svg", () => {
    const html = renderCiscoAnalyze(runSwarm(MARKER, { deviceType: "auto" }), SPECIALISTS.length);
    assertNoExecutableMarkup(html);
    expect(html).toContain("&lt;svg/onload=document.documentElement.dataset.xss=1&gt;");
    expect(html).toContain("User &lt;svg/onload=document.documentElement.dataset.xss=1&gt; has a cleartext password");
    expect(html).toContain("<b>1</b> findings · 6 specialists offline");
    expect(html).toContain("<span class=\"sev\">high</span>");
    expect(html).toContain("Security · ");
    expect(html).toContain("<b>Fix:</b> username password is stored weakly.");
  });

  it("encodes dhcp pool names, BPDU tokens, and err-disabled names", () => {
    const dhcp = renderCiscoAnalyze(runSwarm(
      "ip dhcp pool <svg onload=document.documentElement.dataset.xss=1>\n network 10.1.1.0 255.255.255.0\n default-router 10.9.9.9\n",
      { deviceType: "auto" },
    ), SPECIALISTS.length);
    const bpdu = renderCiscoAnalyze(runSwarm(
      "802.1Q BPDU on non-trunk <svg/onload=document.documentElement.dataset.xss=1>",
      { deviceType: "auto" },
    ), SPECIALISTS.length);
    const err = renderCiscoAnalyze(runSwarm(
      "Gi<svg/onload=document.documentElement.dataset.xss=1> is err-disabled",
      { deviceType: "auto" },
    ), SPECIALISTS.length);
    for (const html of [dhcp, bpdu, err]) {
      assertNoExecutableMarkup(html);
      expect(html).toContain("&lt;svg");
    }
    expect(dhcp).toContain("DHCP pool &lt;svg onload=document.documentElement.dataset.xss=1&gt; hands out gateway 10.9.9.9");
    expect(bpdu).toContain("&lt;svg/onload=document.documentElement.dataset.xss=1&gt; received a tagged BPDU");
    expect(err).toContain("Gi&lt;svg/onload=document.documentElement.dataset.xss=1&gt;");
  });

  it("encodes every interpolated finding field", () => {
    const hostile = "<img src=x onerror=\"alert(1)\">";
    const html = renderCiscoAnalyze({
      reports: [{
        name: hostile,
        findings: [{
          severity: `high"><svg onload=1>`,
          title: hostile,
          specialist: "ignored-when-report-name-is-copied",
          confidence: hostile,
          detail: hostile,
          why: "why-not-used-when-detail-is-set",
          message: "message-not-used",
          summary: "summary-not-used",
          fix: hostile,
          remediation: "remediation-not-used-when-fix-is-set",
        }, {
          severity: "medium",
          name: hostile,
          why: hostile,
          remediation: hostile,
        }],
      }],
      summary: { headline: hostile },
    }, SPECIALISTS.length);
    assertNoExecutableMarkup(html);
    expect(html).not.toContain(hostile);
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).toContain("class=\"find high&quot;&gt;&lt;svg onload=1&gt;\"");
    expect(html).toContain("confidence &lt;img");
    expect(html).toContain("<b>Fix:</b> &lt;img");
  });

  it("keeps ordinary device text as readable findings", () => {
    const html = renderCiscoAnalyze(runSwarm(SAMPLE, { deviceType: "auto" }), SPECIALISTS.length);
    expect(html).toContain("<strong>Enable is a cleartext password, not a secret</strong>");
    const plainUser = renderCiscoAnalyze(runSwarm("username ops password 0 localonly\n", { deviceType: "router" }), SPECIALISTS.length);
    expect(plainUser).toContain("<strong>User ops has a cleartext password</strong>");
    expect(plainUser).not.toContain("&lt;");
    expect(html).toContain("VTY still accepts Telnet");
    expect(html).toContain("A default or well-known password is configured");
    expect(html).not.toContain("&lt;");
    expect(html).not.toContain("&amp;");
    assertNoExecutableMarkup(html);
    expect(esc("GigabitEthernet0/1")).toBe("GigabitEthernet0/1");
    expect(esc("a < b & c > d \"e\" 'f'")).toBe("a &lt; b &amp; c &gt; d &quot;e&quot; &#39;f&#39;");
  });
});
