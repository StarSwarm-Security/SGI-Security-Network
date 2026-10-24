export const C = { blue:'#00c8ff', cyan:'#00ffe7', green:'#39ff6a', orange:'#ff8c00', purple:'#bb66ff', yellow:'#ffe600', red:'#ff3b5c', pink:'#ff5fd2' };

export const SRC = {
  imperva:  ['Imperva/Thales 2026 Bad Bot Report', 'https://www.imperva.com/blog/bad-bot-report-2026-bots-agentic-age/'],
  anth:     ['Anthropic: AI-orchestrated espionage (Nov 2025)', 'https://www.anthropic.com/news/disrupting-AI-espionage'],
  fbi:      ['FBI PSA: AI voice impersonation of officials (May 2025)', 'https://www.ic3.gov/PSA/2025/PSA250515'],
  fbi2:     ['FBI PSA update (Dec 2025)', 'https://www.fbi.gov/investigate/cyber/alerts/2025/senior-us-officials-continue-to-be-impersonated-in-malicious-messaging-campaign'],
  gtig:     ['Google GTIG AI Threat Tracker (Nov 2025)', 'https://cloud.google.com/blog/topics/threat-intelligence/threat-actor-usage-of-ai-tools'],
  grey:     ['GreyNoise: VPN credential campaign (Dec 2025)', 'https://www.greynoise.io/blog/credential-based-campaign-cisco-palo-alto-networks-vpn-gateways'],
  inv:      ['Invariant Labs: MCP tool poisoning (2025)', 'https://invariantlabs.ai/blog/mcp-security-notification-tool-poisoning-attacks'],
  owasp:    ['OWASP Top 10 for Agentic Applications 2026', 'https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/'],
  cisa:     ['CISA: Shai-Hulud npm worm alert (Sep 2025)', 'https://www.cisa.gov/news-events/alerts/2025/09/23/widespread-supply-chain-compromise-impacting-npm-ecosystem'],
  nx:       ['Nx s1ngularity postmortem (Aug 2025)', 'https://nx.dev/blog/s1ngularity-postmortem'],
  poison:   ['Anthropic/UK AISI: 250 docs can poison LLMs (Oct 2025)', 'https://www.anthropic.com/research/small-samples-poison'],
  newstack: ['The New Stack: rogue agent fleet (Oct 2026)', 'https://thenewstack.io/rogue-ai-agent-fleet-tencent/'],
  mcpx:     ['arXiv 2608.00150: Exposed by Design (MCP)', 'https://arxiv.org/html/2608.00150'],
  cisaai:   ['CISA + partners: secure adoption of agentic AI', 'https://www.cisa.gov/news-events/news/cisa-us-and-international-partners-release-guide-secure-adoption-agentic-ai'],
};

