// =============================
// Social Cockpit (Bluesky-first)
// =============================

// -------- Storage keys --------
const LS_SETTINGS  = "sc_settings_v1";
const LS_SIGNALS   = "sc_signals_v1";
const LS_DRAFTS    = "sc_drafts_v1";
const LS_CAMPAIGNS = "sc_campaigns_v1";
const LS_METRICS   = "sc_metrics_v1";
const LS_SCHEDULE = "sc_schedule_v1";
const LS_SUBSTACK = "sc_substack_v1";
let schedule = []; // set after loadJson exists




// -------- Defaults --------
const DEFAULT_SETTINGS = {
  rssFeeds: [
    { name: "NPR Politics", url: "https://feeds.npr.org/1014/rss.xml", enabled: true }
  ],
  hashtagPacks: [
    { name: "Protest", tags: ["RageForDemocracyCA","WeThePeople","Democracy","Protest","NoKings","Solidarity"] },
    { name: "Civics Club", tags: ["CivicsClub","KnowYourRights","WeThePeople","Democracy","Community"] },
    { name: "Mutual Aid", tags: ["MutualAid","CommunityCare","NeighborsHelpingNeighbors","Solidarity","LocalAction"] }
  ],
  boiler: {
    ctas: [
      "Show up. Bring a friend.",
      "RSVP and share this.",
      "Call your reps. Be loud, be polite, be persistent.",
      "If you can’t attend, amplify this post."
    ],
    closers: [
      "We keep each other safe.",
      "The fight is up, not around us.",
      "If we don’t act, nothing changes."
    ]
  },
  bluesky: { maxChars: 300, defaultCount: 10, linkPolicy: "some" }
};

const TEMPLATES = [
  { id: "headline_why", name: "Headline → why it matters" },
  { id: "cta_now", name: "Call to action (do something now)" },
  { id: "myth_fact", name: "Myth vs Fact" },
  { id: "local_event", name: "Local event push" },
  { id: "rally", name: "Short rally cry" },
  { id: "community_win", name: "Community win / recap" }
];

function chooseVar(arr, i){
  if (!arr || !arr.length) return "";
  return arr[i % arr.length];
}

const HOOKS = [
  "This is happening now.",
  "Pay attention:",
  "Here’s the point:",
  "This matters for all of us.",
  "Heads up:",
  "We can’t normalize this."
];

const WHY_LINES = [
  "Unchecked power becomes policy.",
  "When leaders ignore limits, rights erode fast.",
  "Accountability is what keeps democracy real.",
  "Authoritarianism grows when institutions cave.",
  "Rules don’t matter if no one enforces them.",
  "This is how ‘exceptions’ become the norm."
];

const PROMPTS = [
  "Read it. Share it.",
  "Talk to your neighbors about this.",
  "Don’t let this slide by quietly.",
  "Save this. Bring it up at work/school.",
  "If this worries you, act with us.",
  "Show up locally — that’s leverage."
];


const $ = (id) => document.getElementById(id);

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}
function saveJson(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
function nowMs(){ return Date.now(); }

function toast(msg){
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = "toast show";
  setTimeout(() => el.className = "toast", 1200);
}

let substack = loadJson(LS_SUBSTACK, {
  issue: "",
  tone: "urgent",
  length: "medium",
  blocks: [
    { id:`ss_${nowMs()}_0`, section:"opening", title:"", links:"", notes:"" }
  ],
  outputs: {},   // sectionId -> text
  titleOptions: ""
});


async function copyToClipboard(text){
  text = text || "";

  // Preferred: modern clipboard (requires HTTPS or localhost)
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      toast("Copied!");
      return true;
    }
  } catch (e) {
    // fall through to fallback
  }

  // Fallback: works on HTTP in most browsers
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "0";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);

    toast(ok ? "Copied!" : "Copy failed");
    return ok;
  } catch (e) {
    toast("Copy failed");
    return false;
  }
}

