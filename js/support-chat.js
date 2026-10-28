import { matchFaq } from "./support-match.js";

const root = document.getElementById("sgi-support");
if (root) mount(root);

function mount(host) {
  host.className = "sgi-sup";
  host.innerHTML = `
    <section class="sgi-sup-panel glass" id="sgi-sup-panel" hidden aria-labelledby="sgi-sup-title">
      <header class="sgi-sup-head">
        <span class="sgi-sup-dog" aria-hidden="true">
          <svg viewBox="0 0 32 32" width="22" height="22">
            <path fill="#f0c060" d="M6 14c0-4 3-8 8-8 2 0 3 .4 4 1.2C19.2 6.4 20.4 6 22 6c3 0 5 2 5 4.5 0 1.2-.4 2.2-1 3 1.2.8 2 2.2 2 3.8 0 3.2-2.6 6.2-7 7.2-1.2 2-3.4 3.5-6 3.5s-4.8-1.5-6-3.5C5.6 23.5 3 20.5 3 17.3 3 15.7 3.8 14.3 5 13.5 4.6 12.8 4 11.6 4 10.5 4 8.8 5 8 6 8c.4 0 .8.1 1.1.2C7 9.4 6.4 11.5 6 14z"/>
            <circle cx="12" cy="15" r="1.3" fill="#0a1220"/>
            <circle cx="20" cy="15" r="1.3" fill="#0a1220"/>
            <path d="M14.2 18.5h3.6" stroke="#0a1220" stroke-width="1.2" stroke-linecap="round"/>
          </svg>
        </span>
        <div>
          <h2 id="sgi-sup-title">Support</h2>
          <p class="sgi-sup-status" id="sgi-sup-status">On-device FAQ</p>
        </div>
        <button type="button" class="sgi-sup-x" id="sgi-sup-close" aria-label="Close support">×</button>
      </header>
      <div class="sgi-sup-log" id="sgi-sup-log" role="log" aria-live="polite"></div>
      <p class="sgi-sup-warn" id="sgi-sup-warn">Do not paste passwords, keys, or payment details.</p>
      <form class="sgi-sup-form" id="sgi-sup-form">
        <label class="sgi-sup-sr" for="sgi-sup-input">Message</label>
        <input id="sgi-sup-input" name="message" maxlength="1000" autocomplete="off" placeholder="Ask about Shield, Paste Guard, pricing…">
        <button type="submit" class="sgi-sup-send">Send</button>
      </form>
    </section>
    <button type="button" class="sgi-sup-launch" id="sgi-sup-launch" aria-expanded="false" aria-controls="sgi-sup-panel">
      <span class="sgi-sup-dog" aria-hidden="true">
        <svg viewBox="0 0 32 32" width="18" height="18">
          <path fill="currentColor" d="M6 14c0-4 3-8 8-8 2 0 3 .4 4 1.2C19.2 6.4 20.4 6 22 6c3 0 5 2 5 4.5 0 1.2-.4 2.2-1 3 1.2.8 2 2.2 2 3.8 0 3.2-2.6 6.2-7 7.2-1.2 2-3.4 3.5-6 3.5s-4.8-1.5-6-3.5C5.6 23.5 3 20.5 3 17.3 3 15.7 3.8 14.3 5 13.5 4.6 12.8 4 11.6 4 10.5 4 8.8 5 8 6 8c.4 0 .8.1 1.1.2C7 9.4 6.4 11.5 6 14z"/>
        </svg>
      </span>
      Support
    </button>`;

  const panel = host.querySelector("#sgi-sup-panel");
  const launch = host.querySelector("#sgi-sup-launch");
  const closeBtn = host.querySelector("#sgi-sup-close");
  const form = host.querySelector("#sgi-sup-form");
  const input = host.querySelector("#sgi-sup-input");
  const log = host.querySelector("#sgi-sup-log");
  const status = host.querySelector("#sgi-sup-status");
  const warn = host.querySelector("#sgi-sup-warn");
  let pack = null;
  let opened = false;

  const setOpen = (next) => {
    panel.hidden = !next;
    launch.setAttribute("aria-expanded", next ? "true" : "false");
    if (next) input.focus();
  };

  launch.addEventListener("click", (event) => {
    event.stopPropagation();
    setOpen(panel.hidden);
    if (!opened) {
      opened = true;
      void greet();
    }
  });
  closeBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    setOpen(false);
    launch.focus();
  });
  host.addEventListener("click", (event) => event.stopPropagation());
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || panel.hidden) return;
    event.stopPropagation();
    setOpen(false);
    launch.focus();
  }, true);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const message = input.value.trim();
    if (!message) return;
    input.value = "";
    addBubble("you", message);
    void reply(message);
  });

  async function greet() {
    pack = await loadPack();
    if (pack?.warning) warn.textContent = pack.warning;
    addBubble("bot", pack?.greeting || "Support FAQ is on this device.");
    const base = apiBase();
    status.textContent = base ? "Checking support…" : "On-device FAQ";
    if (!base) return;
    try {
      const response = await fetch(`${base}/v1/support/faq`, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("offline");
      status.textContent = "Connected to SGI support";
    } catch {
      status.textContent = "Support offline — on-device FAQ";
    }
  }

  async function reply(message) {
    const base = apiBase();
    if (base) {
      try {
        const response = await fetch(`${base}/v1/support/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ message }),
        });
        if (!response.ok) throw new Error("offline");
        const body = await response.json();
        status.textContent = body.llm ? "Connected · model on" : "Connected · FAQ";
        addBubble("bot", body.reply || "No reply.", body.links);
        return;
      } catch {
        status.textContent = "Support offline — on-device FAQ";
      }
    }
    if (!pack) pack = await loadPack();
    const local = matchFaq(pack, message);
    addBubble("bot", local.reply, local.links);
  }
}

function apiBase() {
  const configured = window.SGI_API_BASE;
  if (typeof configured !== "string") return "";
  return configured.replace(/\/$/, "");
}

async function loadPack() {
  try {
    const response = await fetch("data/support-faq.json");
    if (!response.ok) throw new Error("missing");
    return await response.json();
  } catch {
    return null;
  }
}

function addBubble(who, text, links) {
  const log = document.getElementById("sgi-sup-log");
  if (!log) return;
  const item = document.createElement("div");
  item.className = `sgi-sup-bubble ${who}`;
  const body = document.createElement("p");
  body.textContent = text;
  item.appendChild(body);
  if (Array.isArray(links)) {
    for (const link of links) {
      if (!link || link.href !== "https://github.com/sponsors/StarSwarm-Security") continue;
      const anchor = document.createElement("a");
      anchor.href = link.href;
      anchor.target = "_blank";
      anchor.rel = "noopener";
      anchor.textContent = link.label || "GitHub Sponsors";
      item.appendChild(anchor);
    }
  }
  log.appendChild(item);
  log.scrollTop = log.scrollHeight;
}