// rows (wide): 0 internet, 1 edge, 2 core, 3 access, 4 endpoints, 5 hive
// prow (phone): 0..4 same, 5..7 hive
export const NODES = [
  { id:'inet', kind:'net', glyph:'WAN', color:C.orange, row:0, x:560, prow:0, px:195, label:'Internet', sub:'untrusted · 0.0.0.0/0',
    p:{ type:'Zone · Untrusted', what:'Everything outside your edge. Bots now make up most web traffic: Imperva/Thales counted 53% bots in 2025, with bad bots alone at 40%.',
      ccna:'Default route (0.0.0.0/0) points here. Treat every inbound flow as hostile until an ACL or firewall policy says otherwise.',
      threats:['Credential-stuffing and scraping swarms','AI-run recon and intrusion (GTG-1002, ~80-90% done by AI per Anthropic)','Phishing and deepfake voice lures'],
      defense:'Edge ACLs, uRPF, firewall/IPS, rate limits, and a Sentinel watching NetFlow at the edge.',
      src:['imperva','anth'] } },
  { id:'cloud', kind:'net', glyph:'CLD', color:C.orange, row:0, x:840, prow:0, px:320, pl:'Cloud + LLM', label:'Cloud + LLM APIs', sub:'SaaS · registries · MCP',
    p:{ type:'Zone · Cloud services', what:'SaaS, package registries (npm/PyPI), model hubs, LLM APIs and remote MCP servers your agents call.',
      ccna:'Reached through NAT and the firewall. Know which FQDNs and ports each VLAN is allowed to reach (egress allowlist).',
      threats:['Supply-chain worms: Shai-Hulud compromised 500+ npm packages (CISA)','s1ngularity Nx packages abused local AI CLIs to hunt secrets','Data poisoning: ~250 docs could backdoor models up to 13B params in a study','Exposed MCP servers, most tested without OAuth'],
      defense:'Pin dependencies, use trusted publishing, rotate tokens, egress allowlist per VLAN, verify MCP servers before agents can call them.',
      src:['cisa','nx','poison','mcpx'] } },
  { id:'siem', kind:'net', glyph:'LOG', color:C.purple, row:2, x:1220, prow:0, px:70, pl:'SIEM', label:'SIEM / Collector', sub:'syslog · SNMPv3 · NetFlow',
    p:{ type:'Security service · Visibility', what:'Collects syslog, SNMP traps and NetFlow/IPFIX from every device. The swarm reads from here, it never writes config from here.',
      ccna:'Syslog severity levels 0-7, SNMPv3 (authPriv), NTP so timestamps line up, NetFlow exporters and monitors.',
      threats:['Attackers clearing logs','Alert floods that hide the real bot'],
      defense:'Send logs off-box, sync NTP, use SNMPv3 not v2c, alert on gaps in log flow.',
      cfg:'ntp server 10.0.99.5\nservice timestamps log datetime msec\nlogging host 10.0.99.10\nlogging trap informational\nsnmp-server group HIVE v3 priv\nsnmp-server host 10.0.99.10 version 3 priv sentinel\nsnmp-server enable traps port-security',
      src:[] } },
  { id:'edge', kind:'net', glyph:'R1', color:C.blue, row:1, x:420, prow:1, px:70, pl:'Edge Router', label:'Edge Router', sub:'ACL · NAT · uRPF',
    p:{ type:'Network device · Layer 3', what:'First hop from the Internet. Filters spoofed and junk traffic before it reaches the firewall.',
      ccna:'Extended ACLs (applied inbound, closest to the source), PAT/NAT overload, unicast RPF, static default route.',
      threats:['Spoofed source floods','Bot swarms scanning for open services'],
      defense:'Deny RFC1918 sources inbound, permit only published services, log the deny.',
      cfg:'ip access-list extended EDGE-IN\n deny   ip 10.0.0.0 0.255.255.255 any\n deny   ip 192.168.0.0 0.0.255.255 any\n permit tcp any host 203.0.113.10 eq 443\n deny   ip any any log\ninterface Gi0/0\n ip access-group EDGE-IN in\n ip verify unicast source reachable-via rx',
      src:[] } },
  { id:'fw', kind:'net', glyph:'FW', color:C.purple, row:1, x:700, prow:1, px:195, pl:'Firewall/IPS', label:'Firewall / IPS', sub:'zones · IPS · egress',
    p:{ type:'Security service · Next-gen firewall', what:'Stateful firewall with intrusion prevention. Also controls what goes OUT, which is how you catch malware phoning an LLM API.',
      ccna:'Stateful inspection vs ACLs, security zones (inside/outside/DMZ), IPS signatures, egress filtering.',
      threats:['AI-mutating malware: GTIG saw PROMPTFLUX ask Gemini to rewrite its own code (experimental) and PROMPTSTEAL query an LLM for commands','C2 beacons from phished laptops'],
      defense:'Egress allowlist: only approved hosts may reach LLM APIs. Alert when a server or script talks to an AI API it never used before.',
      src:['gtig'] } },
  { id:'vpn', kind:'net', glyph:'VPN', color:C.blue, row:1, x:980, prow:1, px:320, label:'VPN Gateway', sub:'IPsec/SSL · MFA',
    p:{ type:'Network device · Remote access', what:'Remote-access VPN for staff. A favorite target for automated password spraying.',
      ccna:'IPsec vs SSL VPN, site-to-site vs remote access, AAA with RADIUS/TACACS+, MFA.',
      threats:['GreyNoise saw ~1.7M automated login sessions against GlobalProtect portals in 16 hours (Dec 2025), then a pivot to Cisco SSL VPN'],
      defense:'MFA everywhere, lockout and login rate limits, alert on failure spikes per ASN, block sources only after human review.',
      cfg:'aaa new-model\naaa authentication login VPN group radius local\naaa local authentication attempts max-fail 5\nlogin block-for 120 attempts 5 within 60\nlogin on-failure log',
      src:['grey'] } },
  { id:'wlc', kind:'net', glyph:'WLC', color:C.cyan, row:2, x:280, prow:2, px:70, pl:'Wireless Ctrl', label:'Wireless Ctrl', sub:'WLC · rogue detect',
    p:{ type:'Network device · Wireless', what:'Manages APs and scans the air for rogue and evil-twin access points.',
      ccna:'Lightweight APs + WLC (CAPWAP), WPA2/WPA3-Enterprise, 802.11w protected management frames, rogue AP classification.',
      threats:['Evil-twin APs that copy your SSID to steal logins'],
      defense:'WPA3-Enterprise with 802.1X, PMF required, rogue detection alerts. Containment over the air only where legal and on your own property.',
      cfg:'! illustrative WLAN policy\nWLAN CORP  SSID: CORP\n security: WPA3-Enterprise (802.1X)\n PMF (802.11w): required\n rogue detection: alarm on SSID match\n rogue containment: manual + approval',
      src:[] } },
  { id:'core', kind:'net', glyph:'L3', color:C.blue, row:2, x:700, prow:2, px:195, pl:'Core L3', label:'Core L3 Switch', sub:'SVIs · OSPF · NetFlow',
    p:{ type:'Network device · Core', what:'Routes between VLANs and exports flow records so the swarm can spot lateral movement.',
      ccna:'Inter-VLAN routing with SVIs, OSPF, VLAN ACLs between segments, NetFlow (flow exporter / monitor).',
      threats:['Lateral movement from a phished laptop to servers','ARP spoofing of the default gateway'],
      defense:'Segment by VLAN, filter between VLANs, watch NetFlow for new east-west talkers.',
      cfg:'flow exporter SIEM\n destination 10.0.99.10\n transport udp 2055\nflow monitor HIVE\n exporter SIEM\n record netflow ipv4 original-input\ninterface Vlan30\n ip flow monitor HIVE input\n ip access-group AGENT-EGRESS in',
      src:[] } },
  { id:'aaa', kind:'net', glyph:'AAA', color:C.purple, row:2, x:980, prow:2, px:320, pl:'AAA/RADIUS', label:'AAA / RADIUS', sub:'802.1X · NAC · CoA',
    p:{ type:'Security service · Identity', what:'Decides who and what gets on the network, and can move a device into a quarantine VLAN with Change of Authorization.',
      ccna:'AAA (authentication, authorization, accounting), RADIUS vs TACACS+, 802.1X supplicant / authenticator / server.',
      threats:['Stolen credentials','Unknown devices plugging in'],
      defense:'802.1X on every access port, MAB only for known devices, CoA to quarantine after approval.',
      cfg:'aaa new-model\naaa authentication dot1x default group radius\naaa authorization network default group radius\ndot1x system-auth-control\nradius server NAC\n address ipv4 10.0.99.20 auth-port 1812 acct-port 1813\naaa server radius dynamic-author\n client 10.0.99.20',
      src:[] } },
  { id:'ap', kind:'net', glyph:'AP', color:C.cyan, row:3, x:280, prow:3, px:70, pl:'Access Point', label:'Access Point', sub:'WPA3 · PMF',
    p:{ type:'Network device · Wireless', what:'Your legit AP. The rogue bot sim plants a fake one nearby.',
      ccna:'802.11 standards, SSID vs BSSID, channels, WPA3, controller-based APs.',
      threats:['Rogue / evil-twin AP','Deauth attacks to push clients to the fake AP'],
      defense:'PMF blocks forged deauths, 802.1X with server cert validation stops clients trusting the fake AP.',
      src:[] } },
  { id:'swa', kind:'net', glyph:'SW', color:C.blue, row:3, x:560, prow:3, px:195, pl:'Switch A', label:'Access Switch A', sub:'DAI · snooping · PSec',
    p:{ type:'Network device · Layer 2 access', what:'Where user laptops plug in. Layer 2 is where ARP spoofing and rogue DHCP live, so this switch is a key sensor.',
      ccna:'Port security, DHCP snooping (trusted vs untrusted ports), Dynamic ARP Inspection, BPDU guard, 802.1X on access ports.',
      threats:['ARP spoofing / man-in-the-middle','Rogue DHCP server','MAC flooding'],
      defense:'DAI drops ARP replies that do not match the DHCP snooping binding table. Port security limits MACs per port.',
      cfg:'ip dhcp snooping\nip dhcp snooping vlan 10,20\nip arp inspection vlan 10,20\ninterface Gi1/0/5\n switchport mode access\n switchport access vlan 10\n switchport port-security maximum 2\n switchport port-security violation restrict\n spanning-tree bpduguard enable\n authentication port-control auto\n dot1x pae authenticator\ninterface Gi1/0/48\n ip dhcp snooping trust\n ip arp inspection trust',
      src:[] } },
  { id:'swb', kind:'net', glyph:'SW', color:C.blue, row:3, x:840, prow:3, px:320, pl:'Switch B', label:'Access Switch B', sub:'VLAN 30/40 · ACL',
    p:{ type:'Network device · Layer 2 access', what:'Hosts the AI agent VLAN and the server VLAN, kept apart from users.',
      ccna:'VLANs, trunks (802.1Q), native VLAN hardening, storm control, VLAN access maps.',
      threats:['A hijacked AI agent trying to reach servers it should not touch'],
      defense:'Separate VLAN for agents, ACL so agents can only reach the services they need.',
      cfg:'vlan 30\n name AI-AGENTS\nvlan 40\n name SERVERS\nvlan 999\n name QUARANTINE\ninterface Gi1/0/1\n switchport trunk native vlan 998\n switchport trunk allowed vlan 30,40,999\n storm-control broadcast level 1.00',
      src:[] } },
  { id:'wifi', kind:'net', glyph:'W20', color:C.green, row:4, x:180, prow:4, px:49, pl:'Wi-Fi', label:'Wi-Fi Clients', sub:'VLAN 20',
    p:{ type:'Endpoints · VLAN 20', what:'Phones and laptops on wireless.', ccna:'VLAN per SSID, client isolation, DHCP scopes.',
      threats:['Connecting to an evil twin','Deepfake voice / SMS lures on mobile (FBI warned of AI voice messages impersonating officials)'],
      defense:'802.1X with cert checks, MDM, verify callers through a known number.', src:['fbi','fbi2'] } },
  { id:'lap', kind:'net', glyph:'V10', color:C.green, row:4, x:420, prow:4, px:146, pl:'Laptops', label:'User Laptops', sub:'VLAN 10',
    p:{ type:'Endpoints · VLAN 10', what:'Staff laptops. The usual landing spot for AI-written phishing.',
      ccna:'Access VLAN, DHCP, default gateway, host firewall.',
      threats:['AI-generated phishing and deepfake voice pretexts','Infostealers that grab session tokens'],
      defense:'Phishing-resistant MFA, EDR, DNS filtering, quarantine VLAN on detection (after approval).', src:['fbi'] } },
  { id:'agenthost', kind:'net', glyph:'AI', color:C.pink, row:4, x:700, prow:4, px:243, pl:'AI Agent', label:'AI Agent Host', sub:'VLAN 30 · MCP tools',
    p:{ type:'Endpoints · VLAN 30 · AI agents', what:'Where your own AI agents and MCP tools run. They read untrusted content, which makes them a target.',
      ccna:'Its own VLAN, egress ACL, least privilege. Treat agent identities like service accounts in AAA.',
      threats:['Prompt injection and goal hijack (OWASP ASI01)','MCP tool poisoning: hidden instructions in tool descriptions (Invariant Labs)','Over-privileged tokens (ASI03)'],
      defense:'Least-privilege tokens, tool allowlists, human approval for risky tool calls, egress allowlist, log every tool call.',
      src:['owasp','inv','cisaai'] } },
  { id:'srv', kind:'net', glyph:'V40', color:C.green, row:4, x:980, prow:4, px:341, pl:'Servers', label:'Servers', sub:'VLAN 40',
    p:{ type:'Endpoints · VLAN 40', what:'Apps and data. Crown jewels.', ccna:'Server VLAN, ACLs, DMZ vs inside, patching.',
      threats:['LLM-assisted malware calling AI APIs at runtime (GTIG)','Poisoned dependencies (Shai-Hulud)'],
      defense:'Egress allowlist, dependency pinning, credential rotation.', src:['gtig','cisa'] } },
  // ---- Defender swarm ----
  { id:'sentinel', kind:'agent', glyph:'SEN', color:C.yellow, row:5, x:160, prow:5, px:49, label:'Sentinel', sub:'detect',
    p:{ type:'Defender agent · Detect', what:'Watches telemetry 24/7 and raises the first alert.',
      watches:'NetFlow/IPFIX, syslog, SNMP traps, IPS alerts, DNS logs, WLC rogue reports, DAI and DHCP snooping drop counters, VPN/AAA failures, AI agent tool-call logs.',
      ccna:'NetFlow, syslog levels, SNMPv3 traps, show ip arp inspection statistics, show port-security.',
      counters:'All threats. First to see phishing beacons, ARP spoofing, VPN sprays, rogue APs, prompt-injected agents.',
      guard:'Read-only. Can alert and tag, cannot change config.' } },
  { id:'tracker', kind:'agent', glyph:'TRK', color:C.yellow, row:5, x:340, prow:5, px:146, label:'Tracker', sub:'attribute',
    p:{ type:'Defender agent · Attribute', what:'Figures out what the bot is, where it sits and whether it is part of a bigger swarm.',
      watches:'IP/ASN, user agent, TLS/TCP fingerprints, MAC↔IP↔port bindings, CAM and ARP tables, Web Bot Auth signatures for good bots.',
      ccna:'show mac address-table, show ip dhcp snooping binding, show ip arp, traceroute, CDP/LLDP neighbors.',
      counters:'Credential stuffing (groups sources by ASN), ARP spoofing (finds the port), rogue AP (finds the wired port if any).',
      guard:'Read-only. Never probes systems you do not own.' } },
  { id:'decoy', kind:'agent', glyph:'DCY', color:C.yellow, row:5, x:520, prow:5, px:243, label:'Decoy', sub:'honeypot',
    p:{ type:'Defender agent · Deception', what:'Plants honey credentials, honeytoken URLs, canary instructions and a honeypot VLAN. Anything that touches them is a bot.',
      watches:'Logins with honey accounts, hits on canary URLs, agents that obey hidden canary text.',
      ccna:'Unused ports in a parking VLAN, ACL logging on honeypot hosts.',
      counters:'Credential stuffing, scraping swarms, rogue AI agents following hidden instructions.',
      guard:'Detect and log only. Never sends harmful instructions or attacks back.' } },
  { id:'queen', kind:'agent', glyph:'Q', color:C.yellow, row:5, x:700, prow:6, px:195, label:'Queen', sub:'coordinator', big:true,
    p:{ type:'Defender agent · Coordinator', what:'Runs the hive. Opens an incident, assigns agents, dedupes alerts and follows the playbook.',
      watches:'Reports from every agent, incident state, approval queue.',
      ccna:'Change management, playbooks, the order of operations: detect → contain → eradicate → recover.',
      counters:'All. Keeps one bot from triggering five agents doing the same thing.',
      guard:'No direct write access to devices. Every block goes through Auditor and a human.' } },
  { id:'quar', kind:'agent', glyph:'QTN', color:C.yellow, row:5, x:880, prow:5, px:341, label:'Quarantine', sub:'contain',
    p:{ type:'Defender agent · Contain', what:'Proposes the smallest action that stops the bot, then applies it once a human approves.',
      watches:'Incidents assigned by Queen.',
      ccna:'shutdown / err-disable a port, 802.1X CoA to quarantine VLAN 999, ACL deny, rate limits, revoke an agent token.',
      counters:'Phished laptop (quarantine VLAN), ARP spoofer (port shut), VPN spray (edge ACL), hijacked agent (revoke token + egress ACL).',
      guard:'Every block needs human approval. Actions are reversible and time-boxed.' } },
  { id:'patch', kind:'agent', glyph:'PAT', color:C.yellow, row:5, x:1060, prow:6, px:70, label:'Patch', sub:'remediate',
    p:{ type:'Defender agent · Remediate', what:'Cleans up after containment so the same bot cannot come back.',
      watches:'Closed incidents, vuln feeds, dependency lockfiles.',
      ccna:'IOS upgrades, config baselines, password/key rotation, removing unused services.',
      counters:'Supply chain (pin and rotate), malware (rebuild host), VPN spray (enforce MFA), rogue AP (WPA3 + PMF).',
      guard:'Opens change requests, never pushes to production without approval.' } },
  { id:'auditor', kind:'agent', glyph:'AUD', color:C.yellow, row:5, x:1240, prow:6, px:320, label:'Auditor', sub:'human-in-loop',
    p:{ type:'Defender agent · Human in the loop', what:'The approval gate and the audit log. Shows a human what Quarantine wants to do and why.',
      watches:'Every proposed action, every approval, every agent decision.',
      ccna:'AAA accounting, privilege levels, role-based CLI views, logging every config change.',
      counters:'Guards against the swarm itself going rogue (OWASP ASI10) and against bad auto-blocks.',
      guard:'Append-only audit log. No offensive actions, ever. Scope is limited to assets you own.' } },
];