function normalizeTags(tags){
  return (tags || [])
    .map(t => String(t||"").trim())
    .filter(Boolean)
    .map(t => t.replace(/^#+/, ""));
}

function hashtagString(tags){
  const uniq = [...new Set(normalizeTags(tags))];
  return uniq.map(t => `#${t}`).join(" ");
}

function safeTrim(x){ return String(x||"").trim(); }

function escapeHtml(str){
  return String(str ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
function escapeAttr(str){ return escapeHtml(str).replaceAll("\n"," "); }

function scoreEntry(e){
  // weight reposts/replies higher
  return (Number(e.likes)||0) + (Number(e.reposts)||0)*2 + (Number(e.replies)||0)*2;
}

function extractHashtags(text){
  const m = (text || "").match(/#[A-Za-z0-9_]+/g) || [];
  return [...new Set(m.map(x => x.toLowerCase()))];
}

// -------- App state --------
let settings  = loadJson(LS_SETTINGS, JSON.parse(JSON.stringify(DEFAULT_SETTINGS)));
let signals   = loadJson(LS_SIGNALS, []);
let drafts    = loadJson(LS_DRAFTS, []);
let campaigns = loadJson(LS_CAMPAIGNS, []);
let metrics   = loadJson(LS_METRICS, []);
schedule = loadJson(LS_SCHEDULE, []);


let lastGeneratedDrafts = [];   // unsaved studio output
let lastCampaignDrafts = [];    // unsaved campaign output

// -------- Tabs --------
function initTabs(){
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      $(btn.dataset.tab).classList.add("active");
    });
  });
}

function coerceDraftText(x){
  if (typeof x === "string") return x.trim();

  if (x && typeof x === "object") {
    // common field names different models/prompts return
    const pick =
      x.text ?? x.post ?? x.content ?? x.caption ?? x.message ?? x.output ?? "";

    if (typeof pick === "string") return pick.trim();

    // sometimes nested like { message: { content: "..." } }
    const nested = x.message?.content;
    if (typeof nested === "string") return nested.trim();

    // last resort (don’t produce [object Object])
    return JSON.stringify(x);
  }

  return String(x ?? "").trim();
}

    function ensureNonEmptyDraft(x, i){
  // coerce to string
  let t = coerceDraftText(x);

  // if still empty, try JSON for objects
  if (!t && x && typeof x === "object") {
    try { t = JSON.stringify(x); } catch {}
  }

  // if still empty, give a visible placeholder (never blank)
  if (!t) t = `⚠️ Draft ${i+1} came back empty. Click Generate with AI again.`;

  return t.trim();
}

// -------- Feed Desk (RSS) --------
async function loadRss(){
  const enabled = (settings.rssFeeds || []).filter(f => f.enabled);
  const limit = Number($("rssLimit").value) || 12;

  $("rssCards").innerHTML = `<div class="muted small">Loading…</div>`;

  const r = await fetch("/api/rss", {
    method:"POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ feeds: enabled, limit })
  });
  const data = await r.json();

  const items = (data.items || []).filter(x => x.title && x.link && !x.error);
  const wrap = $("rssCards");
  wrap.innerHTML = "";

  if (!items.length){
    wrap.innerHTML = `<div class="item"><div class="muted">No items found. Check RSS feeds in Settings.</div></div>`;
    return;
  }

  items.forEach(it => {
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="muted small">${escapeHtml(it.feed || "")}</div>
      <b style="display:block;margin:6px 0 8px 0;">${escapeHtml(it.title)}</b>
      <div class="row">
        <a href="${escapeAttr(it.link)}" target="_blank" rel="noreferrer"><button>Open</button></a>
        <button class="primary saveSig">Save Signal</button>
      </div>
    `;
    div.querySelector(".saveSig").onclick = () => saveSignal({
      title: it.title,
      source: it.feed || "",
      link: it.link,
      published: it.published || ""
    });
    wrap.appendChild(div);
  });
}

function saveSignal({title, source, link, published}){
  const sig = {
    id: `sig_${nowMs()}_${Math.random().toString(16).slice(2)}`,
    title: safeTrim(title),
    source: safeTrim(source),
    link: safeTrim(link),
    published: safeTrim(published),
    notes: "",
    tags: [],
    savedAt: nowMs()
  };
  signals.unshift(sig);
  saveJson(LS_SIGNALS, signals);
  renderSignals();
  renderStudioSignalSelect();
}

function renderSignals(){
  const q = safeTrim($("signalSearch").value).toLowerCase();
  const wrap = $("signalList");
  wrap.innerHTML = "";

  const filtered = signals.filter(s => {
    if (!q) return true;
    return (s.title||"").toLowerCase().includes(q)
      || (s.source||"").toLowerCase().includes(q)
      || (s.link||"").toLowerCase().includes(q);
  });

  if (!filtered.length){
    wrap.innerHTML = `<div class="item"><div class="muted">No saved signals yet.</div></div>`;
    return;
  }

  filtered.forEach(s => {
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="meta">
        <span class="pill">${escapeHtml(s.source || "Source")}</span>
        <span class="pill">${new Date(s.savedAt).toLocaleDateString()}</span>
      </div>
      <b style="display:block;margin:6px 0 6px 0;">${escapeHtml(s.title)}</b>
      <div class="muted small">${escapeHtml(s.link)}</div>
      <div class="row">
        <a href="${escapeAttr(s.link)}" target="_blank" rel="noreferrer"><button>Open</button></a>
        <button class="primary draftFrom">Draft from this</button>
        <button class="delSig danger">Delete</button>
      </div>
    `;
    div.querySelector(".draftFrom").onclick = () => {
      document.querySelector('.tab[data-tab="studio"]').click();
      $("studioSourceMode").value = "signal";
      syncStudioSourceMode();
      $("studioSignalSelect").value = s.id;
      $("studioNotes").value = s.notes || "";
      updateStudioPills();
    };
    div.querySelector(".delSig").onclick = () => {
      signals = signals.filter(x => x.id !== s.id);
      saveJson(LS_SIGNALS, signals);
      renderSignals();
      renderStudioSignalSelect();
    };
    wrap.appendChild(div);
  });
}

// -------- Post Studio --------
function renderTemplateSelects(){
  const studioSel = $("studioTemplate");
  const metricSel = $("metricTemplate");
  studioSel.innerHTML = "";
  metricSel.innerHTML = `<option value="">(optional)</option>`;

  TEMPLATES.forEach(t => {
    const o = document.createElement("option");
    o.value = t.id;
    o.textContent = t.name;
    studioSel.appendChild(o);

    const m = document.createElement("option");
    m.value = t.id;
    m.textContent = t.name;
    metricSel.appendChild(m);
  });

  studioSel.value = "headline_why";
}

const SS_SECTIONS = [
  ["opening", "Opening"],
  ["democracy_watch", "Democracy Watch"],
  ["important", "Important (Read First)"],
  ["community", "Community Section"],
  ["cta", "Call to Action"],
  ["resources", "Resources / Know Your Rights (optional)"],
  ["upcoming", "Upcoming Events (optional)"],
  ["closing", "Closing (optional)"],
];

function ssSave(){ saveJson(LS_SUBSTACK, substack); }

function ssSectionGuide(id){
  switch(id){
    case "opening": return "2–5 short paragraphs. Hook + why this email exists. Human, direct.";
    case "democracy_watch": return "2–6 bullets. Each bullet: what happened + why it matters (1 sentence).";
    case "important": return "Numbered list 3–8 items. Each item: headline-style + 1 sentence. Skimmable.";
    case "community": return "2–6 bullets about local community actions/wins/needs. Concrete and inviting.";
    case "cta": return "3–7 bullets with verbs. Include RSVP/show up/share/call reps/donate/join.";
    case "resources": return "3–8 bullets. Resource name + one line. Include links if provided.";
    case "upcoming": return "Event bullets with date/time/location/RSVP if provided. If missing, say TBD.";
    case "closing": return "1–3 short paragraphs: gratitude + reminder + next step.";
    default: return "Keep it concise and clear.";
  }
}

function ssRender(){
  const blocksWrap = $("ssBlocks");
  const outWrap = $("ssOutput");
  if (!blocksWrap || !outWrap) return;

  $("ssIssue").value = substack.issue || "";
  $("ssTone").value = substack.tone || "urgent";
  $("ssLength").value = substack.length || "medium";

  // Blocks
  blocksWrap.innerHTML = "";
  substack.blocks.forEach((b, idx) => {
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="row between">
        <div class="meta">
          <span class="pill">Block ${idx+1}</span>
          <select class="ssSection"></select>
          <input class="ssTitle" placeholder="(optional) label" style="min-width:220px;" />
        </div>
        <div class="row">
          <button class="ssUp">↑</button>
          <button class="ssDown">↓</button>
          <button class="danger ssDel">Delete</button>
        </div>
      </div>
      <div class="grid" style="margin-top:10px; gap:10px;">
        <div>
          <div class="muted small">Links (one per line)</div>
          <textarea class="ssLinks" rows="3" placeholder="https://..."></textarea>
        </div>
        <div>
          <div class="muted small">Raw notes</div>
          <textarea class="ssNotes" rows="4" placeholder="Dump your thoughts here..."></textarea>
        </div>
      </div>
    `;

    const sel = div.querySelector(".ssSection");
    sel.innerHTML = SS_SECTIONS.map(([id,name]) =>
      `<option value="${id}" ${id===b.section?"selected":""}>${name}</option>`
    ).join("");

    div.querySelector(".ssTitle").value = b.title || "";
    div.querySelector(".ssLinks").value = b.links || "";
    div.querySelector(".ssNotes").value = b.notes || "";

    sel.onchange = () => { b.section = sel.value; ssSave(); };
    div.querySelector(".ssTitle").oninput = (e)=>{ b.title = e.target.value; ssSave(); };
    div.querySelector(".ssLinks").oninput = (e)=>{ b.links = e.target.value; ssSave(); };
    div.querySelector(".ssNotes").oninput = (e)=>{ b.notes = e.target.value; ssSave(); };

    div.querySelector(".ssDel").onclick = () => {
      substack.blocks = substack.blocks.filter(x => x.id !== b.id);
      if (!substack.blocks.length){
        substack.blocks.push({ id:`ss_${nowMs()}_0`, section:"opening", title:"", links:"", notes:"" });
      }
      ssSave(); ssRender();
    };
    div.querySelector(".ssUp").onclick = () => {
      if (idx===0) return;
      [substack.blocks[idx-1], substack.blocks[idx]] = [substack.blocks[idx], substack.blocks[idx-1]];
      ssSave(); ssRender();
    };
    div.querySelector(".ssDown").onclick = () => {
      if (idx===substack.blocks.length-1) return;
      [substack.blocks[idx+1], substack.blocks[idx]] = [substack.blocks[idx], substack.blocks[idx+1]];
      ssSave(); ssRender();
    };

    blocksWrap.appendChild(div);
  });

  // Outputs
  outWrap.innerHTML = "";
  SS_SECTIONS.forEach(([id, name]) => {
    const text = substack.outputs?.[id] || "";
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="row between">
        <div class="meta">
          <span class="pill">${escapeHtml(name)}</span>
          <span class="pill ${text ? "ok":"warn"}">${text ? "ready":"empty"}</span>
        </div>
        <div class="row">
          <button class="copy">Copy</button>
        </div>
      </div>
      <textarea rows="7" class="ssOut"></textarea>
    `;
    const ta = div.querySelector(".ssOut");
    ta.value = text;
    ta.oninput = () => { substack.outputs[id] = ta.value; ssSave(); };

    div.querySelector(".copy").onclick = () => copyToClipboard(ta.value || "");
    outWrap.appendChild(div);
  });

  // optional: show titleOptions somewhere if you add a textbox
}

async function ssGenerate(){
  const usable = substack.blocks.filter(b => (b.notes||"").trim() || (b.links||"").trim());
  if (!usable.length) return alert("Add at least one block with notes or links.");

  $("ssStatus").textContent = "Generating sections…";
  $("ssGenerate").disabled = true;

  try{
    // group by section
    const by = {};
    usable.forEach(b => {
      if (!by[b.section]) by[b.section] = [];
      by[b.section].push(b);
    });

    const system = [
      "You are an editor for a Substack newsletter for a local pro-democracy community group.",
      "Be factual. Do NOT invent names, dates, places, or claims not present in the input.",
      "No hate. No calls for violence. Keep language firm but safe.",
      "Output clean text for Substack. Use bullets/numbering when requested."
    ].join(" ");

    for (const sectionId of Object.keys(by)){
      const items = by[sectionId];
      const raw = items.map((b,i)=> {
        const t = (b.title||"").trim();
        const L = (b.links||"").trim();
        const N = (b.notes||"").trim();
        return [
          `ITEM ${i+1}${t?` — ${t}`:""}`,
          L ? `Links:\n${L}` : "",
          N ? `Notes:\n${N}` : ""
        ].filter(Boolean).join("\n");
      }).join("\n\n---\n\n");

      const user = [
        substack.issue ? `ISSUE: ${substack.issue}` : "",
        `TONE: ${substack.tone}`,
        `LENGTH: ${substack.length}`,
        `SECTION: ${SS_SECTIONS.find(x=>x[0]===sectionId)?.[1] || sectionId}`,
        "",
        "SECTION RULES:",
        ssSectionGuide(sectionId),
        "",
        "RAW INPUT:",
        raw
      ].filter(Boolean).join("\n");

      const out = stripCodeFences(await aiGenerate(system, user)); // uses your existing aiGenerate()
      substack.outputs[sectionId] = (out || "").trim();
      ssSave();
      ssRender();
    }

    $("ssStatus").textContent = "Done.";
    toast("Sections generated");
  } catch(e){
    $("ssStatus").textContent = "";
    alert("Substack generation failed: " + (e?.message || e));
  } finally {
    $("ssGenerate").disabled = false;
  }
}

async function ssGenerateTitle(){
  const combined = SS_SECTIONS.map(([id,name]) => {
    const t = (substack.outputs?.[id] || "").trim();
    return t ? `## ${name}\n${t}` : "";
  }).filter(Boolean).join("\n\n");

  if (!combined) return alert("Generate sections first.");

  $("ssStatus").textContent = "Generating title options…";

  try{
    const system = "You write Substack subject lines. Return only a numbered list of 6 options. No extra commentary.";
    const user = [
      substack.issue ? `ISSUE: ${substack.issue}` : "",
      "Generate 6 subject line options. Punchy, not clickbait. Reflect urgency and local organizing.",
      "",
      combined
    ].join("\n");

    const out = stripCodeFences(await aiGenerate(system, user));
    await copyToClipboard(out.trim());
    toast("Title options copied");
    $("ssStatus").textContent = "Title options copied to clipboard.";
  } catch(e){
    $("ssStatus").textContent = "";
    alert("Title generation failed: " + (e?.message || e));
  }
}


function renderStudioSignalSelect(){
  const sel = $("studioSignalSelect");
  sel.innerHTML = "";
  if (!signals.length){
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "(No signals saved yet)";
    sel.appendChild(opt);
    return;
  }

  signals.forEach(s => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = `${(s.source||"").slice(0,22)} • ${(s.title||"").slice(0,80)}`;
    sel.appendChild(opt);
  });
}

