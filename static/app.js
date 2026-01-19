(() => {
  // ---------- Constants ----------
  const STORAGE_KEY = "sc_substack_v1";

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
    blocks: [],
    outputs: Object.fromEntries(SECTIONS.map(s => [s.id, ""])),
    titleOutput: ""
  };

  // ---------- Helpers ----------
  function uid() {
    return Math.random().toString(16).slice(2) + Date.now().toString(16);
  }

  function $(id) {
    return document.getElementById(id);
  }

  function setStatus(msg, kind = "info") {
    const el = $("ssStatus");
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

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function loadState() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const parsed = safeParseJSON(raw);
    if (!parsed || typeof parsed !== "object") return structuredClone(DEFAULT_STATE);

    // Merge with defaults to survive future schema changes
    const merged = structuredClone(DEFAULT_STATE);
    merged.issue = typeof parsed.issue === "string" ? parsed.issue : merged.issue;
    merged.tone = typeof parsed.tone === "string" ? parsed.tone : merged.tone;
    merged.length = typeof parsed.length === "string" ? parsed.length : merged.length;

    merged.blocks = Array.isArray(parsed.blocks) ? parsed.blocks.map(b => ({
      id: b.id || uid(),
      sectionId: b.sectionId || "democracy_watch",
      label: typeof b.label === "string" ? b.label : "",
      links: typeof b.links === "string" ? b.links : "",
      notes: typeof b.notes === "string" ? b.notes : "",
    })) : [];

    merged.outputs = typeof parsed.outputs === "object" && parsed.outputs
      ? { ...merged.outputs, ...parsed.outputs }
      : merged.outputs;

    merged.titleOutput = typeof parsed.titleOutput === "string" ? parsed.titleOutput : "";

    return merged;
  }

  function stripCodeFences(text) {
    if (!text) return "";
    let t = String(text).trim();

    // Remove ```lang ... ``` fences if model wraps output
    if (t.startsWith("```")) {
      // Remove leading fence line
      t = t.replace(/^```[a-zA-Z0-9_-]*\n?/, "");
      // Remove trailing fence
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
      // Fallback
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

  function sectionName(sectionId) {
    return (SECTIONS.find(s => s.id === sectionId)?.name) || sectionId;
  }

  function sectionRules(sectionId) {
    // Minimal, stable formatting guidance per section.
    // Plain text only.
    switch (sectionId) {
      case "opening":
        return [
          "Write a punchy opening paragraph (2–5 sentences).",
          "Set context for the issue/topic.",
          "No lists unless absolutely needed."
        ].join(" ");
      case "democracy_watch":
        return [
          "Summarize key developments clearly.",
          "Prefer short paragraphs. Use bullets only if it improves clarity.",
          "Include only facts present in input."
        ].join(" ");
      case "important_read_first":
        return [
          "Lead with the single most important thing the reader must know.",
          "Then 2–5 bullets with the essentials.",
          "Keep it direct and actionable."
        ].join(" ");
      case "community":
        return [
          "Highlight community updates, mutual aid, local context, wins, needs.",
          "Friendly but serious. 1–3 short paragraphs."
        ].join(" ");
      case "call_to_action":
        return [
          "Make clear asks. Use bullets.",
          "Avoid illegal instructions or calls for violence.",
          "Focus on sustainable actions: boycott targets, mutual aid, showing up, calling reps."
        ].join(" ");
      case "resources_optional":
        return [
          "List helpful links/resources with 1 short line of context each.",
          "Only use links provided in input. Do not invent links."
        ].join(" ");
      case "upcoming_events_optional":
        return [
          "List upcoming events from input. Bullets.",
          "If no dates/locations are provided, do not invent them."
        ].join(" ");
      case "closing_optional":
        return [
          "Close with a short grounding message and a reminder to stay involved.",
          "1 short paragraph. No slogans unless present in input."
        ].join(" ");
      default:
        return "Write clear, plain-text copy appropriate to this section.";
    }
  }

  function buildSystemPrompt() {
    return [
      "You are an assistant helping draft a newsletter.",
      "Output MUST be plain text (no JSON).",
      "Be factual. Don’t invent names/dates/places/claims not present in input.",
      "If something is missing, leave it out rather than guessing.",
      "No hate. No calls for violence.",
      "Do not include markdown code fences."
    ].join(" ");
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
        return "Length: short. Keep it tight.";
      case "long":
        return "Length: long. Add helpful structure and detail, but stay concise.";
      case "medium":
      default:
        return "Length: medium. Balanced clarity and brevity.";
    }
  }

  function blocksBySection() {
    const map = Object.fromEntries(SECTIONS.map(s => [s.id, []]));
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
      return [
        `BLOCK ${idx + 1}:`,
        title ? `Title: ${title}` : "Title: (none)",
        links ? `Links:\n${links}` : "Links: (none)",
        notes ? `Notes:\n${notes}` : "Notes: (none)",
        ""
      ].join("\n");
    }).join("\n");
  }

  async function callAI(messages) {
    // Use Flask proxy route (which forwards to Ollama)
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

  // ---------- Rendering ----------
  function renderBlocks() {
    const container = $("ssBlocks");
    container.innerHTML = "";

    if (state.blocks.length === 0) {
      const empty = document.createElement("div");
      empty.className = "card empty";
      empty.innerHTML = `
        <div class="muted">No blocks yet. Click <b>+ Add another block</b>.</div>
      `;
      container.appendChild(empty);
      return;
    }

    state.blocks.forEach((b, idx) => {
      const card = document.createElement("div");
      card.className = "card block";

      const sectionOptions = SECTIONS.map(s => (
        `<option value="${s.id}" ${s.id === b.sectionId ? "selected" : ""}>${s.name}</option>`
      )).join("");

      card.innerHTML = `
        <div class="row space">
          <div class="row gap">
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
          <input class="input" type="text" placeholder="e.g., Key point, quote, local update"
                 data-action="block-label" data-id="${b.id}" value="${escapeHtmlAttr(b.label || "")}" />
        </div>

        <div class="grid two" style="margin-top:10px;">
          <div class="field">
            <label>Links (one per line)</label>
            <textarea class="input" rows="4" placeholder="https://..."
                      data-action="block-links" data-id="${b.id}">${escapeHtml(b.links || "")}</textarea>
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
  }

  function renderOutputs() {
    const container = $("ssOutput");
    container.innerHTML = "";

    SECTIONS.forEach(sec => {
      const val = (state.outputs?.[sec.id] || "");
      const ready = val.trim().length > 0;

      const card = document.createElement("div");
      card.className = "card output";

      card.innerHTML = `
        <div class="row space">
          <div class="row gap">
            <div class="ready ${ready ? "on" : "off"}" title="${ready ? "Ready" : "Empty"}"></div>
            <div class="card-title">${sec.name}</div>
          </div>
          <button class="btn small" data-action="copy-section" data-section="${sec.id}">Copy</button>
        </div>
        <textarea class="input" rows="8" data-action="edit-output" data-section="${sec.id}"
          placeholder="(Empty) Generate to fill this section...">${escapeHtml(val)}</textarea>
      `;
      container.appendChild(card);
    });

    $("ssTitleOutput").value = state.titleOutput || "";
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

  // ---------- Events ----------
  function addBlock() {
    state.blocks.push({
      id: uid(),
      sectionId: "democracy_watch",
      label: "",
      links: "",
      notes: ""
    });
    saveState();
    renderBlocks();
    setStatus("Block added.", "ok");
  }

  function deleteBlock(id) {
    state.blocks = state.blocks.filter(b => b.id !== id);
    saveState();
    renderBlocks();
    setStatus("Block deleted.", "ok");
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

  function updateOutput(sectionId, text) {
    state.outputs[sectionId] = text;
    saveState();
  }

  function readTopFields() {
    state.issue = $("ssIssue").value || "";
    state.tone = $("ssTone").value || "firm";
    state.length = $("ssLength").value || "medium";
    saveState();
  }

  async function generateSections() {
    readTopFields();

    if (!state.issue.trim()) {
      setStatus("Add an Issue/Topic first.", "warn");
      return;
    }
    if (state.blocks.length === 0) {
      setStatus("Add at least one block.", "warn");
      return;
    }

    const grouped = blocksBySection();
    const sectionsToGenerate = SECTIONS.filter(s => grouped[s.id] && grouped[s.id].length > 0);

    setStatus(`Generating ${sectionsToGenerate.length} section(s)...`, "info");

    // Generate sequentially for stability (avoids spiking local LLM)
    for (let idx = 0; idx < sectionsToGenerate.length; idx++) {
      const sec = sectionsToGenerate[idx];
      setStatus(`Generating: ${sec.name} (${idx + 1}/${sectionsToGenerate.length})...`, "info");

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
        "Write the final section copy now."
      ].join("\n");

      const messages = [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: userPrompt }
      ];

      try {
        const out = await callAI(messages);
        state.outputs[sec.id] = out.trim();
        saveState();
        renderOutputs();
      } catch (e) {
        console.error(e);
        setStatus(`Error generating ${sec.name}: ${e.message}`, "err");
        return;
      }
    }

    setStatus("Done. Outputs updated.", "ok");
  }

  async function generateTitleOptions() {
    readTopFields();

    const combined = SECTIONS
      .map(s => state.outputs[s.id]?.trim())
      .filter(Boolean)
      .join("\n\n");

    if (!combined.trim()) {
      setStatus("Generate section outputs first (or type into outputs).", "warn");
      return;
    }

    setStatus("Generating 6 subject/title options...", "info");

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
      setStatus("Title options ready.", "ok");
    } catch (e) {
      console.error(e);
      setStatus(`Error generating titles: ${e.message}`, "err");
    }
  }

  async function copyAll() {
    // Compose in a consistent order, only include non-empty sections
    const parts = [];
    for (const s of SECTIONS) {
      const txt = (state.outputs[s.id] || "").trim();
      if (!txt) continue;
      parts.push(`${s.name}\n${txt}`);
    }
    const joined = parts.join("\n\n---\n\n");
    if (!joined.trim()) {
      setStatus("Nothing to copy yet.", "warn");
      return;
    }
    const ok = await copyToClipboard(joined);
    setStatus(ok ? "Copied all sections." : "Copy failed.", ok ? "ok" : "err");
  }

  function wireEvents() {
    // Top fields
    $("ssIssue").addEventListener("input", () => { readTopFields(); });
    $("ssTone").addEventListener("change", () => { readTopFields(); });
    $("ssLength").addEventListener("change", () => { readTopFields(); });

    // Buttons
    $("ssAddBlock").addEventListener("click", addBlock);
    $("ssGenerate").addEventListener("click", generateSections);
    $("ssGenTitle").addEventListener("click", generateTitleOptions);
    $("ssCopyAll").addEventListener("click", copyAll);

    $("ssCopyTitle").addEventListener("click", async () => {
      const text = $("ssTitleOutput").value || "";
      if (!text.trim()) {
        setStatus("No title options to copy.", "warn");
        return;
      }
      const ok = await copyToClipboard(text);
      setStatus(ok ? "Copied title options." : "Copy failed.", ok ? "ok" : "err");
    });

    $("ssTitleOutput").addEventListener("input", () => {
      state.titleOutput = $("ssTitleOutput").value || "";
      saveState();
    });

    // Blocks container (event delegation)
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

      if (action === "block-section") {
        updateBlock(id, { sectionId: el.value });
        setStatus(`Block section → ${sectionName(el.value)}`, "ok");
      }
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

    // Outputs container
    $("ssOutput").addEventListener("click", async (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      const action = btn.getAttribute("data-action");
      if (action !== "copy-section") return;

      const secId = btn.getAttribute("data-section");
      const text = (state.outputs[secId] || "").trim();
      if (!text) {
        setStatus("Section is empty.", "warn");
        return;
      }
      const ok = await copyToClipboard(text);
      setStatus(ok ? `Copied: ${sectionName(secId)}` : "Copy failed.", ok ? "ok" : "err");
    });

    $("ssOutput").addEventListener("input", (e) => {
      const el = e.target;
      const action = el.getAttribute("data-action");
      if (action !== "edit-output") return;
      const secId = el.getAttribute("data-section");
      updateOutput(secId, el.value || "");
      // keep status quiet for edits
    });
  }

  function hydrateUIFromState() {
    $("ssIssue").value = state.issue || "";
    $("ssTone").value = state.tone || "firm";
    $("ssLength").value = state.length || "medium";
    $("ssTitleOutput").value = state.titleOutput || "";

    renderBlocks();
    renderOutputs();
  }

  // ---------- Boot ----------
  let state = loadState();

  // Ensure outputs has all keys
  for (const s of SECTIONS) {
    if (!(s.id in state.outputs)) state.outputs[s.id] = "";
  }

  document.addEventListener("DOMContentLoaded", () => {
    initTabs();
    wireEvents();
    hydrateUIFromState();

    if (state.blocks.length === 0) {
      // Start with one default block for convenience, but do not force if user saved none
      // Keep minimal: only add if truly empty and no prior usage.
      addBlock();
      setStatus("Started you with one block.", "ok");
    } else {
      setStatus("Loaded from localStorage.", "ok");
    }
  });
})();