export const EDGES = [
  ['inet','edge'], ['inet','cloud'], ['edge','fw'], ['fw','vpn'], ['fw','core'], ['vpn','aaa'],
  ['core','wlc'], ['core','aaa'], ['core','swa'], ['core','swb'], ['wlc','ap'], ['ap','wifi'],
  ['swa','lap'], ['swb','agenthost'], ['swb','srv'], ['aaa','siem',1], ['cloud','agenthost',2,'logical'],
];

export const THREATS = {
  phish: { name:'AI phishing + deepfake voice', short:'Phish-bot', path:['inet','edge','fw','core','swa','lap'], detectAt:5,
    src:['fbi','anth'], agents:['sentinel','tracker','quar','patch'],
    info:'An LLM writes a tailored lure, followed up by a cloned-voice call. The laptop opens it and starts beaconing out.',
    log:{ detect:'beacon from VLAN10 host to new domain every 60s (NetFlow + DNS)', track:'domain registered 2 days ago, same lure seen on 3 inboxes',
      propose:'move laptop port to quarantine VLAN 999 via 802.1X CoA', fix:'reset user creds, enforce phishing-resistant MFA' } },
  rogueap: { name:'Rogue AP / evil twin', short:'Evil-twin', path:[{near:'ap',dx:-0.9,dy:0.55},'wifi'], detectAt:1,
    src:[], agents:['sentinel','tracker','decoy','quar','patch'],
    info:'A fake AP broadcasts your SSID next to the building to harvest Wi-Fi logins.',
    log:{ detect:'WLC rogue alarm: SSID "CORP" from unknown BSSID', track:'not seen on any switch port (air-only rogue), signal strongest near AP-1',
      propose:'notify facilities + keep clients on PMF, no over-the-air jamming', fix:'confirm WPA3-Enterprise + cert pinning on all clients' } },
  arp: { name:'ARP spoofing (MITM)', short:'ARP-bot', path:[{near:'lap',dx:0.55,dy:0.5},'lap','swa','core'], detectAt:2,
    src:[], agents:['sentinel','tracker','quar','patch'],
    info:'A compromised device on VLAN 10 claims to be the default gateway so it can sit in the middle.',
    log:{ detect:'DAI dropped 412 ARP replies on Gi1/0/5 (no snooping binding)', track:'MAC aaaa.bbbb.cccc on Gi1/0/5, VLAN 10 (sim)',
      propose:'err-disable Gi1/0/5 for 30 min', fix:'reimage host, keep DAI + DHCP snooping on VLAN 10,20' } },
  inject: { name:'Prompt injection / MCP tool poisoning', short:'Inject-bot', path:['inet','cloud','agenthost'], detectAt:2,
    src:['inv','owasp','newstack'], agents:['sentinel','decoy','tracker','quar','patch'],
    info:'Hidden instructions in a web page or MCP tool description tell your AI agent to send secrets out.',
    log:{ detect:'agent tool call: read ~/.ssh then POST to unknown host', track:'instruction came from a poisoned MCP tool description',
      propose:'revoke agent token + VLAN30 egress ACL to allowlist only', fix:'pin MCP server versions, require approval for file+network tools' } },
  cred: { name:'Credential stuffing at VPN', short:'Stuff-bot', path:['inet','edge','fw','vpn'], detectAt:3,
    src:['grey','imperva'], agents:['sentinel','decoy','tracker','quar','patch'],
    info:'A bot swarm sprays leaked username/password pairs at the VPN portal from thousands of IPs.',
    log:{ detect:'VPN auth failures 40x baseline in 5 min (AAA accounting)', track:'sources cluster in 2 hosting ASNs, same TCP fingerprint (sim)',
      propose:'rate-limit + temporary edge ACL for the 2 ASNs, 1 hour', fix:'MFA on every VPN account, rotate any reused passwords' } },
  malware: { name:'LLM-assisted mutating malware', short:'Mutant-bot', path:['srv','swb','core','fw'], detectAt:3,
    src:['gtig'], agents:['sentinel','tracker','quar','patch'],
    info:'Malware on a server asks an LLM API to rewrite itself or generate commands, so signatures miss it.',
    log:{ detect:'server in VLAN 40 called an LLM API it never used before (egress log)', track:'process: script host, new hash every hour',
      propose:'block VLAN40 → LLM API at firewall, isolate host', fix:'rebuild host, egress allowlist for AI APIs' } },
};
export const DEMO_ORDER = ['cred','phish','inject','arp','rogueap','malware'];