function renderPackChecks(){
  const wrapA = $("packChecks");
  const wrapB = $("campPackChecks");
  wrapA.innerHTML = "";
  wrapB.innerHTML = "";

  (settings.hashtagPacks || []).forEach((p, idx) => {
    const idA = `pack_${idx}`;
    const idB = `camp_pack_${idx}`;

    const elA = document.createElement("label");
    elA.className = "check";
    elA.innerHTML = `<input type="checkbox" data-pack="${idx}" id="${idA}" /> ${escapeHtml(p.name)}`;
    wrapA.appendChild(elA);

    const elB = document.createElement("label");
    elB.className = "check";
    elB.innerHTML = `<input type="checkbox" data-pack="${idx}" id="${idB}" /> ${escapeHtml(p.name)}`;
    wrapB.appendChild(elB);
  });
}

function getSelectedPackTags(prefix){
  const tags = [];
  document.querySelectorAll(`input[id^="${prefix}"]`).forEach(cb => {
    if (!cb.checked) return;
    const idx = Number(cb.dataset.pack);
    const pack = (settings.hashtagPacks || [])[idx];
    if (pack?.tags?.length) tags.push(...pack.tags);
  });
  return normalizeTags(tags);
}

function syncStudioSourceMode(){
  const mode = $("studioSourceMode").value;
  $("studioSignalPick").style.display = mode === "signal" ? "" : "none";
  $("studioManualPick").style.display = mode === "manual" ? "" : "none";
  updateStudioPills();
}

function syncPlatformOptions(){
  const p = $("studioPlatform").value;
  $("bskyOptions").style.display = p === "bluesky" ? "" : "none";
  $("igOptions").style.display = p === "instagram" ? "" : "none";
}

function updateStudioPills(){
  const el = $("studioPills");
  if (!el) return;

  const mode = $("studioSourceMode").value;
  let hasSource = false;
  if (mode === "signal") hasSource = !!$("studioSignalSelect").value;
  if (mode === "manual") hasSource = safeTrim($("studioManualText").value).length > 0;

  const hasPacks = getSelectedPackTags("pack_").length > 0;

  const pills = [
    { label: "Source", ok: hasSource },
    { label: "Hashtags", ok: hasPacks }
  ];

  el.innerHTML = pills.map(p => `<span class="pill ${p.ok ? "ok" : "warn"}">${p.label}</span>`).join("");
}

function getStudioContext(){
  const mode = $("studioSourceMode").value;
  const notes = safeTrim($("studioNotes").value);
  if (mode === "manual"){
    return {
      title: "",
      source: "",
      link: "",
      base: safeTrim($("studioManualText").value),
      notes
    };
  }

  const sigId = $("studioSignalSelect").value;
  const s = signals.find(x => x.id === sigId);
  if (!s) return { title:"", source:"", link:"", base:"", notes };

  return {
    title: s.title || "",
    source: s.source || "",
    link: s.link || "",
    base: `${s.title || ""}${s.source ? ` (${s.source})` : ""}${s.link ? `\n${s.link}` : ""}`.trim(),
    notes
  };
}

