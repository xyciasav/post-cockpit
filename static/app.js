(() => {
  const STORAGE_KEY = "sc_substack_v1";
  const RSS_STORAGE_KEY = "sc_rss_v1";

  const SECTIONS = [
    { id: "opening", name: "Opening" },
    { id: "democracy_watch", name: "Democracy Watch" },
    { id: "important_read_first", name: "Important / Read First" },
    { id: "community", name: "Community" },
    { id: "call_to_action", name: "Call to Action" },
    { id: "resources_optional", name: "Resources (Optional)" },
    { id: "upcoming_events_optional", name: "Upcoming Events (Optional)" },
    { id: "closing_optional", name: "Closing (Optional)" },
    { id: "upcoming_schedule", name: "Upcoming Schedule" },
  ];

  const DEFAULT_STATE = {
    issue: "",
    tone: "firm",
    length: "medium",

    body: "",
    bodySectionId: "opening",
    bodyLinks: "",
    bodyIncludeLinks: false,

    blocks: [],

    // used only for title generation (not shown as separate UI)
    outputs: Object.fromEntries(SECTIONS.map(s => [s.id, ""])),

    titleOutput: ""
  };

  const DEFAULT_RSS = { feeds: [], activeFeedUrl: "", lastItems: [] };

  function uid() {
    return Math.random().toString(16).slice(2) + Date.now().toString(16);
  }
  function $(id) { return document.getElementById(id); }

  function setStatus(id, msg, kind = "info") {
    const el = $(id);
    if (!el) return;
    el.textContent = msg;
    el.classList.remove("ok", "warn", "err");
    if (kind === "ok") el.classList.add("ok");
    if (kind === "warn") el.classList.add("warn");
    if (kind === "err") el.classList.add("err");
  }

  function safeParseJSON(str) { try { return JSON.parse(str); } catch { return null; } }

  function stripCodeFences(text) {
    if (!text) return "";
    let t = String(text).trim();
    if (t.startsWith("```")) {
      t = t.replace(/^```[a-zA-Z0-9_-]*\n?/, "");
      t = t.replace(/```$/m, "");
      t = t.trim();
    }
    return t;
  }

  async function copyToClipboard(text) {
    const t = String(text || "");
    try {
      await navigator.clipboard.writeText(t);
      return true;
    } catch {
      const ta = document.createElement("textarea");
      ta.value = t;
      ta.setAttribute("readonly", "readonly");
      ta.style.position = "absolute";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch { ok = false; }
      document.body.removeChild(ta);
      return ok;
    }
  }

  function escapeHtml(s) {
    return String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  }
  function escapeHtmlAttr(s) { return escapeHtml(s).replaceAll('"', "&quot;"); }

  function sectionName(sectionId) {
    return (SECTIONS.find(s => s.id === sectionId)?.name) || sectionId;
  }

  function toneGuidance(tone) {
    switch (tone) {
      case "urgent": return "Tone: urgent, direct, clear. No panic. No exaggeration.";
      case "hopeful": return "Tone: hopeful, grounded, practical. Avoid empty optimism.";
      case "angry_safe": return "Tone: angry but safe—channel outrage into constructive, lawful action. No insults, hate, or violence.";
      case "firm":
      default: return "Tone: firm, serious, confident, community-minded.";
    }
  }

  function lengthGuidance(length) {
    switch (length) {
      case "short": return "Length: short. Social-media post length (tight, punchy).";
      case "medium": return "Length: medium. About one paragraph (roughly 4–8 sentences).";
      case "long": return "Length: long. A few paragraphs (roughly 3–5 short paragraphs).";
      default: return "Length: medium.";
    }
  }

  function sectionRules(sectionId) {
    switch (sectionId) {
      case "opening": return "Punchy opening, 2–5 sentences. Set context for the issue. Plain text.";
      case "democracy_watch": return "Summarize key developments clearly. Short paragraphs. Bullets only if needed. Plain text.";
      case "important_read_first": return "Lead with the single most important point. Then 2–5 bullets. Plain text.";
      case "community": return "Community updates, mutual aid, local context, wins/needs. 1–3 short paragraphs.";
      case "call_to_action": return "Clear asks. Use bullets. Lawful, constructive actions only. No violence.";
      case "resources_optional": return "List resources/links with a short context line each. Only use provided links.";
      case "upcoming_events_optional": return "List upcoming events from input. Bullets. No invented dates/locations.";
      case "closing_optional": return "Short grounding close and reminder to stay involved. 1 paragraph.";
      default: return "Write clear, plain-text copy appropriate to this section.";
    }
  }

  function buildSystemPrompt() {
    return [
      "You are an assistant helping draft a newsletter or social post.",
      "Output MUST be plain text (no JSON).",
      "Be factual. Don’t invent names/dates/places/claims not present in input.",
      "If something is missing, leave it out rather than guessing.",
      "No hate. No calls for violence.",
      "Do not include markdown code fences."
    ].join(" ");
  }

  async function callAI(messages) {
    const resp = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages })
    });
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`AI request failed (${resp.status}): ${txt}`);
    }
    const data = await resp.json();
    return stripCodeFences(data?.message?.content ?? "");
  }

  let state = loadState();
  let rssState = loadRssState();

  function loadState() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const parsed = safeParseJSON(raw);
    if (!parsed || typeof parsed !== "object") return structuredClone(DEFAULT_STATE);

    const merged = structuredClone(DEFAULT_STATE);
    merged.issue = typeof parsed.issue === "string" ? parsed.issue : merged.issue;
    merged.tone = typeof parsed.tone === "string" ? parsed.tone : merged.tone;
    merged.length = typeof parsed.length === "string" ? parsed.length : merged.length;

    schedule: b.schedule && typeof b.schedule === "object"
  ? {
      title: typeof b.schedule.title === "string" ? b.schedule.title : "",
      date: typeof b.schedule.date === "string" ? b.schedule.date : "",
      time: typeof b.schedule.time === "string" ? b.schedule.time : "",
      location: typeof b.schedule.location === "string" ? b.schedule.location : "",
      rsvp: typeof b.schedule.rsvp === "string" ? b.schedule.rsvp : "",
    }
  : { title:"", date:"", time:"", location:"", rsvp:"" },

    merged.body = typeof parsed.body === "string" ? parsed.body : merged.body;
    merged.bodySectionId = typeof parsed.bodySectionId === "string" ? parsed.bodySectionId : merged.bodySectionId;
    merged.bodyLinks = typeof parsed.bodyLinks === "string" ? parsed.bodyLinks : merged.bodyLinks;
    merged.bodyIncludeLinks = !!parsed.bodyIncludeLinks;

    merged.blocks = Array.isArray(parsed.blocks) ? parsed.blocks.map(b => ({
      id: b.id || uid(),
      sectionId: b.sectionId || "democracy_watch",
      label: typeof b.label === "string" ? b.label : "",
      links: typeof b.links === "string" ? b.links : "",
      includeLinks: !!b.includeLinks,
      notes: typeof b.notes === "string" ? b.notes : "",
      isGenerated: !!b.isGenerated,
    })) : [];

    merged.outputs = typeof parsed.outputs === "object" && parsed.outputs
      ? { ...merged.outputs, ...parsed.outputs }
      : merged.outputs;

    merged.titleOutput = typeof parsed.titleOutput === "string" ? parsed.titleOutput : "";

    for (const s of SECTIONS) if (!(s.id in merged.outputs)) merged.outputs[s.id] = "";
    return merged;
  }