export const AGENT_TXT = { sentinel:'SENTINEL', tracker:'TRACKER', decoy:'DECOY', queen:'QUEEN', quar:'QUARANTINE', patch:'PATCH', auditor:'AUDITOR' };

/* ============================================================
   LAYOUT
   ============================================================ */
const svg = document.getElementById('svg');
const world = document.getElementById('world');

export function mountHive(svg, opts={}){
  const W = () => svg.clientWidth || 800;
  const H = () => svg.clientHeight || 520;
  const NS='http://www.w3.org/2000/svg';
  const el=(tag,a={},p)=>{const e=document.createElementNS(NS,tag);for(const k in a)e.setAttribute(k,a[k]);(p||svg).appendChild(e);return e;};
  svg.innerHTML='';
  const bg=el('g'); const edges=el('g'); const nodes=el('g');
  function layout(){
    const w=W(), h=H(), rows=5;
    const byRow={}; NODES.forEach(n=>{ (byRow[n.row]=byRow[n.row]||[]).push(n); });
    Object.keys(byRow).forEach(r=>{
      const list=byRow[r];
      list.forEach((n,i)=>{
        n._x = (i+1)/(list.length+1)*w;
        n._y = 40 + Number(r)/(rows-1)*(h-80);
      });
    });
  }
  function draw(){
    layout();
    edges.innerHTML=''; nodes.innerHTML='';
    const map=Object.fromEntries(NODES.map(n=>[n.id,n]));
    EDGES.forEach(([a,b])=>{
      const A=map[a],B=map[b]; if(!A||!B) return;
      el('line',{x1:A._x,y1:A._y,x2:B._x,y2:B._y,stroke:'rgba(100,180,255,.25)','stroke-width':1.2},edges);
    });
    NODES.forEach(n=>{
      const g=el('g',{class:'hn',style:'cursor:pointer'},nodes);
      el('circle',{cx:n._x,cy:n._y,r: n.kind==='agent'?16:14, fill:n.color||'#1a2744', stroke:'rgba(255,255,255,.35)','stroke-width':1.4},g);
      el('text',{x:n._x,y:n._y+1,'text-anchor':'middle','dominant-baseline':'middle',fill:'#fff','font-size':n.glyph&&n.glyph.length>2?8:10,'font-family':'Sora,sans-serif','font-weight':'700'},g).textContent=n.glyph||'•';
      el('text',{x:n._x,y:n._y+26,'text-anchor':'middle',fill:'#dce6ff','font-size':10,'font-family':'Inter,sans-serif'},g).textContent=n.label||n.id;
      g.addEventListener('click',()=>opts.onNode&&opts.onNode(n));
    });
  }
  draw();
  const ro=new ResizeObserver(draw); ro.observe(svg);
  return { redraw:draw, destroy:()=>ro.disconnect() };
}