function pickOne(arr){
  if (!arr || !arr.length) return "";
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildDraftText({platform, templateId, tone, context, tags, linkPolicy, linkOverride, index, total, varIndex}){
  const max = settings.bluesky.maxChars || 300;
  const tagStr = hashtagString(tags);

  // index is used for link policy; varIndex is used for variation choices
  const i  = Number.isFinite(index) ? index : 0;
  const vi = Number.isFinite(varIndex) ? varIndex : i;

  const title = context.title || context.base || "";
  const src = context.source ? ` (${context.source})` : "";
  const link = safeTrim(linkOverride || context.link || "");

  // Deterministic variation across drafts (instead of random repeats)
  const cta    = chooseVar(settings.boiler?.ctas || [], vi) || "Show up. Bring a friend.";
  const closer = chooseVar(settings.boiler?.closers || [], vi) || "The fight is up, not around us.";

  // Tone lead lines (varies by draft)
  const toneLeads = {
    plain:  [""],
    urgent: HOOKS,
    angry:  [
      "I’m furious — and we’re not looking away.",
      "Enough. We’re paying attention.",
      "This should alarm all of us.",
      "We’re done pretending this is normal."
    ],
    hopeful: [
      "We can still win this.",
      "Hope is a verb. Let’s act.",
      "We’re not powerless — we organize.",
      "We’ve beat worse. Together."
    ]
  };

  const lead = chooseVar(toneLeads[tone] || [""], vi);
  const leadLine = lead ? `${lead}\n` : "";

  const notes = safeTrim(context.notes);

  // ---- template bodies ----
  let body = "";

  if (templateId === "headline_why"){
    const why = chooseVar(WHY_LINES, vi) || "Unchecked power becomes policy.";
    const prompt = chooseVar(PROMPTS, vi) || "Read it. Share it.";

    // include notes sometimes so drafts differ + you get local angle
    const localLine = (notes && (vi % 3 === 0)) ? `\n\nLocal angle: ${notes}` : "";

    body = `${leadLine}${title}${src}\n\nWhy it matters: ${why}\n\n${prompt}${localLine}`.trim();

  } else if (templateId === "cta_now"){
    const opener = chooseVar([
      "Quick action:",
      "If you can do one thing today:",
      "Do something now:",
      "Small step, real impact:"
    ], vi);
    body = `${leadLine}${title}${src}\n\n${opener} ${cta}`.trim();

  } else if (templateId === "myth_fact"){
    const myth = chooseVar([
      "“This is normal.”",
      "“It can’t happen here.”",
      "“It doesn’t affect me.”",
      "“Someone else will handle it.”"
    ], vi);

    const fact = chooseVar([
      "It escalates when we stay quiet.",
      "It spreads when there’s no pushback.",
      "Rights don’t protect themselves.",
      "Complacency is the permission slip."
    ], vi);

    body = `${leadLine}MYTH: ${myth}\nFACT: ${fact}\n\n${cta}`.trim();

  } else if (templateId === "local_event"){
    const opener = chooseVar([
      "Local action matters.",
      "This is how we build power.",
      "Show up locally — it works.",
      "Community is the leverage."
    ], vi);

    const detailLine = (notes && (vi % 2 === 0)) ? `\n\nNotes: ${notes}` : "";
    body = `${leadLine}${opener}\n\n${cta}\n\n${closer}${detailLine}`.trim();

  } else if (templateId === "rally"){
    const chant = chooseVar([
      "Democracy vs. authoritarianism.",
      "No kings. No fear. No silence.",
      "Rights are won by showing up.",
      "We protect each other."
    ], vi);

    body = `${leadLine}${chant}\n\nWe choose democracy.\n\n${cta}`.trim();

  } else if (templateId === "community_win"){
    const win = chooseVar([
      "Community is the antidote.",
      "Mutual aid is what democracy looks like.",
      "We showed up — and it mattered.",
      "This is how we take care of each other."
    ], vi);

    const ask = chooseVar([
      "Send a photo or a short clip — we’ll share community highlights.",
      "Got pics from this week? Drop them in the group / email them over.",
      "If you were there, share one moment. It helps grow the movement."
    ], vi);

    body = `${leadLine}${win}\n\n${ask}\n\n${closer}`.trim();

  } else {
    body = `${leadLine}${title}\n\n${cta}`.trim();
  }

  // ---- platform-specific assembly ----
  if (platform === "instagram"){
    const igCTA = safeTrim($("igCTA").value) || cta;
    const tagStyle = $("igTagStyle").value || "end";
    const linkLine = link ? `\n\nLink: ${link}` : "";

    const base = `${body}\n\n${igCTA}${linkLine}`.trim();
    if (!tagStr) return base;

    if (tagStyle === "comment"){
      return `${base}\n\n—\nHashtags (first comment):\n${tagStr}`;
    }
    return `${base}\n\n${tagStr}`;
  }

  // ---- Bluesky ----
  let useLink = "";
  if (link && linkPolicy === "every") useLink = link;
  if (link && linkPolicy === "some" && (i === 0 || i === total-1)) useLink = link;

  let text = body.trim();
  if (useLink) text += `\n\n${useLink}`;
  if (tagStr) text += `\n\n${tagStr}`;

  if (text.length > max) text = text.slice(0, max-1) + "…";
  return text;
}


function generateDrafts(){
  const platform = $("studioPlatform").value;
  const templateId = $("studioTemplate").value;
  const tone = $("studioTone").value;
  const count = Math.max(1, Math.min(30, Number($("studioCount").value) || settings.bluesky.defaultCount || 10));

  const tags = getSelectedPackTags("pack_");
  const context = getStudioContext();

  const linkPolicy = $("studioLinkPolicy").value || settings.bluesky.linkPolicy || "some";
  const linkOverride = safeTrim($("studioLink").value);

  lastGeneratedDrafts = [];
  for (let i=0; i<count; i++){
    const text = buildDraftText({
      platform,
      templateId,
      tone,
      context,
      tags,
      linkPolicy,
      linkOverride,
      index: i,
      total: count
    });

    lastGeneratedDrafts.push({
      id: `tmp_${nowMs()}_${i}`,
      platform,
      template: templateId,
      tone,
      text,
      hashtags: tags,
      link: linkOverride || context.link || "",
      sourceTitle: context.title || "",
      sourceLink: context.link || "",
      createdAt: nowMs()
    });
  }

  renderDraftOutput();
}

function renderDraftOutput(){
  const wrap = $("draftOutput");
  wrap.innerHTML = "";

  if (!lastGeneratedDrafts.length){
    wrap.innerHTML = `<div class="item"><div class="muted">Generate drafts to see output here.</div></div>`;
    return;
  }

  lastGeneratedDrafts.forEach((d, idx) => {
    // ALWAYS coerce to string first
    const textStr = coerceDraftText(d.text);
    d.text = textStr; // normalize so the rest of the app stays consistent

    const div = document.createElement("div");
    const max = (settings.bluesky.maxChars || 300);
    const over = (d.platform === "bluesky" && textStr.length > max);
    div.className = "item " + (over ? "bad" : "good");

    const tplLabel = TEMPLATES.find(t => t.id === d.template)?.name || d.template;

    div.innerHTML = `
      <div class="row between">
        <div class="meta">
          <span class="pill">${escapeHtml(d.platform)}</span>
          <span class="pill">${escapeHtml(tplLabel)}</span>
          ${
            d.platform === "bluesky"
              ? `<span class="pill ${textStr.length > max ? "warn" : "ok"}">${textStr.length}/${max}</span>`
              : `<span class="pill">${textStr.length} chars</span>`
          }
        </div>
<div class="row">
  <button class="copyOne">Copy</button>
  <button class="scheduleOne primary">Schedule</button>
  <button class="delOne danger">Remove</button>
</div>

      </div>
      <textarea rows="5" class="draftText"></textarea>
    `;
div.querySelector(".scheduleOne").onclick = () => openSchedulePrompt(d);


    const ta = div.querySelector(".draftText");
    ta.value = textStr;
    ta.oninput = () => { d.text = ta.value; };

    div.querySelector(".copyOne").onclick = () => copyToClipboard(d.text);
    div.querySelector(".delOne").onclick = () => {
      lastGeneratedDrafts.splice(idx, 1);
      renderDraftOutput();
    };

    wrap.appendChild(div);
  });
}


function copyAllStudioDrafts(){
  if (!lastGeneratedDrafts.length) return;
  const joined = lastGeneratedDrafts.map((d,i)=>`(${i+1}) ${d.text}`).join("\n\n---\n\n");
  copyToClipboard(joined);
}

function saveStudioDraftsToLibrary(){
  if (!lastGeneratedDrafts.length) return;
  lastGeneratedDrafts.forEach(d => {
    drafts.unshift({
      id: `dft_${nowMs()}_${Math.random().toString(16).slice(2)}`,
      platform: d.platform,
      template: d.template,
      tone: d.tone,
      text: d.text,
      hashtags: d.hashtags || [],
      link: d.link || "",
      sourceTitle: d.sourceTitle || "",
      sourceLink: d.sourceLink || "",
      createdAt: nowMs()
    });
  });
  saveJson(LS_DRAFTS, drafts);
  renderDraftLibrary();
  alert("Saved to Draft Library.");
}

async function aiGenerate(system, user){
  const r = await fetch("/api/ai/chat", {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    })
  });
  if (!r.ok) throw new Error(await r.text());
  const data = await r.json();
  return data?.message?.content || "";
}

// -------- Link scraper --------
async function scrapeLinks(){
  const urls = ($("linksIn").value || "").split("\n").map(s => s.trim()).filter(Boolean);
  $("scrapeStatus").textContent = "Fetching…";
  $("scrapeResults").innerHTML = "";

  const r = await fetch("/api/scrape", {
    method:"POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ urls })
  });
  const data = await r.json();
  $("scrapeStatus").textContent = `Fetched ${data.results.length} link(s).`;

  data.results.forEach(x => {
    const div = document.createElement("div");
    div.className = "item";
    if (!x.ok) {
      div.innerHTML = `<b>${escapeHtml(x.url)}</b><div class="muted small">Error: ${escapeHtml(x.error)}</div>`;
    } else {
      div.innerHTML = `
        <b>${escapeHtml(x.title)}</b>
        <div class="muted small">${escapeHtml(x.site || "")}</div>
        <div class="muted">${escapeHtml(x.description || "")}</div>
        <div class="small"><a href="${escapeAttr(x.url)}" target="_blank" rel="noreferrer">open</a></div>
      `;
    }
    $("scrapeResults").appendChild(div);
  });
}