function formatScheduleBlock(b) {
  // b.schedule: { title, date, time, location, rsvp }
  const s = b.schedule || {};
  const title = (s.title || "").trim();
  const date = (s.date || "").trim();
  const time = (s.time || "").trim();
  const location = (s.location || "").trim();
  const rsvp = (s.rsvp || "").trim();

  const lines = [];
  if (!title && !date && !time && !location && !rsvp) return "";

  lines.push("📅 Upcoming Schedule");

  // First line: "Today, Jan 20th — Walkout" (date optional)
  const headParts = [];
  if (date) headParts.push(date);
  if (title) headParts.push(title);
  lines.push(headParts.length ? headParts.join(" — ") : "(Add title/date)");

  // Location (optional)
  if (location) {
    lines.push(`📍 ${location}`);
  }

  // Time (required-ish, but don’t force)
  if (time) {
    lines.push(`🕔 ${time}`);
  }

  // RSVP (optional)
  if (rsvp) {
    lines.push(`👉 RSVP Here`);
    lines.push(rsvp);
  }

  return lines.join("\n");
}


  function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

  function loadRssState() {
    const raw = localStorage.getItem(RSS_STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_RSS);
    const parsed = safeParseJSON(raw);
    if (!parsed || typeof parsed !== "object") return structuredClone(DEFAULT_RSS);

    const merged = structuredClone(DEFAULT_RSS);
    merged.feeds = Array.isArray(parsed.feeds) ? parsed.feeds.filter(x => typeof x === "string") : [];
    merged.activeFeedUrl = typeof parsed.activeFeedUrl === "string" ? parsed.activeFeedUrl : "";
    merged.lastItems = Array.isArray(parsed.lastItems) ? parsed.lastItems : [];
    return merged;
  }

  function saveRssState() { localStorage.setItem(RSS_STORAGE_KEY, JSON.stringify(rssState)); }

  function initTabs() {
    const tabs = Array.from(document.querySelectorAll(".tab"));
    const panels = Array.from(document.querySelectorAll(".panel"));
    tabs.forEach(btn => {
      btn.addEventListener("click", () => {
        const key = btn.getAttribute("data-tab");
        tabs.forEach(t => t.classList.toggle("active", t === btn));
        panels.forEach(p => p.classList.toggle("active", p.getAttribute("data-panel") === key));
      });
    });
  }

  function renderBodySectionDropdown() {
    const sel = $("ssBodySection");
    sel.innerHTML = SECTIONS.map(s =>
      `<option value="${s.id}" ${s.id === state.bodySectionId ? "selected" : ""}>${s.name}</option>`
    ).join("");
  }

  function renderBlocks() {
  const container = $("ssBlocks");
  container.innerHTML = "";

  if (state.blocks.length === 0) {
    const empty = document.createElement("div");
    empty.className = "card empty";
    empty.innerHTML = `<div class="muted">No blocks yet. Click <b>+ Add another block</b>.</div>`;
    container.appendChild(empty);
    return;
  }

  state.blocks.forEach((b, idx) => {
    const card = document.createElement("div");
    card.className = "card block";
    card.setAttribute("draggable", "true");
    card.setAttribute("data-block-id", b.id);

    // ---------- GENERATED BLOCK (minimal) ----------
    if (b.isGenerated) {
      card.innerHTML = `
        <div class="row space">
          <div class="row gap">
            <div class="drag-handle" title="Drag to reorder">⋮⋮</div>
            <div class="pill">${idx + 1}</div>
            <span class="badge">GENERATED</span>
            <div class="gen-title">${escapeHtml(sectionName(b.sectionId))}</div>
          </div>

          <div class="row gap">
            <button class="btn small" data-action="block-copy" data-id="${b.id}">Copy</button>
            <button class="btn small" data-action="block-up" data-id="${b.id}" title="Move up">↑</button>
            <button class="btn small" data-action="block-down" data-id="${b.id}" title="Move down">↓</button>
            <button class="btn small danger" data-action="block-del" data-id="${b.id}">Delete</button>
          </div>
        </div>

        <div class="field" style="margin-top:10px;">
          <textarea class="input" rows="7"
            placeholder="Generated output..."
            data-action="block-notes" data-id="${b.id}">${escapeHtml(b.notes || "")}</textarea>
        </div>
      `;
      container.appendChild(card);
      return;
    }

// ---------- INPUT BLOCK (full) ----------
const sectionOptions = SECTIONS.map(s => (
  `<option value="${s.id}" ${s.id === b.sectionId ? "selected" : ""}>${s.name}</option>`
)).join("");

// SPECIAL: schedule input block
if (b.sectionId === "upcoming_schedule") {
  const s = b.schedule || { title:"", date:"", time:"", location:"", rsvp:"" };
  card.innerHTML = `
    <div class="row space">
      <div class="row gap">
        <div class="drag-handle" title="Drag to reorder">⋮⋮</div>
        <div class="pill">${idx + 1}</div>
        <select class="input" data-action="block-section" data-id="${b.id}">
          ${sectionOptions}
        </select>
      </div>

      <div class="row gap">
        <button class="btn small" data-action="block-up" data-id="${b.id}" title="Move up">↑</button>
        <button class="btn small" data-action="block-down" data-id="${b.id}" title="Move down">↓</button>
        <button class="btn small danger" data-action="block-del" data-id="${b.id}">Delete</button>
      </div>
    </div>

    <div class="grid two" style="margin-top:10px;">
      <div class="field">
        <label>Title</label>
        <input class="input" type="text" placeholder="Walkout"
          data-action="sched-title" data-id="${b.id}" value="${escapeHtmlAttr(s.title || "")}" />
      </div>
      <div class="field">
        <label>Date</label>
        <input class="input" type="text" placeholder="Today, Jan 20th"
          data-action="sched-date" data-id="${b.id}" value="${escapeHtmlAttr(s.date || "")}" />
      </div>
    </div>

    <div class="grid two" style="margin-top:10px;">
      <div class="field">
        <label>Time</label>
        <input class="input" type="text" placeholder="2:00 PM"
          data-action="sched-time" data-id="${b.id}" value="${escapeHtmlAttr(s.time || "")}" />
      </div>
      <div class="field">
        <label>Location (optional)</label>
        <input class="input" type="text" placeholder="Everywhere / Brentwood Pedestrian Bridge"
          data-action="sched-location" data-id="${b.id}" value="${escapeHtmlAttr(s.location || "")}" />
      </div>
    </div>

    <div class="field" style="margin-top:10px;">
      <label>RSVP link (optional)</label>
      <input class="input" type="text" placeholder="https://mobilize.us/..."
        data-action="sched-rsvp" data-id="${b.id}" value="${escapeHtmlAttr(s.rsvp || "")}" />
    </div>

    <div class="field" style="margin-top:10px;">
      <label>Output (auto-formatted)</label>
      <textarea class="input" rows="7"
        data-action="block-notes" data-id="${b.id}">${escapeHtml(b.notes || "")}</textarea>
      <div class="hint" style="margin-top:6px;">
        This output auto-updates as you edit the schedule fields.
      </div>
    </div>
  `;
  container.appendChild(card);
  return;
}

  function readTopFields() {
    state.issue = $("ssIssue").value || "";
    state.tone = $("ssTone").value || "firm";
    state.length = $("ssLength").value || "medium";

    state.body = $("ssBody").value || "";
    state.bodySectionId = $("ssBodySection").value || "opening";
    state.bodyLinks = $("ssBodyLinks").value || "";
    state.bodyIncludeLinks = $("ssBodyIncludeLinks").checked;

    saveState();
  }

  function addBlock(prefill = {}) {
    state.blocks.push({
      id: uid(),
      sectionId: prefill.sectionId || "democracy_watch",
      label: prefill.label || "",
      links: prefill.links || "",
      includeLinks: !!prefill.includeLinks,
      notes: prefill.notes || "",
      isGenerated: !!prefill.isGenerated,
      schedule: prefill.schedule || { title:"", date:"", time:"", location:"", rsvp:"" },
    });
    saveState();
    renderBlocks();
    setStatus("ssStatus", "Block added.", "ok");
  }

  function deleteBlock(id) {
    state.blocks = state.blocks.filter(b => b.id !== id);
    saveState();
    renderBlocks();
    setStatus("ssStatus", "Block deleted.", "ok");
  }

  function moveBlock(id, dir) {
    const i = state.blocks.findIndex(b => b.id === id);
    if (i < 0) return;
    const j = i + dir;
    if (j < 0 || j >= state.blocks.length) return;
    const tmp = state.blocks[i];
    state.blocks[i] = state.blocks[j];
    state.blocks[j] = tmp;
    saveState();
    renderBlocks();
  }

  function updateBlock(id, patch) {
    const b = state.blocks.find(x => x.id === id);
    if (!b) return;
    Object.assign(b, patch);
    saveState();
  }

  // one generated block per section
  function getOrCreateGeneratedBlock(sectionId) {
    let b = state.blocks.find(x => x.isGenerated && x.sectionId === sectionId);
    if (!b) {
      b = {
        id: uid(),
        sectionId,
        label: sectionName(sectionId),
        links: "",
        includeLinks: false,
        notes: "",
        isGenerated: true
      };
      state.blocks.unshift(b);
    } else {
      state.blocks = state.blocks.filter(x => x.id !== b.id);
      state.blocks.unshift(b);
    }
    return b;
  }

  function blocksBySection() {
    const map = Object.fromEntries(SECTIONS.map(s => [s.id, []]));

    const bodyText = (state.body || "").trim();
    if (bodyText) {
      map[state.bodySectionId].unshift({
        id: "PRIMARY_BODY",
        sectionId: state.bodySectionId,
        label: "Primary Body Draft",
        links: state.bodyLinks || "",
        includeLinks: !!state.bodyIncludeLinks,
        notes: bodyText
      });
    }

    for (const b of state.blocks) {
      if (b.isGenerated) continue; // do NOT feed AI outputs back into AI input
      const sid = b.sectionId || "democracy_watch";
      map[sid].push(b);
    }
    return map;
  }

  function formatBlocksForPrompt(blocks) {
    return blocks.map((b, idx) => {
      const title = (b.label || "").trim();
      const links = (b.links || "").trim();
      const notes = (b.notes || "").trim();
      const includeLinks = !!b.includeLinks;

      return [
        `BLOCK ${idx + 1}:`,
        title ? `Title: ${title}` : "Title: (none)",
        links ? `Links (one per line):\n${links}` : "Links: (none)",
        `Link usage: ${includeLinks ? "INCLUDE links in final output" : "RESEARCH-ONLY (do not include links in final output)"}`,
        notes ? `Notes:\n${notes}` : "Notes: (none)",
        ""
      ].join("\n");
    }).join("\n");
  }

  async function generateSections() {
    readTopFields();

    if (!state.issue.trim()) {
      setStatus("ssStatus", "Add an Issue/Topic first.", "warn");
      return;
    }

    const hasAnyInput =
      (state.body || "").trim().length > 0 ||
      state.blocks.some(b => !b.isGenerated);

    if (!hasAnyInput) {
      setStatus("ssStatus", "Add Body text or at least one input block.", "warn");
      return;
    }

    const grouped = blocksBySection();
    const sectionsToGenerate = SECTIONS.filter(s => grouped[s.id] && grouped[s.id].length > 0);

    setStatus("ssStatus", `Generating ${sectionsToGenerate.length} section(s)...`, "info");

    for (let idx = 0; idx < sectionsToGenerate.length; idx++) {
      const sec = sectionsToGenerate[idx];
      setStatus("ssStatus", `Generating: ${sec.name} (${idx + 1}/${sectionsToGenerate.length})...`, "info");

      const blocks = grouped[sec.id];

      const userPrompt = [
        `Issue/Topic: ${state.issue}`,
        toneGuidance(state.tone),
        lengthGuidance(state.length),
        "",
        `Section: ${sec.name} (${sec.id})`,
        `Rules: ${sectionRules(sec.id)}`,
        "",
        "INPUT BLOCKS:",
        formatBlocksForPrompt(blocks),
        "",
        "IMPORTANT:",
        "- Output plain text only.",
        "- If a block says RESEARCH-ONLY links, do NOT include those links in the final output.",
        "- If a block says INCLUDE links, you may include those links verbatim at the end of the section (or inline if natural).",
        "",
        "Write the final section copy now."
      ].join("\n");

      const messages = [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: userPrompt }
      ];

      try {
        const out = await callAI(messages);
        const cleaned = out.trim();

        // keep for title generation (internal)
        state.outputs[sec.id] = cleaned;

        // write into a generated block (single path)
        const gb = getOrCreateGeneratedBlock(sec.id);
        gb.notes = cleaned;

        saveState();
        renderBlocks();

        document.querySelector(`.block[data-block-id="${gb.id}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "start" });

      } catch (e) {
        console.error(e);
        setStatus("ssStatus", `Error generating ${sec.name}: ${e.message}`, "err");
        return;
      }
    }

    setStatus("ssStatus", "Done. Generated blocks updated.", "ok");
  }

  async function generateTitleOptions() {
    readTopFields();

    const generatedText = state.blocks
      .filter(b => b.isGenerated)
      .map(b => (b.notes || "").trim())
      .filter(Boolean)
      .join("\n\n");

    if (!generatedText.trim()) {
      setStatus("ssStatus", "Generate sections first (so there are generated blocks).", "warn");
      return;
    }

    setStatus("ssStatus", "Generating 6 subject/title options...", "info");

    const userPrompt = [
      `Issue/Topic: ${state.issue || "(none)"}`,
      toneGuidance(state.tone),
      "",
      "Using the newsletter content below, generate exactly 6 subject/title options.",
      "Return a numbered list only (1-6). No extra commentary.",
      "",
      "NEWSLETTER CONTENT:",
      generatedText
    ].join("\n");

    const messages = [
      { role: "system", content: buildSystemPrompt() },
      { role: "user", content: userPrompt }
    ];

    try {
      const out = await callAI(messages);
      state.titleOutput = out.trim();
      saveState();
      $("ssTitleOutput").value = state.titleOutput;
      setStatus("ssStatus", "Title options ready.", "ok");
    } catch (e) {
      console.error(e);
      setStatus("ssStatus", `Error generating titles: ${e.message}`, "err");
    }
  }

  async function copyAllGenerated() {
    const parts = state.blocks
      .filter(b => b.isGenerated)
      .map(b => `[${sectionName(b.sectionId)}]\n${(b.notes || "").trim()}`)
      .filter(x => x.trim().length > 0);

    const joined = parts.join("\n\n---\n\n");
    if (!joined.trim()) {
      setStatus("ssStatus", "No generated blocks to copy yet.", "warn");
      return;
    }

    const ok = await copyToClipboard(joined);
    setStatus("ssStatus", ok ? "Copied all generated blocks." : "Copy failed.", ok ? "ok" : "err");
  }

  function wireDragAndDropBlocks() {
    const container = $("ssBlocks");
    const cards = Array.from(container.querySelectorAll(".block[draggable='true']"));
    if (cards.length === 0) return;

    let dragId = null;

    cards.forEach(card => {
      card.addEventListener("dragstart", (e) => {
        dragId = card.getAttribute("data-block-id");
        card.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
      });

      card.addEventListener("dragend", () => {
        dragId = null;
        card.classList.remove("dragging");
      });

      card.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      });

      card.addEventListener("drop", (e) => {
        e.preventDefault();
        const targetId = card.getAttribute("data-block-id");
        if (!dragId || !targetId || dragId === targetId) return;

        const from = state.blocks.findIndex(b => b.id === dragId);
        const to = state.blocks.findIndex(b => b.id === targetId);
        if (from < 0 || to < 0) return;

        const [moved] = state.blocks.splice(from, 1);
        state.blocks.splice(to, 0, moved);

        saveState();
        renderBlocks();
        setStatus("ssStatus", "Reordered blocks.", "ok");
      });
    });
  }

  // ---------- RSS ----------
  function renderRssFeeds() {
    const container = $("rssFeeds");
    container.innerHTML = "";

    if (rssState.feeds.length === 0) {
      const empty = document.createElement("div");
      empty.className = "card empty";
      empty.innerHTML = `<div class="muted">No feeds yet. Add one above.</div>`;
      container.appendChild(empty);
      return;
    }

    rssState.feeds.forEach(url => {
      const active = url === rssState.activeFeedUrl;
      const card = document.createElement("div");
      card.className = "card rss-feed";

      card.innerHTML = `
        <div class="row space">
          <div class="rss-url ${active ? "active" : ""}" title="${escapeHtmlAttr(url)}">${escapeHtml(url)}</div>
          <div class="row gap">
            <button class="btn small" data-action="rss-select" data-url="${escapeHtmlAttr(url)}">${active ? "Selected" : "Select"}</button>
            <button class="btn small danger" data-action="rss-del" data-url="${escapeHtmlAttr(url)}">Remove</button>
          </div>
        </div>
      `;
      container.appendChild(card);
    });
  }

  function renderRssItems(items, feedTitle = "") {
    rssState.lastItems = items || [];
    saveRssState();

    $("rssActiveTitle").textContent = feedTitle
      ? `Feed: ${feedTitle}`
      : (rssState.activeFeedUrl ? `Feed: ${rssState.activeFeedUrl}` : "No feed selected.");

    const container = $("rssItems");
    container.innerHTML = "";

    if (!items || items.length === 0) {
      const empty = document.createElement("div");
      empty.className = "card empty";
      empty.innerHTML = `<div class="muted">No items to show.</div>`;
      container.appendChild(empty);
      return;
    }

    items.forEach((it) => {
      const title = it.title || "(untitled)";
      const link = it.link || "";
      const published = it.published || "";
      const summary = (it.summary || "").replace(/<[^>]*>/g, "").trim();

      const card = document.createElement("div");
      card.className = "card rss-item";

      card.innerHTML = `
        <div class="row space">
          <div>
            <div class="card-title">${escapeHtml(title)}</div>
            <div class="muted" style="font-size:12px;">${escapeHtml(published)}</div>
          </div>
          <div class="row gap">
            ${link ? `<a class="btn small" href="${escapeHtmlAttr(link)}" target="_blank" rel="noreferrer">Open</a>` : ""}
            <button class="btn small primary" data-action="rss-add-to-gen"
              data-title="${escapeHtmlAttr(title)}"
              data-link="${escapeHtmlAttr(link)}"
              data-summary="${escapeHtmlAttr(summary)}"
            >Add to Generator</button>
          </div>
        </div>
        ${summary ? `<div class="muted" style="margin-top:8px; font-size:13px; white-space:pre-wrap;">${escapeHtml(summary.slice(0, 600))}${summary.length > 600 ? "…" : ""}</div>` : ""}
      `;
      container.appendChild(card);
    });
  }

  async function fetchRss(url) {
    if (!url) { setStatus("rssStatus", "Select a feed first.", "warn"); return; }
    setStatus("rssStatus", "Fetching feed...", "info");
    try {
      const resp = await fetch(`/api/rss/fetch?url=${encodeURIComponent(url)}&limit=30`);
      if (!resp.ok) throw new Error(`RSS failed (${resp.status})`);
      const data = await resp.json();
      renderRssItems(data.items || [], data.feedTitle || "");
      setStatus("rssStatus", `Loaded ${(data.items || []).length} item(s).`, "ok");
    } catch (e) {
      console.error(e);
      setStatus("rssStatus", `RSS error: ${e.message}`, "err");
    }
  }

  function addRssFeed(url) {
    const u = (url || "").trim();
    if (!u) return;
    if (!rssState.feeds.includes(u)) rssState.feeds.push(u);
    if (!rssState.activeFeedUrl) rssState.activeFeedUrl = u;
    saveRssState();
    renderRssFeeds();
  }

  function removeRssFeed(url) {
    rssState.feeds = rssState.feeds.filter(x => x !== url);
    if (rssState.activeFeedUrl === url) rssState.activeFeedUrl = rssState.feeds[0] || "";
    saveRssState();
    renderRssFeeds();
    renderRssItems([], "");
  }

  function renderRss() {
    renderRssFeeds();
    setStatus("rssStatus", "Ready.", "info");
    $("rssActiveTitle").textContent = rssState.activeFeedUrl ? `Feed: ${rssState.activeFeedUrl}` : "No feed selected.";
    renderRssItems(rssState.lastItems || [], "");
  }

  function hydrateUI() {
    $("ssIssue").value = state.issue || "";
    $("ssTone").value = state.tone || "firm";
    $("ssLength").value = state.length || "medium";

    $("ssBody").value = state.body || "";
    renderBodySectionDropdown();
    $("ssBodySection").value = state.bodySectionId || "opening";

    $("ssBodyLinks").value = state.bodyLinks || "";
    $("ssBodyIncludeLinks").checked = !!state.bodyIncludeLinks;

    $("ssTitleOutput").value = state.titleOutput || "";

    renderBlocks();
    renderRss();
  }

  function wireEvents() {
    $("ssIssue").addEventListener("input", readTopFields);
    $("ssTone").addEventListener("change", readTopFields);
    $("ssLength").addEventListener("change", readTopFields);
    $("ssBody").addEventListener("input", readTopFields);
    $("ssBodySection").addEventListener("change", readTopFields);
    $("ssBodyLinks").addEventListener("input", readTopFields);
    $("ssBodyIncludeLinks").addEventListener("change", readTopFields);

    $("ssAddBlock").addEventListener("click", () => addBlock());
    $("ssGenerate").addEventListener("click", generateSections);
    $("ssGenTitle").addEventListener("click", generateTitleOptions);
    $("ssCopyAll").addEventListener("click", copyAllGenerated);

    $("ssCopyTitle").addEventListener("click", async () => {
      const text = $("ssTitleOutput").value || "";
      const ok = await copyToClipboard(text);
      setStatus("ssStatus", ok ? "Copied title options." : "Copy failed.", ok ? "ok" : "err");
    });

    $("ssTitleOutput").addEventListener("input", () => {
      state.titleOutput = $("ssTitleOutput").value || "";
      saveState();
    });

    $("ssBlocks").addEventListener("click", async (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      const action = btn.getAttribute("data-action");
      const id = btn.getAttribute("data-id");
      if (!action || !id) return;

      if (action === "block-del") deleteBlock(id);
      if (action === "block-up") moveBlock(id, -1);
      if (action === "block-down") moveBlock(id, 1);

      if (action === "block-copy") {
        const b = state.blocks.find(x => x.id === id);
        const text = (b?.notes || "").trim();
        const ok = await copyToClipboard(text);
        setStatus("ssStatus", ok ? "Copied generated block." : "Copy failed.", ok ? "ok" : "err");
      }
    });

    $("ssBlocks").addEventListener("change", (e) => {
      const el = e.target;
      const action = el.getAttribute("data-action");
      const id = el.getAttribute("data-id");
      if (!action || !id) return;

      if (action === "block-section") updateBlock(id, { sectionId: el.value });
      if (action === "block-include-links") updateBlock(id, { includeLinks: el.checked });
    });

    $("ssBlocks").addEventListener("input", (e) => {
      const el = e.target;
      const action = el.getAttribute("data-action");
      const id = el.getAttribute("data-id");
      if (!action || !id) return;

      if (action === "block-label") updateBlock(id, { label: el.value });
      if (action === "block-links") updateBlock(id, { links: el.value });
      if (action === "block-notes") updateBlock(id, { notes: el.value });
    });

    // RSS
    $("rssAdd").addEventListener("click", () => {
      addRssFeed($("rssUrl").value || "");
      $("rssUrl").value = "";
      setStatus("rssStatus", "Feed added.", "ok");
      if (rssState.activeFeedUrl) fetchRss(rssState.activeFeedUrl);
    });

    $("rssRefresh").addEventListener("click", () => fetchRss(rssState.activeFeedUrl));

    $("rssFeeds").addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      const action = btn.getAttribute("data-action");
      const url = btn.getAttribute("data-url");
      if (!action || !url) return;

      if (action === "rss-select") {
        rssState.activeFeedUrl = url;
        saveRssState();
        renderRssFeeds();
        fetchRss(url);
      }
      if (action === "rss-del") {
        removeRssFeed(url);
        setStatus("rssStatus", "Feed removed.", "ok");
      }
    });

    $("rssItems").addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      if (btn.getAttribute("data-action") !== "rss-add-to-gen") return;

      addBlock({
        sectionId: "democracy_watch",
        label: btn.getAttribute("data-title") || "",
        links: btn.getAttribute("data-link") || "",
        includeLinks: false,
        notes: btn.getAttribute("data-summary") || "",
        isGenerated: false
      });

      document.querySelector(".tab[data-tab='substack']")?.click();
      setStatus("ssStatus", "RSS story added as an input block.", "ok");
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    initTabs();
    renderBodySectionDropdown();
    wireEvents();
    hydrateUI();

    if (state.blocks.length === 0 && !(state.body || "").trim()) {
      addBlock();
      setStatus("ssStatus", "Started you with one block.", "ok");
    } else {
      setStatus("ssStatus", "Loaded from localStorage.", "ok");
    }

    if (rssState.activeFeedUrl) fetchRss(rssState.activeFeedUrl);
  });
})();
