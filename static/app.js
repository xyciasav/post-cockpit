(() => {
  // ---------- Storage ----------
  const STORAGE_KEY = "sc_substack_v1";
  const RSS_STORAGE_KEY = "sc_rss_v1";

  // ---------- Sections ----------
  const SECTIONS = [
    { id: "opening", name: "Opening" },
    { id: "democracy_watch", name: "Democracy Watch" },
    { id: "important_read_first", name: "Important / Read First" },
    { id: "community", name: "Community" },
    { id: "call_to_action", name: "Call to Action" },
    { id: "resources_optional", name: "Resources (Optional)" },
    { id: "upcoming_events_optional", name: "Upcoming Events (Optional)" },
    { id: "closing_optional", name: "Closing (Optional)" },
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

    // outputs text keyed by section id
    outputs: Object.fromEntries(SECTIONS.map(s => [s.id, ""])),

    // NEW: only show these output bubbles (order matters)
    outputOrder: [],

    titleOutput: ""
  };

  const DEFAULT_RSS = {
    feeds: [],
    activeFeedUrl: "",
    lastItems: []
  };

  // ---------- Helpers ----------
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

  function safeParseJSON(str) {
    try { return JSON.parse(str); } catch { return null; }
  }

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
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }
  function escapeHtmlAttr(s) {
    return escapeHtml(s).replaceAll('"', "&quot;");
  }

  function sectionName(sectionId) {
    return (SECTIONS.find(s => s.id === sectionId)?.name) || sectionId;
  }

  function toneGuidance(tone) {
    switch (tone) {
      case "urgent":
        return "Tone: urgent, direct, clear. No panic. No exaggeration.";
      case "hopeful":
        return "Tone: hopeful, grounded, practical. Avoid empty optimism.";
      case "angry_safe":
        return "Tone: angry but safe—channel outrage into constructive, lawful action. No insults, hate, or violence.";
      case "firm":
      default:
        return "Tone: firm, serious, confident, community-minded.";
    }
  }

  function lengthGuidance(length) {
    switch (length) {
      case "short":
        return "Length: short. Social-media post length (tight, punchy).";
      case "medium":
        return "Length: medium. About one paragraph (roughly 4–8 sentences).";
      case "long":
        return "Length: long. A few paragraphs (roughly 3–5 short paragraphs).";
      default:
        return "Length: medium.";
    }
  }

  function sectionRules(sectionId) {
    switch (sectionId) {
      case "opening":
        return "Punchy opening, 2–5 sentences. Set context for the issue. Plain text.";
      case "democracy_watch":
        return "Summarize key developments clearly. Short paragraphs. Bullets only if needed. Plain text.";
      case "important_read_first":
        return "Lead with the single most important point. Then 2–5 bullets. Plain text.";
      case "community":
        return "Community updates, mutual aid, local context, wins/needs. 1–3 short paragraphs.";
      case "call_to_action":
        return "Clear asks. Use bullets. Lawful, constructive actions only. No violence.";
      case "resources_optional":
        return "List resources/links with a short context line each. Only use provided links.";
      case "upcoming_events_optional":
        return "List upcoming events from input. Bullets. No invented dates/locations.";
      case "closing_optional":
        return "Short grounding close and reminder to stay involved. 1 paragraph.";
      default:
        return "Write clear, plain-text copy appropriate to this section.";
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
    const content = data?.message?.content ?? "";
    return stripCodeFences(content);
  }

  // ---------- State ----------
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
    })) : [];

    // outputs
    merged.outputs = typeof parsed.outputs === "object" && parsed.outputs
      ? { ...merged.outputs, ...parsed.outputs }
      : merged.outputs;

    // output order (only sections we actually show as bubbles)
    merged.outputOrder = Array.isArray(parsed.outputOrder) ? parsed.outputOrder.filter(x => typeof x === "string") : [];

    merged.titleOutput = typeof parsed.titleOutput === "string" ? parsed.titleOutput : "";

    // ensure output keys exist
    for (const s of SECTIONS) {
      if (!(s.id in merged.outputs)) merged.outputs[s.id] = "";
    }

    // MIGRATION: if outputOrder missing but outputs exist, build it from non-empty outputs
    if (merged.outputOrder.length === 0) {
      const nonEmpty = SECTIONS
        .map(s => s.id)
        .filter(id => (merged.outputs[id] || "").trim().length > 0);
      merged.outputOrder = nonEmpty;
    } else {
      // remove any ids with empty output (keeps UI clean)
      merged.outputOrder = merged.outputOrder.filter(id => (merged.outputs[id] || "").trim().length > 0);
    }

    return merged;
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

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

  function saveRssState() {
    localStorage.setItem(RSS_STORAGE_KEY, JSON.stringify(rssState));
  }

  // ---------- Tabs ----------
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

  // ---------- Substack rendering ----------
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
      empty.innerHTML = `<div class="muted">No extra blocks yet. Click <b>+ Add another block</b>.</div>`;
      container.appendChild(empty);
      return;
    }

    state.blocks.forEach((b, idx) => {
      const card = document.createElement("div");
      card.className = "card block";
      card.setAttribute("draggable", "true");
      card.setAttribute("data-block-id", b.id);

      const sectionOptions = SECTIONS.map(s => (
        `<option value="${s.id}" ${s.id === b.sectionId ? "selected" : ""}>${s.name}</option>`
      )).join("");

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

        <div class="field" style="margin-top:10px;">
          <label>Optional label/title</label>
          <input class="input" type="text" placeholder="e.g., Note, quote, local update"
                 data-action="block-label" data-id="${b.id}" value="${escapeHtmlAttr(b.label || "")}" />
        </div>

        <div class="grid two" style="margin-top:10px;">
          <div class="field">
            <label>Links (one per line)</label>
            <textarea class="input" rows="4" placeholder="https://..."
                      data-action="block-links" data-id="${b.id}">${escapeHtml(b.links || "")}</textarea>
            <label class="checkrow">
              <input type="checkbox" data-action="block-include-links" data-id="${b.id}" ${b.includeLinks ? "checked" : ""} />
              Include links in final output (otherwise research-only)
            </label>
          </div>
          <div class="field">
            <label>Notes (info dump)</label>
            <textarea class="input" rows="4" placeholder="Paste raw notes here..."
                      data-action="block-notes" data-id="${b.id}">${escapeHtml(b.notes || "")}</textarea>
          </div>
        </div>
      `;
      container.appendChild(card);
    });

    wireDragAndDropBlocks();
  }

  // ONLY show bubbles/cards for outputs that exist in outputOrder
  function renderOutputs() {
    const container = $("ssOutput");
    container.innerHTML = "";

    const order = Array.isArray(state.outputOrder) ? state.outputOrder : [];

    if (order.length === 0) {
      const empty = document.createElement("div");
      empty.className = "card empty";
      empty.innerHTML = `<div class="muted">No generated outputs yet. Click <b>Generate sections (AI)</b>.</div>`;
      container.appendChild(empty);
      return;
    }

    order.forEach((secId, idx) => {
      const secName = sectionName(secId);
      const val = (state.outputs?.[secId] || "");

      const card = document.createElement("div");
      card.className = "card output bubble";
      card.setAttribute("draggable", "true");
      card.setAttribute("data-out-id", secId);

      card.innerHTML = `
        <div class="row space">
          <div class="row gap">
            <div class="drag-handle" title="Drag to reorder">⋮⋮</div>
            <div class="pill">${idx + 1}</div>
            <div class="card-title">${escapeHtml(secName)}</div>
          </div>
          <div class="row gap">
            <button class="btn small" data-action="out-up" data-id="${secId}" title="Move up">↑</button>
            <button class="btn small" data-action="out-down" data-id="${secId}" title="Move down">↓</button>
            <button class="btn small" data-action="copy-out" data-id="${secId}">Copy</button>
            <button class="btn small danger" data-action="clear-out" data-id="${secId}">Remove</button>
          </div>
        </div>

        <textarea class="input" rows="10" data-action="edit-output" data-id="${secId}"
          placeholder="(Empty)">${escapeHtml(val)}</textarea>
      `;
      container.appendChild(card);
    });

    wireDragAndDropOutputs();
  }

  // ---------- Substack logic ----------
  function addBlock(prefill = {}) {
    state.blocks.push({
      id: uid(),
      sectionId: prefill.sectionId || "democracy_watch",
      label: prefill.label || "",
      links: prefill.links || "",
      includeLinks: !!prefill.includeLinks,
      notes: prefill.notes || "",
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

  function blocksBySection() {
    const map = Object.fromEntries(SECTIONS.map(s => [s.id, []]));

    const bodyText = (state.body || "").trim();
    if (bodyText) {
      map[state.bodySectionId] = map[state.bodySectionId] || [];
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
      const sid = b.sectionId || "democracy_watch";
      if (!map[sid]) map[sid] = [];
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

  function ensureOutputBubble(secId, moveToTop = true) {
    // Only show sections that have text
    const text = (state.outputs[secId] || "").trim();
    if (!text) return;

    // ensure exists in outputOrder
    state.outputOrder = Array.isArray(state.outputOrder) ? state.outputOrder : [];
    const exists = state.outputOrder.includes(secId);
    if (!exists) state.outputOrder.unshift(secId);

    // optionally move to top (so “new generated section” becomes the bubble you see)
    if (exists && moveToTop) {
      state.outputOrder = state.outputOrder.filter(x => x !== secId);
      state.outputOrder.unshift(secId);
    }

    // remove any ids whose outputs became empty
    state.outputOrder = state.outputOrder.filter(id => (state.outputs[id] || "").trim().length > 0);

    saveState();
  }

  async function generateSections() {
    readTopFields();

    if (!state.issue.trim()) {
      setStatus("ssStatus", "Add an Issue/Topic first.", "warn");
      return;
    }

    const hasAnyInput =
      (state.body || "").trim().length > 0 ||
      state.blocks.length > 0;

    if (!hasAnyInput) {
      setStatus("ssStatus", "Add Body text or at least one block.", "warn");
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
        state.outputs[sec.id] = out.trim();
        ensureOutputBubble(sec.id, true);
        renderOutputs();

        // scroll the newest/updated bubble into view
        const bubble = document.querySelector(`.bubble[data-out-id="${sec.id}"]`);
        bubble?.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch (e) {
        console.error(e);
        setStatus("ssStatus", `Error generating ${sec.name}: ${e.message}`, "err");
        return;
      }
    }

    setStatus("ssStatus", "Done. Outputs updated.", "ok");
  }

  async function generateTitleOptions() {
    readTopFields();

    // Use ONLY what’s currently visible as output bubbles (in order)
    const combined = (state.outputOrder || [])
      .map(id => (state.outputs[id] || "").trim())
      .filter(Boolean)
      .join("\n\n");

    if (!combined.trim()) {
      setStatus("ssStatus", "Generate section outputs first (or type into outputs).", "warn");
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
      combined
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

  async function copyAll() {
    const parts = [];
    for (const id of (state.outputOrder || [])) {
      const txt = (state.outputs[id] || "").trim();
      if (!txt) continue;
      parts.push(`${sectionName(id)}\n${txt}`);
    }
    const joined = parts.join("\n\n---\n\n");
    if (!joined.trim()) {
      setStatus("ssStatus", "Nothing to copy yet.", "warn");
      return;
    }
    const ok = await copyToClipboard(joined);
    setStatus("ssStatus", ok ? "Copied all visible outputs." : "Copy failed.", ok ? "ok" : "err");
  }

  function clearOneOutput(secId) {
    state.outputs[secId] = "";
    state.outputOrder = (state.outputOrder || []).filter(x => x !== secId);
    saveState();
    renderOutputs();
    setStatus("ssStatus", `Removed output: ${sectionName(secId)}`, "ok");
  }

  function clearAllOutputs() {
    for (const s of SECTIONS) state.outputs[s.id] = "";
    state.outputOrder = [];
    saveState();
    renderOutputs();
    setStatus("ssStatus", "Cleared all outputs.", "ok");
  }

  function moveOutput(secId, dir) {
    state.outputOrder = Array.isArray(state.outputOrder) ? state.outputOrder : [];
    const i = state.outputOrder.indexOf(secId);
    if (i < 0) return;
    const j = i + dir;
    if (j < 0 || j >= state.outputOrder.length) return;
    const tmp = state.outputOrder[i];
    state.outputOrder[i] = state.outputOrder[j];
    state.outputOrder[j] = tmp;
    saveState();
    renderOutputs();
  }

  // ---------- Drag & Drop: Blocks ----------
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

  // ---------- Drag & Drop: Outputs ----------
  function wireDragAndDropOutputs() {
    const container = $("ssOutput");
    const cards = Array.from(container.querySelectorAll(".bubble[draggable='true']"));
    if (cards.length === 0) return;

    let dragId = null;

    cards.forEach(card => {
      card.addEventListener("dragstart", (e) => {
        dragId = card.getAttribute("data-out-id");
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
        const targetId = card.getAttribute("data-out-id");
        if (!dragId || !targetId || dragId === targetId) return;

        state.outputOrder = Array.isArray(state.outputOrder) ? state.outputOrder : [];
        const from = state.outputOrder.indexOf(dragId);
        const to = state.outputOrder.indexOf(targetId);
        if (from < 0 || to < 0) return;

        const [moved] = state.outputOrder.splice(from, 1);
        state.outputOrder.splice(to, 0, moved);

        saveState();
        renderOutputs();
        setStatus("ssStatus", "Reordered outputs.", "ok");
      });
    });
  }

  // ---------- RSS (unchanged from your working build) ----------
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
    if (!url) {
      setStatus("rssStatus", "Select a feed first.", "warn");
      return;
    }

    setStatus("rssStatus", "Fetching feed...", "info");
    try {
      const resp = await fetch(`/api/rss/fetch?url=${encodeURIComponent(url)}&limit=30`);
      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(`RSS failed (${resp.status}): ${txt}`);
      }
      const data = await resp.json();
      const items = data.items || [];
      renderRssItems(items, data.feedTitle || "");
      setStatus("rssStatus", `Loaded ${items.length} item(s).`, "ok");
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

  // ---------- Wiring ----------
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
    renderOutputs();

    // RSS
    renderRssFeeds();
    setStatus("rssStatus", "Ready.", "info");
    $("rssActiveTitle").textContent = rssState.activeFeedUrl ? `Feed: ${rssState.activeFeedUrl}` : "No feed selected.";
    renderRssItems(rssState.lastItems || [], "");
  }

  function wireEvents() {
    // Substack
    $("ssIssue").addEventListener("input", () => { readTopFields(); });
    $("ssTone").addEventListener("change", () => { readTopFields(); });
    $("ssLength").addEventListener("change", () => { readTopFields(); });

    $("ssBody").addEventListener("input", () => { readTopFields(); });
    $("ssBodySection").addEventListener("change", () => { readTopFields(); });
    $("ssBodyLinks").addEventListener("input", () => { readTopFields(); });
    $("ssBodyIncludeLinks").addEventListener("change", () => { readTopFields(); });

    $("ssAddBlock").addEventListener("click", () => addBlock());
    $("ssGenerate").addEventListener("click", generateSections);
    $("ssGenTitle").addEventListener("click", generateTitleOptions);
    $("ssCopyAll").addEventListener("click", copyAll);
    $("ssClearOutputs").addEventListener("click", clearAllOutputs);

    $("ssCopyTitle").addEventListener("click", async () => {
      const text = $("ssTitleOutput").value || "";
      if (!text.trim()) {
        setStatus("ssStatus", "No title options to copy.", "warn");
        return;
      }
      const ok = await copyToClipboard(text);
      setStatus("ssStatus", ok ? "Copied title options." : "Copy failed.", ok ? "ok" : "err");
    });

    $("ssTitleOutput").addEventListener("input", () => {
      state.titleOutput = $("ssTitleOutput").value || "";
      saveState();
    });

    // Blocks delegation
    $("ssBlocks").addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      const action = btn.getAttribute("data-action");
      const id = btn.getAttribute("data-id");
      if (!action || !id) return;

      if (action === "block-del") deleteBlock(id);
      if (action === "block-up") moveBlock(id, -1);
      if (action === "block-down") moveBlock(id, 1);
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

    // Outputs delegation
    $("ssOutput").addEventListener("click", async (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      const action = btn.getAttribute("data-action");
      const id = btn.getAttribute("data-id");
      if (!action || !id) return;

      if (action === "out-up") moveOutput(id, -1);
      if (action === "out-down") moveOutput(id, 1);

      if (action === "copy-out") {
        const text = (state.outputs[id] || "").trim();
        if (!text) {
          setStatus("ssStatus", "Output is empty.", "warn");
          return;
        }
        const ok = await copyToClipboard(text);
        setStatus("ssStatus", ok ? `Copied: ${sectionName(id)}` : "Copy failed.", ok ? "ok" : "err");
      }

      if (action === "clear-out") {
        clearOneOutput(id);
      }
    });

    $("ssOutput").addEventListener("input", (e) => {
      const el = e.target;
      const action = el.getAttribute("data-action");
      if (action !== "edit-output") return;
      const id = el.getAttribute("data-id");
      state.outputs[id] = el.value || "";
      // if user empties it manually, remove the bubble
      ensureOutputBubble(id, false);
      renderOutputs();
    });

    // RSS
    $("rssAdd").addEventListener("click", () => {
      const u = $("rssUrl").value || "";
      addRssFeed(u);
      $("rssUrl").value = "";
      setStatus("rssStatus", "Feed added.", "ok");
      if (rssState.activeFeedUrl) fetchRss(rssState.activeFeedUrl);
    });

    $("rssRefresh").addEventListener("click", () => {
      fetchRss(rssState.activeFeedUrl);
    });

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
        renderRssFeeds();
        setStatus("rssStatus", "Feed removed.", "ok");
      }
    });

    $("rssItems").addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      const action = btn.getAttribute("data-action");
      if (action !== "rss-add-to-gen") return;

      const title = btn.getAttribute("data-title") || "";
      const link = btn.getAttribute("data-link") || "";
      const summary = btn.getAttribute("data-summary") || "";

      addBlock({
        sectionId: "democracy_watch",
        label: title,
        links: link ? link : "",
        includeLinks: false,
        notes: summary ? summary : `Story: ${title}`
      });

      document.querySelector(".tab[data-tab='substack']")?.click();
      setStatus("ssStatus", "RSS story added as a block (research-only link by default).", "ok");
    });
  }

  // ---------- Boot ----------
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

    if (rssState.activeFeedUrl) {
      fetchRss(rssState.activeFeedUrl);
    }
  });
})();