function stripCodeFences(s){
  s = String(s || "").trim();
  // remove ```json ... ``` fences if model adds them
  if (s.startsWith("```")) {
    s = s.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "").trim();
  }
  return s;
}

function safeJsonParse(maybeJson){
  const raw = stripCodeFences(maybeJson);
  try { return JSON.parse(raw); } catch {}
  // try to salvage if model wrapped JSON in extra text
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    const slice = raw.slice(start, end+1);
    return JSON.parse(slice);
  }
  throw new Error("Model did not return valid JSON.");
}

function clampBsky(text, max=300){
  text = String(text || "").trim();
  if (text.length <= max) return text;
  return text.slice(0, max-1) + "…";
}

async function fetchMetaForLink(url){
  if (!url) return null;
  try {
    const r = await fetch("/api/scrape", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ urls: [url] })
    });
    const data = await r.json();
    const x = (data.results || [])[0];
    if (x && x.ok) return x;
  } catch {}
  return null;
}

async function generateDraftsWithAI(){
  const aiBtn = $("aiDraftsBtn");
  const localBtn = $("genDraftsBtn");
  const oldAiLabel = aiBtn?.textContent || "Generate with AI";

  // UI start
  if (aiBtn) { aiBtn.disabled = true; aiBtn.textContent = "Generating…"; }
  if (localBtn) localBtn.disabled = true;
  $("draftOutput").innerHTML = `<div class="item"><div class="muted">Asking your local AI…</div></div>`;

  try {
    const platform = $("studioPlatform").value;     // "bluesky" or "instagram"
    const templateId = $("studioTemplate").value;
    const tone = $("studioTone").value;
    const count = Math.max(1, Math.min(30, Number($("studioCount").value) || 10));

    const tags = getSelectedPackTags("pack_");
    const tagStr = hashtagString(tags);

    const linkPolicy = $("studioLinkPolicy")?.value || "some";
    const linkOverride = safeTrim($("studioLink")?.value);
    const context = getStudioContext();

    const chosenLink = linkOverride || context.link || "";
    const meta = await fetchMetaForLink(chosenLink);

    const system = [
      "You are a social media writing assistant for a local pro-democracy community group.",
      "Be factual. Do not invent names, dates, locations, or claims not present in the input.",
      "No hate. No calls for violence. Keep language firm but safe.",
      "Return ONLY valid JSON. No markdown. No commentary."
    ].join(" ");

    const user = `
INPUT
Platform: ${platform}
Template: ${templateId} (use notes as the primary why-it-matters angle)
Tone: ${tone}
DraftCount: ${count}

SourceTitle: ${context.title || ""}
SourceSite: ${context.source || ""}
SourceLink: ${context.link || ""}
LinkOverride: ${linkOverride || ""}

MetaTitle: ${meta?.title || ""}
MetaSite: ${meta?.site || ""}
MetaDescription: ${meta?.description || ""}

HIGH PRIORITY LOCAL ANGLE (must be reflected in every draft):
${context.notes || "(none)"}

Hashtags: ${tagStr}

RULES
- If platform is bluesky:
  - Return exactly ${count} drafts in "bluesky"
  - Each draft must be <= 300 characters
  - If a link exists, follow linkPolicy:
      none = include link in 0 drafts
      some = include link in exactly 2 drafts (draft 1 and last)
      every = include link in every draft
  - Do not include hashtags in the draft text (we add them separately)
- If platform is instagram:
  - Return one "instagram_caption" up to ~1500 chars (not strict)
  - Put hashtags in "hashtags" only, not inside the caption
- Always include a clear CTA (show up / RSVP / share / call reps / donate / join).
- You MUST incorporate the "HIGH PRIORITY LOCAL ANGLE" in each draft as the 'why it matters' sentence.
- If notes are empty, create a neutral why-it-matters line based only on the headline.


OUTPUT JSON SHAPE
{
  "bluesky": ["..."],
  "instagram_caption": "...",
  "hashtags": ["tag1","tag2"]
}
STRICT:
- bluesky must be an array of strings (not objects)
- do not include linkPolicy/linkOverride fields  
`.trim();


    const payload = {
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      temperature: 0.7,
      num_predict: 1100
    };

    const r = await fetch("/api/ai/chat", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify(payload)
    });

    if (!r.ok) throw new Error(await r.text());
    const resp = await r.json();

    const content = resp?.message?.content || "";
    const obj = safeJsonParse(content);

    lastGeneratedDrafts = [];
    const createdAt = nowMs();

    const finalHashtags = normalizeTags(
      (obj.hashtags && obj.hashtags.length) ? obj.hashtags : tags
    );

    if (platform === "instagram") {
      const caption = coerceDraftText(obj.instagram_caption || "");
      const tagBlock = hashtagString(finalHashtags);
      const tagStyle = $("igTagStyle")?.value || "end";
      let text = caption;

      if (tagBlock) {
        text = (tagStyle === "comment")
          ? `${caption}\n\n—\nHashtags (first comment):\n${tagBlock}`.trim()
          : `${caption}\n\n${tagBlock}`.trim();
      }

      lastGeneratedDrafts.push({
        id: `tmp_${createdAt}_ig`,
        platform: "instagram",
        template: "ai_" + templateId,
        tone,
        text,
        hashtags: finalHashtags,
        link: chosenLink,
        sourceTitle: context.title || "",
        sourceLink: context.link || "",
        createdAt
      });

    } else {
      const arr = Array.isArray(obj.bluesky) ? obj.bluesky : [];

// Debug breadcrumb (open DevTools console to inspect when weirdness happens)
window.__lastAI = { raw: content, parsed: obj };

const fixed = arr
  .slice(0, count)
  .map((x, i) => clampBsky(
    ensureNonEmptyDraft(x, i),
    settings.bluesky.maxChars || 300
  ));


      while (fixed.length < count) {
        fixed.push("⚠️ AI returned too few drafts — click Generate with AI again.");
      }

      fixed.forEach((t, i) => {
        lastGeneratedDrafts.push({
          id: `tmp_${createdAt}_${i}`,
          platform: "bluesky",
          template: "ai_" + templateId,
          tone,
          text: t,
          hashtags: finalHashtags,
          link: chosenLink,
          sourceTitle: context.title || "",
          sourceLink: context.link || "",
          createdAt
        });
      });
    }

    renderDraftOutput();
    toast("AI drafts ready");
  } catch (e) {
    $("draftOutput").innerHTML = "";
    alert("AI drafts failed: " + (e?.message || e));
  } finally {
    // Always restore buttons
    if (aiBtn) { aiBtn.textContent = oldAiLabel; aiBtn.disabled = false; aiBtn.blur(); }
    if (localBtn) { localBtn.disabled = false; localBtn.blur(); }
  }
}


function clampBsky(text, max=300){
  text = String(text || "").trim();
  if (text.length <= max) return text;
  return text.slice(0, max-1) + "…";
}

async function fetchMetaForLink(url){
  if (!url) return null;
  try {
    const r = await fetch("/api/scrape", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ urls: [url] })
    });
    const data = await r.json();
    const x = (data.results || [])[0];
    if (x && x.ok) return x;
  } catch {}
  return null;
}


// -------- Draft Library --------
function renderDraftLibrary(){
  const q = safeTrim($("draftSearch").value).toLowerCase();
  const f = $("draftFilter").value || "all";

  const wrap = $("draftList");
  wrap.innerHTML = "";

  const filtered = drafts.filter(d => {
    if (f !== "all" && d.platform !== f) return false;
    if (!q) return true;
    return (d.text||"").toLowerCase().includes(q)
      || (d.sourceTitle||"").toLowerCase().includes(q)
      || (d.link||"").toLowerCase().includes(q);
  });

  if (!filtered.length){
    wrap.innerHTML = `<div class="item"><div class="muted">No drafts saved yet.</div></div>`;
    return;
  }

  filtered.forEach((d) => {
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="row between">
        <div class="meta">
          <span class="pill">${escapeHtml(d.platform)}</span>
          <span class="pill">${escapeHtml(TEMPLATES.find(t=>t.id===d.template)?.name || d.template)}</span>
          <span class="pill">${new Date(d.createdAt).toLocaleDateString()}</span>
          ${d.platform === "bluesky" ? `<span class="pill">${(d.text||"").length}/300</span>` : ""}
        </div>
        <div class="row">
          <button class="copy">Copy</button>
          <button class="delete danger">Delete</button>
        </div>
      </div>
      <textarea rows="5" class="t"></textarea>
      ${d.link ? `<div class="muted small">Link: ${escapeHtml(d.link)}</div>` : ""}
    `;
    const ta = div.querySelector(".t");
    ta.value = d.text || "";
    ta.oninput = () => {
      d.text = ta.value;
      saveJson(LS_DRAFTS, drafts);
    };
    div.querySelector(".copy").onclick = () => copyToClipboard(d.text || "");
    div.querySelector(".delete").onclick = () => {
      drafts = drafts.filter(x => x.id !== d.id);
      saveJson(LS_DRAFTS, drafts);
      renderDraftLibrary();
    };
    wrap.appendChild(div);
  });
}

// -------- Campaigns --------
function generateCampaignPack(){
  const name = safeTrim($("campName").value) || "Campaign";
  const date = $("campDate").value || "";
  const time = safeTrim($("campTime").value);
  const location = safeTrim($("campLocation").value);
  const link = safeTrim($("campLink").value);
  const focus = safeTrim($("campFocus").value);

  const startDays = Math.max(1, Math.min(21, Number($("campStartDays").value) || 7));
  const totalDrafts = Math.max(5, Math.min(30, Number($("campDraftCount").value) || 10));

  const doBsky = $("campBsky").checked;
  const doIg = $("campIg").checked;

  const tags = getSelectedPackTags("camp_pack_");

  const baseContext = {
    title: `${name}${focus ? ` — ${focus}` : ""}`.trim(),
    source: "Event",
    link: link,
    base: `${name}\n${date ? `Date: ${date}` : ""}\n${time ? `Time: ${time}` : ""}\n${location ? `Location: ${location}` : ""}\n${link ? `RSVP: ${link}` : ""}`.trim(),
    notes: ""
  };

  const sequence = [
    "Announcement",
    "Why this matters",
    "Logistics (where/when)",
    "Bring a friend",
    "Reminder",
    "Day before",
    "Day of",
    "After-action recap + photo ask"
  ];

  const posts = [];
  for (let i=0; i<totalDrafts; i++){
    const label = sequence[i % sequence.length];
    const templateId = (i % 3 === 0) ? "local_event" : (i % 3 === 1 ? "cta_now" : "rally");

    if (doBsky){
      const text = buildDraftText({
        platform: "bluesky",
        templateId,
        tone: "urgent",
        context: { ...baseContext, title: `${label}: ${baseContext.title}` },
        tags,
        linkPolicy: "some",
        linkOverride: link,
        index: i,
        total: totalDrafts
      });
      posts.push({ platform:"bluesky", text, template: templateId, tone:"urgent" });
    }

    if (doIg){
      const text = buildDraftText({
        platform: "instagram",
        templateId,
        tone: "hopeful",
        context: { ...baseContext, title: `${label}: ${baseContext.title}` },
        tags,
        linkPolicy: "none",
        linkOverride: link,
        index: i,
        total: totalDrafts
      });
      posts.push({ platform:"instagram", text, template: templateId, tone:"hopeful" });
    }
  }

  lastCampaignDrafts = posts;
  renderCampaignOutput();
}

function renderCampaignOutput(){
  const wrap = $("campaignOutput");
  wrap.innerHTML = "";

  if (!lastCampaignDrafts.length){
    wrap.innerHTML = `<div class="item"><div class="muted">Generate a campaign pack to see drafts here.</div></div>`;
    return;
  }

  lastCampaignDrafts.forEach((p, idx) => {
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="row between">
        <div class="meta">
          <span class="pill">${escapeHtml(p.platform)}</span>
          <span class="pill">${escapeHtml(TEMPLATES.find(t=>t.id===p.template)?.name || p.template)}</span>
          ${p.platform==="bluesky" ? `<span class="pill">${p.text.length}/300</span>` : ""}
        </div>
        <div class="row">
          <button class="copyOne">Copy</button>
          <button class="saveOne primary">Save</button>
        </div>
      </div>
      <textarea rows="5" class="t"></textarea>
    `;
    const ta = div.querySelector(".t");
    ta.value = p.text;
    ta.oninput = () => { p.text = ta.value; };

    div.querySelector(".copyOne").onclick = () => copyToClipboard(p.text);
    div.querySelector(".saveOne").onclick = () => {
      drafts.unshift({
        id: `dft_${nowMs()}_${Math.random().toString(16).slice(2)}`,
        platform: p.platform,
        template: p.template,
        tone: p.tone,
        text: p.text,
        hashtags: [],
        link: "",
        sourceTitle: "",
        sourceLink: "",
        createdAt: nowMs()
      });
      saveJson(LS_DRAFTS, drafts);
      renderDraftLibrary();
      alert("Saved to Draft Library.");
    };

    wrap.appendChild(div);
  });
}

function copyCampaignAll(){
  if (!lastCampaignDrafts.length) return;
  const joined = lastCampaignDrafts.map((p,i)=>`(${i+1}) [${p.platform}] ${p.text}`).join("\n\n---\n\n");
  copyToClipboard(joined);
}

function saveCampaign(){
  const name = safeTrim($("campName").value) || "Campaign";
  const obj = {
    id: `cmp_${nowMs()}_${Math.random().toString(16).slice(2)}`,
    name,
    eventDate: $("campDate").value || "",
    time: safeTrim($("campTime").value),
    location: safeTrim($("campLocation").value),
    rsvp: safeTrim($("campLink").value),
    focus: safeTrim($("campFocus").value),
    createdAt: nowMs(),
    posts: lastCampaignDrafts
  };
  campaigns.unshift(obj);
  saveJson(LS_CAMPAIGNS, campaigns);
  renderCampaignList();
  alert("Campaign saved.");
}

function renderCampaignList(){
  const wrap = $("campaignList");
  wrap.innerHTML = "";
  if (!campaigns.length){
    wrap.innerHTML = `<div class="item"><div class="muted">No saved campaigns yet.</div></div>`;
    return;
  }

  campaigns.forEach(c => {
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="row between">
        <div>
          <b>${escapeHtml(c.name)}</b>
          <div class="muted small">${c.eventDate || ""} ${c.time || ""} • ${escapeHtml(c.location || "")}</div>
        </div>
        <div class="row">
          <button class="load primary">Load</button>
          <button class="del danger">Delete</button>
        </div>
      </div>
    `;
    div.querySelector(".load").onclick = () => {
      lastCampaignDrafts = c.posts || [];
      renderCampaignOutput();
      document.querySelector('.tab[data-tab="campaigns"]').click();
    };
    div.querySelector(".del").onclick = () => {
      campaigns = campaigns.filter(x => x.id !== c.id);
      saveJson(LS_CAMPAIGNS, campaigns);
      renderCampaignList();
    };
    wrap.appendChild(div);
  });
}

// -------- Growth Lab --------
function addMetric(){
  const text = $("metricText").value || "";
  const likes = Number($("metricLikes").value) || 0;
  const reposts = Number($("metricReposts").value) || 0;
  const replies = Number($("metricReplies").value) || 0;
  const platform = $("metricPlatform").value || "bluesky";
  const template = $("metricTemplate").value || "";

  const entry = {
    id: `m_${nowMs()}_${Math.random().toString(16).slice(2)}`,
    ts: nowMs(),
    platform,
    template,
    text,
    likes, reposts, replies,
    tags: extractHashtags(text),
  };
  entry.score = scoreEntry(entry);

  metrics.unshift(entry);
  saveJson(LS_METRICS, metrics);

  $("metricText").value = "";
  $("metricLikes").value = 0;
  $("metricReposts").value = 0;
  $("metricReplies").value = 0;

  renderMetrics();
}

function renderMetrics(){
  // top tags
  const byTag = {};
  metrics.forEach(e => {
    (e.tags || []).forEach(t => {
      if (!byTag[t]) byTag[t] = { tag:t, total:0, count:0 };
      byTag[t].total += e.score || 0;
      byTag[t].count += 1;
    });
  });

  const rankedTags = Object.values(byTag)
    .map(x => ({...x, avg: x.total / x.count}))
    .sort((a,b)=>b.avg-a.avg);

  const topTags = $("topTags");
  topTags.innerHTML = "";
  rankedTags.slice(0, 25).forEach(r => {
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `<b>${escapeHtml(r.tag)}</b><div class="muted small">avg ${r.avg.toFixed(2)} • samples ${r.count}</div>`;
    topTags.appendChild(div);
  });
  if (!rankedTags.length){
    topTags.innerHTML = `<div class="item"><div class="muted">No data yet.</div></div>`;
  }

  // top templates
  const byTpl = {};
  metrics.forEach(e => {
    const k = e.template || "(unlabeled)";
    if (!byTpl[k]) byTpl[k] = { tpl:k, total:0, count:0 };
    byTpl[k].total += e.score || 0;
    byTpl[k].count += 1;
  });

  const rankedTpl = Object.values(byTpl)
    .map(x => ({...x, avg: x.total / x.count}))
    .sort((a,b)=>b.avg-a.avg);

  const topTpl = $("topTemplates");
  topTpl.innerHTML = "";
  rankedTpl.slice(0, 15).forEach(r => {
    const label = TEMPLATES.find(t=>t.id===r.tpl)?.name || r.tpl;
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `<b>${escapeHtml(label)}</b><div class="muted small">avg ${r.avg.toFixed(2)} • samples ${r.count}</div>`;
    topTpl.appendChild(div);
  });
  if (!rankedTpl.length){
    topTpl.innerHTML = `<div class="item"><div class="muted">No data yet.</div></div>`;
  }

  // entries
  const list = $("metricEntries");
  list.innerHTML = "";
  metrics.slice(0, 40).forEach(e => {
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="meta">
        <span class="pill">${escapeHtml(e.platform)}</span>
        <span class="pill">score ${e.score}</span>
        <span class="pill">${new Date(e.ts).toLocaleString()}</span>
      </div>
      <div class="muted small">${escapeHtml((e.tags||[]).join(" "))}</div>
    `;
    list.appendChild(div);
  });
  if (!metrics.length){
    list.innerHTML = `<div class="item"><div class="muted">No metric entries yet.</div></div>`;
  }
}

// -------- Settings --------
function renderSettings(){
  $("rssJson").value = JSON.stringify(settings.rssFeeds, null, 2);
  $("packsJson").value = JSON.stringify(settings.hashtagPacks, null, 2);
  $("ctasText").value = (settings.boiler.ctas || []).join("\n");
  $("closersText").value = (settings.boiler.closers || []).join("\n");
}

function saveSettingsRss(){
  try {
    settings.rssFeeds = JSON.parse($("rssJson").value);
    saveJson(LS_SETTINGS, settings);
    alert("Saved RSS feeds.");
  } catch {
    alert("Invalid RSS JSON.");
  }
}

function saveSettingsPacks(){
  try {
    settings.hashtagPacks = JSON.parse($("packsJson").value);
    saveJson(LS_SETTINGS, settings);
    renderPackChecks();
    alert("Saved hashtag packs.");
  } catch {
    alert("Invalid packs JSON.");
  }
}

function saveBoiler(){
  settings.boiler.ctas = ($("ctasText").value || "").split("\n").map(s=>s.trim()).filter(Boolean);
  settings.boiler.closers = ($("closersText").value || "").split("\n").map(s=>s.trim()).filter(Boolean);
  saveJson(LS_SETTINGS, settings);
  alert("Saved boilerplate.");
}

function resetRss(){
  settings.rssFeeds = JSON.parse(JSON.stringify(DEFAULT_SETTINGS.rssFeeds));
  saveJson(LS_SETTINGS, settings);
  renderSettings();
}
function resetPacks(){
  settings.hashtagPacks = JSON.parse(JSON.stringify(DEFAULT_SETTINGS.hashtagPacks));
  saveJson(LS_SETTINGS, settings);
  renderPackChecks();
  renderSettings();
}
function resetBoiler(){
  settings.boiler = JSON.parse(JSON.stringify(DEFAULT_SETTINGS.boiler));
  saveJson(LS_SETTINGS, settings);
  renderSettings();
}

// -------- Export/Import all data --------
function exportAll(){
  const blob = new Blob([JSON.stringify({ settings, signals, drafts, campaigns, metrics }, null, 2)], {type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `social-cockpit-export-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function importAll(){
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json";
  input.onchange = async () => {
    const f = input.files?.[0];
    if (!f) return;
    const txt = await f.text();
    try {
      const obj = JSON.parse(txt);
      settings = obj.settings || settings;
      signals = obj.signals || [];
      drafts = obj.drafts || [];
      campaigns = obj.campaigns || [];
      metrics = obj.metrics || [];

      saveJson(LS_SETTINGS, settings);
      saveJson(LS_SIGNALS, signals);
      saveJson(LS_DRAFTS, drafts);
      saveJson(LS_CAMPAIGNS, campaigns);
      saveJson(LS_METRICS, metrics);

      bootRenders();
      alert("Imported.");
    } catch {
      alert("Invalid file.");
      renderCalendar();
renderAgenda();
    }
  };
  input.click();
}

function resetAllLocal(){
  if (!confirm("This will erase local data for this app in your browser. Continue?")) return;
  localStorage.removeItem(LS_SETTINGS);
  localStorage.removeItem(LS_SIGNALS);
  localStorage.removeItem(LS_DRAFTS);
  localStorage.removeItem(LS_CAMPAIGNS);
  localStorage.removeItem(LS_METRICS);
  location.reload();
}

// -------- Boot wiring --------
function wire(){
  // tabs
  initTabs();
$("calPrev").onclick = () => { calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth()-1, 1); renderCalendar(); };
$("calNext").onclick = () => { calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth()+1, 1); renderCalendar(); };
$("calToday").onclick = () => { calCursor = new Date(); agendaDay = new Date(); renderCalendar(); renderAgenda(); };
$("calJump").onchange = () => {
  const v = $("calJump").value; // YYYY-MM
  if (!v) return;
  const [y,m] = v.split("-").map(Number);
  calCursor = new Date(y, m-1, 1);
  renderCalendar();
};


  // Desk
  $("loadRssBtn").onclick = loadRss;
  $("signalSearch").oninput = renderSignals;
  $("clearSignalsBtn").onclick = () => {
    if (!confirm("Clear all saved signals?")) return;
    signals = [];
    saveJson(LS_SIGNALS, signals);
    renderSignals();
    renderStudioSignalSelect();
  };

  // Studio
  $("studioSourceMode").onchange = () => { syncStudioSourceMode(); };
  $("studioPlatform").onchange = () => { syncPlatformOptions(); };
  $("studioManualText").oninput = updateStudioPills;
  $("studioSignalSelect").onchange = updateStudioPills;
  $("genDraftsBtn").onclick = () => { generateDrafts(); updateStudioPills(); };
  $("aiDraftsBtn").onclick = () => { generateDraftsWithAI(); updateStudioPills(); };
  $("copyAllDraftsBtn").onclick = copyAllStudioDrafts;
  $("saveDraftsBtn").onclick = saveStudioDraftsToLibrary;

// Substack
$("ssAddBlock").onclick = () => {
  substack.blocks.push({ id:`ss_${nowMs()}_${Math.random().toString(16).slice(2)}`, section:"democracy_watch", title:"", links:"", notes:"" });
  ssSave(); ssRender();
};
$("ssGenerate").onclick = ssGenerate;
$("ssCopyAll").onclick = () => {
  const joined = SS_SECTIONS.map(([id,name]) => {
    const t = (substack.outputs?.[id]||"").trim();
    return t ? `## ${name}\n\n${t}` : "";
  }).filter(Boolean).join("\n\n---\n\n");
  copyToClipboard(joined);
};
$("ssGenTitle").onclick = ssGenerateTitle;

$("ssIssue").oninput = () => { substack.issue = $("ssIssue").value; ssSave(); };
$("ssTone").onchange = () => { substack.tone = $("ssTone").value; ssSave(); };
$("ssLength").onchange = () => { substack.length = $("ssLength").value; ssSave(); };


  // packs checks update pills on click
  document.addEventListener("change", (e) => {
    if (e.target && String(e.target.id || "").startsWith("pack_")) updateStudioPills();
  });

  // Link tools
  $("scrapeBtn").onclick = scrapeLinks;

  // Campaigns
  $("genCampaignBtn").onclick = generateCampaignPack;
  $("copyCampaignBtn").onclick = copyCampaignAll;
  $("saveCampaignBtn").onclick = saveCampaign;
  $("clearCampaignsBtn").onclick = () => {
    if (!confirm("Clear all saved campaigns?")) return;
    campaigns = [];
    saveJson(LS_CAMPAIGNS, campaigns);
    renderCampaignList();
  };

  // Library
  $("draftSearch").oninput = renderDraftLibrary;
  $("draftFilter").onchange = renderDraftLibrary;
  $("clearDraftsBtn").onclick = () => {
    if (!confirm("Clear all drafts?")) return;
    drafts = [];
    saveJson(LS_DRAFTS, drafts);
    renderDraftLibrary();
  };

  // Growth
  $("addMetricBtn").onclick = addMetric;
  $("clearMetricsBtn").onclick = () => {
    if (!confirm("Clear all metric entries?")) return;
    metrics = [];
    saveJson(LS_METRICS, metrics);
    renderMetrics();
  };

  // Settings
  $("saveRssBtn").onclick = saveSettingsRss;
  $("resetRssBtn").onclick = resetRss;
  $("savePacksBtn").onclick = saveSettingsPacks;
  $("resetPacksBtn").onclick = resetPacks;
  $("saveBoilerBtn").onclick = saveBoiler;
  $("resetBoilerBtn").onclick = resetBoiler;

  // Top buttons
  $("exportAllBtn").onclick = exportAll;
  $("importAllBtn").onclick = importAll;
  $("resetBtn").onclick = resetAllLocal;
}

let calCursor = new Date();   // month being viewed
let agendaDay = new Date();   // day selected

function ymd(d){
  const x = new Date(d);
  const mm = String(x.getMonth()+1).padStart(2,"0");
  const dd = String(x.getDate()).padStart(2,"0");
  return `${x.getFullYear()}-${mm}-${dd}`;
}

function monthLabel(d){
  return d.toLocaleString(undefined, { month:"long", year:"numeric" });
}

function getDayCountsForMonth(d){
  const counts = {};
  const m = d.getMonth();
  const y = d.getFullYear();
  schedule.forEach(s => {
    if (s.status !== "scheduled") return;
    const dt = new Date(s.scheduledFor);
    if (dt.getMonth() === m && dt.getFullYear() === y){
      const key = ymd(dt);
      counts[key] = (counts[key] || 0) + 1;
    }
  });
  return counts;
}

function renderCalendar(){
  const grid = $("calGrid");
  const label = $("calLabel");
  if (!grid || !label) return;

  label.textContent = monthLabel(calCursor);

  const year = calCursor.getFullYear();
  const month = calCursor.getMonth();

  const first = new Date(year, month, 1);
  const startDow = first.getDay(); // 0 Sun
  const daysInMonth = new Date(year, month+1, 0).getDate();

  const counts = getDayCountsForMonth(calCursor);
  const selected = ymd(agendaDay);

  // header row
  const dow = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  let html = `<div class="item" style="padding:10px;">
    <div style="display:grid; grid-template-columns:repeat(7,1fr); gap:6px; margin-bottom:8px;">
      ${dow.map(x=>`<div class="muted small" style="text-align:center;">${x}</div>`).join("")}
    </div>
    <div style="display:grid; grid-template-columns:repeat(7,1fr); gap:6px;">`;

  // blanks
  for (let i=0;i<startDow;i++){
    html += `<div style="height:44px;"></div>`;
  }

  // days
  for (let day=1; day<=daysInMonth; day++){
    const dt = new Date(year, month, day);
    const key = ymd(dt);
    const n = counts[key] || 0;
    const isSel = key === selected;

    html += `
      <button class="${isSel ? "primary" : ""}" data-day="${key}"
        style="height:44px; border-radius:10px; position:relative;">
        ${day}
        ${n ? `<span class="pill ok" style="position:absolute; right:6px; bottom:6px;">${n}</span>` : ""}
      </button>`;
  }

  html += `</div></div>`;
  grid.innerHTML = html;

  grid.querySelectorAll("button[data-day]").forEach(b=>{
    b.onclick = () => {
      agendaDay = new Date(b.dataset.day + "T00:00:00");
      renderAgenda();
      renderCalendar();
    };
  });
}

function renderAgenda(){
  const label = $("agendaLabel");
  const list = $("agendaList");
  if (!label || !list) return;

  const key = ymd(agendaDay);
  label.textContent = `Scheduled for ${key}`;

  const items = schedule
    .filter(s => s.status === "scheduled" && ymd(s.scheduledFor) === key)
    .sort((a,b)=> new Date(a.scheduledFor) - new Date(b.scheduledFor));

  if (!items.length){
    list.innerHTML = `<div class="item"><div class="muted">Nothing scheduled for this day.</div></div>`;
    return;
  }

  list.innerHTML = "";
  items.forEach(s=>{
    const t = new Date(s.scheduledFor).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="row between">
        <div>
          <b>${t}</b> <span class="pill">${escapeHtml(s.platform)}</span>
          <div class="muted small" style="margin-top:6px; white-space:pre-wrap;">${escapeHtml(s.text)}</div>
        </div>
        <div class="row">
          <button class="mark primary">Mark posted</button>
          <button class="del danger">Delete</button>
        </div>
      </div>
    `;
    div.querySelector(".mark").onclick = () => {
      s.status = "posted";
      saveJson(LS_SCHEDULE, schedule);
      renderAgenda();
      renderCalendar();
    };
    div.querySelector(".del").onclick = () => {
      schedule = schedule.filter(x => x.id !== s.id);
      saveJson(LS_SCHEDULE, schedule);
      renderAgenda();
      renderCalendar();
    };
    list.appendChild(div);
  });
}

function openSchedulePrompt(draft){
  // Use snapshot text so future edits don't change the scheduled copy
  const defaultISO = new Date(Date.now() + 60*60*1000); // +1 hour
  const pad = (n)=>String(n).padStart(2,"0");
  const isoLocal =
    `${defaultISO.getFullYear()}-${pad(defaultISO.getMonth()+1)}-${pad(defaultISO.getDate())}T${pad(defaultISO.getHours())}:${pad(defaultISO.getMinutes())}`;

  const when = prompt("Schedule date/time (YYYY-MM-DDTHH:MM)", isoLocal);
  if (!when) return;

  const dt = new Date(when);
  if (isNaN(dt.getTime())){
    alert("Invalid date/time format.");
    return;
  }

  schedule.unshift({
    id: `sch_${nowMs()}_${Math.random().toString(16).slice(2)}`,
    draftId: draft.id,
    text: coerceDraftText(draft.text),
    platform: draft.platform,
    scheduledFor: when,
    status: "scheduled",
    createdAt: nowMs()
  });
  saveJson(LS_SCHEDULE, schedule);

  agendaDay = new Date(ymd(dt) + "T00:00:00");
  calCursor = new Date(dt.getFullYear(), dt.getMonth(), 1);

  toast("Scheduled");
  renderCalendar();
  renderAgenda();
}


function bootRenders(){
  renderTemplateSelects();
  renderPackChecks();
  renderSettings();
  ssRender();

  renderSignals();
  renderStudioSignalSelect();
  syncStudioSourceMode();
  syncPlatformOptions();
  updateStudioPills();

  renderDraftLibrary();
  renderCampaignList();
  renderMetrics();
  renderCampaignOutput();
  renderDraftOutput();
}

function init(){
  wire();
  bootRenders();
}

init();
