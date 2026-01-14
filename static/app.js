// -----------------------------
// Storage keys
// -----------------------------
const LS_SETTINGS = "pc_settings_v1";
const LS_ISSUES   = "pc_issues_v1";
const LS_ACTIVE   = "pc_active_issue_id_v1";
const LS_LAB      = "pc_hashtag_lab_v1";

// -----------------------------
// Defaults (edit these any time)
// -----------------------------
const DEFAULT_SETTINGS = {
  social: {
    instagram: "@RageForDemocracyCA",
    facebook: "Indivisible East Contra Costa County",
    bluesky: "@RageForDemocracyCA",
    tiktok: "@RageForDemocracyCA",
    discord: ""
  },
  templates: [
    {
      name: "Weekly",
      sections: ["opening","important","schedule","democracyWatch","callToAction","communityCorner","social"]
    },
    {
      name: "Emergency Action",
      sections: ["opening","important","schedule","democracyWatch","callToAction","social"]
    }
  ],
  rssFeeds: [
    { name: "NPR Politics", url: "https://feeds.npr.org/1014/rss.xml", enabled: true }
  ],
  hashtagPacks: [
    { name: "Protest", tags: ["RageForDemocracyCA","WeThePeople","Democracy","Protest","NoKings","Solidarity"] },
    { name: "Civics Club", tags: ["CivicsClub","KnowYourRights","WeThePeople","Democracy","Community"] },
    { name: "Mutual Aid", tags: ["MutualAid","CommunityCare","NeighborsHelpingNeighbors","Solidarity","LocalAction"] }
  ],
  blueskyDefaults: { postCount: 10, maxChars: 300, linkPolicy: "some" }
};

function nowIso(){ return new Date().toISOString(); }

function defaultIssue() {
  return {
    id: nowIso(),
    title: "",
    opening: "",
    important: [],
    schedule: [],
    democracyWatch: { headline: "", source: "", summaryBullets: [], link: "", imageNote: "" },
    callToAction: [],
    communityCorner: "",
    social: null,   // null means "use settings social"
    meta: { createdAt: nowIso(), updatedAt: nowIso(), templateName: "Weekly" }
  };
}

// -----------------------------
// Utilities
// -----------------------------
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

function deepClone(obj){ return JSON.parse(JSON.stringify(obj)); }

function copyToClipboard(text){
  navigator.clipboard.writeText(text || "");
}

function normalizeTags(arr){
  return (arr || [])
    .map(t => (t || "").trim())
    .filter(Boolean)
    .map(t => t.replace(/^#+/, "")); // strip leading #
}

function hashtagExtract(text){
  const m = (text || "").match(/#[A-Za-z0-9_]+/g) || [];
  return [...new Set(m.map(x => x.toLowerCase()))];
}

function scoreEntry(e){
  return (Number(e.likes)||0) + (Number(e.reposts)||0)*2 + (Number(e.replies)||0)*2;
}

function prettyDate(iso){
  if(!iso) return "";
  // accept "YYYY-MM-DD" or ISO
  try {
    const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
    return d.toLocaleDateString(undefined, { weekday:"short", year:"numeric", month:"short", day:"numeric" });
  } catch { return iso; }
}

function safeLink(x){ return (x || "").trim(); }

// -----------------------------
// State
// -----------------------------
let settings = loadJson(LS_SETTINGS, deepClone(DEFAULT_SETTINGS));
let issues = loadJson(LS_ISSUES, []);
let lab = loadJson(LS_LAB, []);
let activeIssueId = localStorage.getItem(LS_ACTIVE) || null;

if (!issues.length) {
  const i = defaultIssue();
  issues = [i];
  activeIssueId = i.id;
  saveJson(LS_ISSUES, issues);
  localStorage.setItem(LS_ACTIVE, activeIssueId);
}

// -----------------------------
// Tabs
// -----------------------------
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

// -----------------------------
// Issue selection + saving
// -----------------------------
function getActiveIssue(){
  return issues.find(x => x.id === activeIssueId) || issues[0];
}

function setActiveIssue(id){
  activeIssueId = id;
  localStorage.setItem(LS_ACTIVE, id);
  renderIssueSelect();
  renderIssueForm();
}

function persistIssues(){
  const idx = issues.findIndex(x => x.id === activeIssueId);
  if (idx >= 0) issues[idx].meta.updatedAt = nowIso();
  saveJson(LS_ISSUES, issues);
}

function renderIssueSelect(){
  const sel = $("issueSelect");
  sel.innerHTML = "";
  issues
    .slice()
    .sort((a,b) => (b.meta?.createdAt||"").localeCompare(a.meta?.createdAt||""))
    .forEach(issue => {
      const opt = document.createElement("option");
      opt.value = issue.id;
      const title = (issue.title || "Untitled").slice(0, 40);
      opt.textContent = `${title}  •  ${prettyDate(issue.meta?.createdAt || issue.id)}`;
      if (issue.id === activeIssueId) opt.selected = true;
      sel.appendChild(opt);
    });

  sel.onchange = () => setActiveIssue(sel.value);
}

function newIssue(){
  const i = defaultIssue();
  issues.push(i);
  persistIssues();
  setActiveIssue(i.id);
}

function duplicateIssue(){
  const cur = getActiveIssue();
  const clone = deepClone(cur);
  clone.id = nowIso();
  clone.meta = { ...clone.meta, createdAt: nowIso(), updatedAt: nowIso() };
  clone.title = clone.title ? `${clone.title} (copy)` : "Untitled (copy)";
  issues.push(clone);
  persistIssues();
  setActiveIssue(clone.id);
}

function exportIssue(){
  const cur = getActiveIssue();
  downloadJson(cur, `issue-${(cur.meta?.createdAt||cur.id).slice(0,10)}.json`);
}

function importIssue(){
  pickJsonFile((obj) => {
    if (!obj || !obj.id) obj.id = nowIso();
    if (!obj.meta) obj.meta = { createdAt: nowIso(), updatedAt: nowIso(), templateName: "Weekly" };
    issues.push(obj);
    persistIssues();
    setActiveIssue(obj.id);
  });
}

function downloadJson(obj, filename){
  const blob = new Blob([JSON.stringify(obj, null, 2)], {type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function pickJsonFile(cb){
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json";
  input.onchange = async () => {
    const f = input.files?.[0];
    if(!f) return;
    const txt = await f.text();
    try { cb(JSON.parse(txt)); }
    catch { alert("Invalid JSON file."); }
  };
  input.click();
}

// -----------------------------
// Templates + Settings rendering
// -----------------------------
function renderTemplateSelect(){
  const sel = $("templateSelect");
  sel.innerHTML = "";
  settings.templates.forEach(t => {
    const opt = document.createElement("option");
    opt.value = t.name;
    opt.textContent = t.name;
    sel.appendChild(opt);
  });

  const cur = getActiveIssue();
  sel.value = cur.meta?.templateName || "Weekly";
  sel.onchange = () => {
    cur.meta.templateName = sel.value;
    persistIssues();
  };
}

function renderSettings(){
  // Social
  $("sInstagram").value = settings.social.instagram || "";
  $("sFacebook").value  = settings.social.facebook || "";
  $("sBluesky").value   = settings.social.bluesky || "";
  $("sTiktok").value    = settings.social.tiktok || "";
  $("sDiscord").value   = settings.social.discord || "";

  $("saveSocialBtn").onclick = () => {
    settings.social.instagram = $("sInstagram").value.trim();
    settings.social.facebook  = $("sFacebook").value.trim();
    settings.social.bluesky   = $("sBluesky").value.trim();
    settings.social.tiktok    = $("sTiktok").value.trim();
    settings.social.discord   = $("sDiscord").value.trim();
    saveJson(LS_SETTINGS, settings);
    alert("Saved.");
  };

  // RSS feeds JSON
  $("rssJson").value = JSON.stringify(settings.rssFeeds, null, 2);
  $("saveRssBtn").onclick = () => {
    try{
      settings.rssFeeds = JSON.parse($("rssJson").value);
      saveJson(LS_SETTINGS, settings);
      alert("Saved feeds.");
    } catch { alert("Invalid RSS JSON."); }
  };
  $("resetRssBtn").onclick = () => {
    settings.rssFeeds = deepClone(DEFAULT_SETTINGS.rssFeeds);
    $("rssJson").value = JSON.stringify(settings.rssFeeds, null, 2);
    saveJson(LS_SETTINGS, settings);
  };

  // Templates
  $("templatesJson").value = JSON.stringify(settings.templates, null, 2);
  $("saveTemplatesBtn").onclick = () => {
    try{
      settings.templates = JSON.parse($("templatesJson").value);
      saveJson(LS_SETTINGS, settings);
      renderTemplateSelect();
      alert("Saved templates.");
    } catch { alert("Invalid templates JSON."); }
  };
  $("resetTemplatesBtn").onclick = () => {
    settings.templates = deepClone(DEFAULT_SETTINGS.templates);
    $("templatesJson").value = JSON.stringify(settings.templates, null, 2);
    saveJson(LS_SETTINGS, settings);
    renderTemplateSelect();
  };

  // Packs
  $("packsJson").value = JSON.stringify(settings.hashtagPacks, null, 2);
  $("savePacksBtn").onclick = () => {
    try{
      settings.hashtagPacks = JSON.parse($("packsJson").value);
      saveJson(LS_SETTINGS, settings);
      renderSkyPackSelect();
      alert("Saved packs.");
    } catch { alert("Invalid packs JSON."); }
  };
  $("resetPacksBtn").onclick = () => {
    settings.hashtagPacks = deepClone(DEFAULT_SETTINGS.hashtagPacks);
    $("packsJson").value = JSON.stringify(settings.hashtagPacks, null, 2);
    saveJson(LS_SETTINGS, settings);
    renderSkyPackSelect();
  };

  // Export/import settings
  $("exportSettingsBtn").onclick = () => downloadJson(settings, "post-cockpit-settings.json");
  $("importSettingsBtn").onclick = () => {
    pickJsonFile((obj) => {
      settings = obj;
      saveJson(LS_SETTINGS, settings);
      renderTemplateSelect();
      renderSkyPackSelect();
      renderSettings();
      alert("Imported settings.");
    });
  };
}

// -----------------------------
// Issue form rendering
// -----------------------------
function renderIssueForm(){
  const cur = getActiveIssue();

  $("title").value = cur.title || "";
  $("opening").value = cur.opening || "";
  $("communityCorner").value = cur.communityCorner || "";

  // Democracy watch fields
  $("dwHeadline").value = cur.democracyWatch?.headline || "";
  $("dwSource").value = cur.democracyWatch?.source || "";
  $("dwLink").value = cur.democracyWatch?.link || "";
  $("dwBullets").value = (cur.democracyWatch?.summaryBullets || []).map(b => `- ${b}`).join("\n");
  $("dwImageNote").value = cur.democracyWatch?.imageNote || "";

  // Inputs -> save on change (lightweight)
  $("title").oninput = () => { cur.title = $("title").value; persistIssues(); renderIssueSelect(); };
  $("opening").oninput = () => { cur.opening = $("opening").value; persistIssues(); };
  $("communityCorner").oninput = () => { cur.communityCorner = $("communityCorner").value; persistIssues(); };

  const saveDW = () => {
    if(!cur.democracyWatch) cur.democracyWatch = {headline:"",source:"",summaryBullets:[],link:"",imageNote:""};
    cur.democracyWatch.headline = $("dwHeadline").value.trim();
    cur.democracyWatch.source   = $("dwSource").value.trim();
    cur.democracyWatch.link     = $("dwLink").value.trim();
    cur.democracyWatch.imageNote= $("dwImageNote").value.trim();
    cur.democracyWatch.summaryBullets = ($("dwBullets").value || "")
      .split("\n")
      .map(l => l.trim().replace(/^-+\s*/, ""))
      .filter(Boolean);
    persistIssues();
  };
  ["dwHeadline","dwSource","dwLink","dwBullets","dwImageNote"].forEach(id => $(id).oninput = saveDW);

  renderImportantList();
  renderScheduleList();
  renderCtaList();
}

// -----------------------------
// List editors (Important / Schedule / CTA)
// -----------------------------
function renderImportantList(){
  const cur = getActiveIssue();
  const wrap = $("importantList");
  wrap.innerHTML = "";

  (cur.important || []).forEach((txt, idx) => {
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <label>Item ${idx+1}</label>
      <textarea rows="2" data-idx="${idx}" class="impText">${escapeHtml(txt)}</textarea>
      <div class="row">
        <button class="impUp" data-idx="${idx}">Up</button>
        <button class="impDown" data-idx="${idx}">Down</button>
        <button class="impDel" data-idx="${idx}">Delete</button>
      </div>
    `;
    wrap.appendChild(div);
  });

  wrap.querySelectorAll(".impText").forEach(t => {
    t.oninput = () => {
      const i = Number(t.dataset.idx);
      cur.important[i] = t.value;
      persistIssues();
    };
  });

  wrap.querySelectorAll(".impDel").forEach(b => b.onclick = () => {
    cur.important.splice(Number(b.dataset.idx), 1);
    persistIssues();
    renderImportantList();
  });

  wrap.querySelectorAll(".impUp").forEach(b => b.onclick = () => {
    const i = Number(b.dataset.idx);
    if (i <= 0) return;
    [cur.important[i-1], cur.important[i]] = [cur.important[i], cur.important[i-1]];
    persistIssues();
    renderImportantList();
  });

  wrap.querySelectorAll(".impDown").forEach(b => b.onclick = () => {
    const i = Number(b.dataset.idx);
    if (i >= cur.important.length - 1) return;
    [cur.important[i+1], cur.important[i]] = [cur.important[i], cur.important[i+1]];
    persistIssues();
    renderImportantList();
  });

  $("addImportantBtn").onclick = () => {
    cur.important.push("");
    persistIssues();
    renderImportantList();
  };
}

function renderScheduleList(){
  const cur = getActiveIssue();
  const wrap = $("scheduleList");
  wrap.innerHTML = "";

  (cur.schedule || []).forEach((ev, idx) => {
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="row between">
        <b>Event ${idx+1}</b>
        <button class="schedDel" data-idx="${idx}">Delete</button>
      </div>
      <div class="kv">
        <div>
          <label>Date (YYYY-MM-DD)</label>
          <input type="date" class="sched" data-k="date" data-idx="${idx}" value="${escapeAttr(ev.date||"")}" />
        </div>
        <div>
          <label>Name</label>
          <input class="sched" data-k="name" data-idx="${idx}" value="${escapeAttr(ev.name||"")}" />
        </div>
        <div>
          <label>Location</label>
          <input class="sched" data-k="location" data-idx="${idx}" value="${escapeAttr(ev.location||"")}" />
        </div>
        <div>
          <label>Time</label>
          <input class="sched" data-k="time" data-idx="${idx}" value="${escapeAttr(ev.time||"")}" />
        </div>
        <div>
          <label>Focus/Topic</label>
          <input class="sched" data-k="focus" data-idx="${idx}" value="${escapeAttr(ev.focus||"")}" />
        </div>
        <div>
          <label>Link</label>
          <input class="sched" data-k="link" data-idx="${idx}" value="${escapeAttr(ev.link||"")}" />
        </div>
      </div>
    `;
    wrap.appendChild(div);
  });

  wrap.querySelectorAll(".sched").forEach(inp => {
    inp.oninput = () => {
      const i = Number(inp.dataset.idx);
      const k = inp.dataset.k;
      cur.schedule[i][k] = inp.value;
      persistIssues();
    };
  });

  wrap.querySelectorAll(".schedDel").forEach(b => b.onclick = () => {
    cur.schedule.splice(Number(b.dataset.idx), 1);
    persistIssues();
    renderScheduleList();
  });

  $("addScheduleBtn").onclick = () => {
    cur.schedule.push({ date:"", name:"", location:"", time:"", focus:"", link:"" });
    persistIssues();
    renderScheduleList();
  };
}

function renderCtaList(){
  const cur = getActiveIssue();
  const wrap = $("ctaList");
  wrap.innerHTML = "";

  (cur.callToAction || []).forEach((cta, idx) => {
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="row between">
        <b>CTA ${idx+1}</b>
        <button class="ctaDel" data-idx="${idx}">Delete</button>
      </div>
      <div class="kv">
        <div>
          <label>Action verb</label>
          <input class="cta" data-k="action" data-idx="${idx}" value="${escapeAttr(cta.action||"")}" />
        </div>
<div>
  <label>Deadline (date)</label>
  <input type="date" class="cta" data-k="deadlineDate" data-idx="${idx}" value="${escapeAttr(cta.deadlineDate||"")}" />
</div>
<div>
  <label>Deadline (text)</label>
  <input class="cta" data-k="deadline" data-idx="${idx}" value="${escapeAttr(cta.deadline||"")}" placeholder="e.g., Tomorrow" />
</div>
        <div style="flex:2 1 260px">
          <label>One sentence</label>
          <input class="cta" data-k="text" data-idx="${idx}" value="${escapeAttr(cta.text||"")}" />
        </div>
        <div style="flex:2 1 260px">
          <label>Link</label>
          <input class="cta" data-k="link" data-idx="${idx}" value="${escapeAttr(cta.link||"")}" />
        </div>
      </div>
    `;
    wrap.appendChild(div);
  });

  wrap.querySelectorAll(".cta").forEach(inp => {
    inp.oninput = () => {
      const i = Number(inp.dataset.idx);
      const k = inp.dataset.k;
      cur.callToAction[i][k] = inp.value;
      persistIssues();
    };
  });

  wrap.querySelectorAll(".ctaDel").forEach(b => b.onclick = () => {
    cur.callToAction.splice(Number(b.dataset.idx), 1);
    persistIssues();
    renderCtaList();
  });

  $("addCtaBtn").onclick = () => {
    cur.callToAction.push({ action:"", text:"", link:"", deadline:"", deadlineDate:"" });
    persistIssues();
    renderCtaList();
  };
}

// -----------------------------
// Markdown generator (deterministic)
// -----------------------------
function buildMarkdown(issue){
  const social = issue.social || settings.social;

  const lines = [];
  lines.push(`# ${issue.title || "Untitled"}`);
  lines.push("");
  if (issue.opening) lines.push(issue.opening.trim(), "");

  // Important
  lines.push("## ⭐ What’s Important (Read First)");
  if ((issue.important || []).length) {
    issue.important.forEach((x, i) => {
      if (x && x.trim()) lines.push(`${i+1}) ${x.trim()}`);
    });
  } else {
    lines.push("_(Add key points here.)_");
  }
  lines.push("");

  // Schedule
  lines.push("## 📅 Upcoming Schedule");
  if ((issue.schedule || []).length) {
    issue.schedule.forEach(ev => {
      const d = ev.date ? prettyDate(ev.date) : "Date TBD";
      lines.push(`- **${d} — ${ev.name || "Event"}**`);
      if (ev.location) lines.push(`  - 📍 ${ev.location}`);
      if (ev.time)     lines.push(`  - 🕔 ${ev.time}`);
      if (ev.focus)    lines.push(`  - 🎯 ${ev.focus}`);
      if (ev.link)     lines.push(`  - 👉 ${ev.link}`);
    });
  } else {
    lines.push("_(Add events here.)_");
  }
  lines.push("");

  // Democracy Watch
  lines.push("## 📰 Democracy Watch");
  const dw = issue.democracyWatch || {};
  if (dw.headline || dw.link) {
    const src = dw.source ? ` (${dw.source})` : "";
    lines.push(`**${dw.headline || "Headline"}**${src}`);
    (dw.summaryBullets || []).forEach(b => lines.push(`- ${b}`));
    if (dw.imageNote) lines.push(`- _(Image note: ${dw.imageNote})_`);
    if (dw.link) lines.push(`👉 ${dw.link}`);
  } else {
    lines.push("_(Pick a headline in the Democracy Watch tab, or paste it here.)_");
  }
  lines.push("");

  // CTA
  lines.push("## 📢 Call to Action");
  if ((issue.callToAction || []).length) {
    issue.callToAction.forEach(cta => {
      const dead = cta.deadline ? ` _(Deadline: ${cta.deadline})_` : "";
      const link = cta.link ? ` 👉 ${cta.link}` : "";
      lines.push(`- **${cta.action || "Action"}:** ${(cta.text || "").trim()}${link}${dead}`);
    });
  } else {
    lines.push("_(Add 1–3 actions people can do today.)_");
  }
  lines.push("");

  // Community Corner
  lines.push("## 💬 Community Corner");
  lines.push(issue.communityCorner?.trim() || "_(Add community highlight / photo notes here.)_");
  lines.push("");
  lines.push("Send photos/clips/art/reflections to **ragefordemocracy@gmail.com** — we’ll highlight community submissions in the next issue.");
  lines.push("");

  // Social
  lines.push("## 📲 Stay Connected");
  lines.push(`📸 Instagram → ${social.instagram || ""}`);
  lines.push(`😁 Facebook → ${social.facebook || ""}`);
  lines.push(`🔵 BlueSky → ${social.bluesky || ""}`);
  lines.push(`📹 TikTok → ${social.tiktok || ""}`);
  if (social.discord) lines.push(`💬 Discord → ${social.discord}`);
  lines.push("");
  lines.push("✊ Forward this newsletter to a friend — let’s grow the movement, one neighbor at a time.");
  lines.push("");

  return lines.join("\n");
}

function wireMarkdown(){
  $("genMarkdownBtn").onclick = () => {
    const md = buildMarkdown(getActiveIssue());
    $("markdownOut").value = md;
  };
  $("copyMarkdownBtn").onclick = () => copyToClipboard($("markdownOut").value);
}

// -----------------------------
// Link scraper
// -----------------------------
async function scrapeLinks(){
  const urls = ($("linksIn").value || "")
    .split("\n").map(s => s.trim()).filter(Boolean);

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

function wireScrape(){
  $("scrapeBtn").onclick = scrapeLinks;
}

// -----------------------------
// Democracy Watch RSS picker
// -----------------------------
async function loadRss(){
  const feeds = (settings.rssFeeds || []).filter(f => f.enabled);
  const limit = Number($("rssLimit").value) || 12;

  $("rssCards").innerHTML = "";
  const r = await fetch("/api/rss", {
    method:"POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ feeds, limit })
  });
  const data = await r.json();

  const items = (data.items || []).filter(x => x.title && x.link);
  items.forEach(it => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="muted small">${escapeHtml(it.feed || "")}${it.published ? " • " + escapeHtml(it.published) : ""}</div>
      <h3 style="margin:8px 0 10px 0">${escapeHtml(it.title)}</h3>
      <div class="row">
        <a href="${escapeAttr(it.link)}" target="_blank" rel="noreferrer"><button>Open</button></a>
        <button class="primary useDw">Use this</button>
      </div>
    `;
    card.querySelector(".useDw").onclick = () => {
      const cur = getActiveIssue();
      if(!cur.democracyWatch) cur.democracyWatch = { headline:"", source:"", summaryBullets:[], link:"", imageNote:"" };
      cur.democracyWatch.headline = it.title;
      cur.democracyWatch.source = it.feed || "";
      cur.democracyWatch.link = it.link;
      // keep bullets as-is (you add them)
      persistIssues();
      renderIssueForm();
      alert("Filled Democracy Watch headline/source/link in the Issue Builder.");
      // jump to Issue tab
      document.querySelector('.tab[data-tab="issue"]').click();
    };
    $("rssCards").appendChild(card);
  });

  if (!items.length) {
    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `<div class="muted">No items found. Check feed URLs in Settings.</div>`;
    $("rssCards").appendChild(div);
  }
}

function wireRss(){
  $("loadRssBtn").onclick = loadRss;
}

// -----------------------------
// Bluesky generator
// -----------------------------
function renderSkyPackSelect(){
  const sel = $("skyPack");
  sel.innerHTML = "";
  (settings.hashtagPacks || []).forEach((p, i) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = p.name;
    sel.appendChild(opt);
  });
}

function buildSkyPosts(){
  const topic = ($("skyTopic").value || "").trim() || "Update from Rage for Democracy + IECCC.";
  const cta   = ($("skyCta").value || "").trim() || "Get plugged in locally. Show up. Bring a friend.";
  const count = Math.max(1, Math.min(30, Number($("skyCount").value) || settings.blueskyDefaults.postCount || 10));
  const maxChars = settings.blueskyDefaults.maxChars || 300;

  const packIdx = Number($("skyPack").value || 0);
  const pack = (settings.hashtagPacks || [])[packIdx] || {tags:[]};
  const custom = normalizeTags(($("skyCustomTags").value || "").split(" "));
  const tags = normalizeTags([...(pack.tags||[]), ...custom]);

  const linkPolicy = $("skyLinkPolicy").value || (settings.blueskyDefaults.linkPolicy || "some");
  const link = safeLink($("skyLink").value);

  const tagStr = tags.length ? tags.map(t => `#${t}`).join(" ") : "";

  const posts = [];
  for (let i=0; i<count; i++){
    let useLink = "";
    if (link && linkPolicy === "every") useLink = link;
    if (link && linkPolicy === "some" && (i === 0 || i === count-1)) useLink = link;

    let text = `${topic}\n\n${cta}`;
    if (useLink) text += `\n\n${useLink}`;
    if (tagStr) text += `\n\n${tagStr}`;

    if (text.length > maxChars) text = text.slice(0, maxChars-1) + "…";
    posts.push(text);
  }
  return posts;
}

function renderSkyOut(posts){
  const wrap = $("skyOut");
  wrap.innerHTML = "";
  posts.forEach((p, i) => {
    const div = document.createElement("div");
    div.className = "item";
    if (p.length > 300) div.classList.add("bad");
    div.innerHTML = `
      <div class="row between">
        <div class="muted small">Post ${i+1} • ${p.length}/300</div>
        <button class="copyOne">Copy</button>
      </div>
      <textarea rows="5" class="skyText">${escapeHtml(p)}</textarea>
    `;
    const ta = div.querySelector(".skyText");
    ta.value = p;
    div.querySelector(".copyOne").onclick = () => copyToClipboard(ta.value);
    wrap.appendChild(div);
  });
}

let lastSkyPosts = [];

function wireSky(){
  renderSkyPackSelect();

  $("genSkyBtn").onclick = () => {
    lastSkyPosts = buildSkyPosts();
    renderSkyOut(lastSkyPosts);
  };

  $("copySkyAllBtn").onclick = () => {
    const joined = (lastSkyPosts || []).map((p,i)=>`(${i+1}) ${p}`).join("\n\n---\n\n");
    copyToClipboard(joined);
  };

  $("sendToLabBtn").onclick = () => {
    if (!lastSkyPosts.length) return alert("Generate posts first.");
    $("labText").value = lastSkyPosts.join("\n\n");
    document.querySelector('.tab[data-tab="lab"]').click();
  };
}

// -----------------------------
// Hashtag Lab
// -----------------------------
function renderLab(){
  // rank
  const byTag = {};
  lab.forEach(e => {
    const s = scoreEntry(e);
    (e.tags || []).forEach(t => {
      if (!byTag[t]) byTag[t] = { tag:t, total:0, count:0 };
      byTag[t].total += s;
      byTag[t].count += 1;
    });
  });

  const ranked = Object.values(byTag)
    .map(x => ({...x, avg: x.total / x.count}))
    .sort((a,b)=>b.avg-a.avg);

  $("tagRank").innerHTML = "";
  ranked.slice(0, 30).forEach(r => {
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `<b>${escapeHtml(r.tag)}</b><div class="muted small">avg score ${r.avg.toFixed(2)} • samples ${r.count}</div>`;
    $("tagRank").appendChild(div);
  });
  if (!ranked.length) {
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `<div class="muted">No data yet. Add a post + metrics.</div>`;
    $("tagRank").appendChild(div);
  }

  // entries
  $("labEntries").innerHTML = "";
  lab.slice().reverse().forEach(e => {
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="muted small">${new Date(e.ts).toLocaleString()} • score ${scoreEntry(e)}</div>
      <div class="small">${escapeHtml((e.tags||[]).join(" "))}</div>
    `;
    $("labEntries").appendChild(div);
  });
}

function wireLab(){
  $("labAddBtn").onclick = () => {
    const text = $("labText").value || "";
    const tags = hashtagExtract(text);
    const entry = {
      ts: Date.now(),
      likes: Number($("labLikes").value) || 0,
      reposts: Number($("labReposts").value) || 0,
      replies: Number($("labReplies").value) || 0,
      tags
    };
    lab.push(entry);
    saveJson(LS_LAB, lab);
    renderLab();

    $("labLikes").value = 0;
    $("labReposts").value = 0;
    $("labReplies").value = 0;
    $("labText").value = "";
  };

  $("labClearBtn").onclick = () => {
    if (!confirm("Clear all hashtag lab entries?")) return;
    lab = [];
    saveJson(LS_LAB, lab);
    renderLab();
  };

  renderLab();
}

// -----------------------------
// AI JSON paste apply
// -----------------------------
function wireAiPaste(){
  $("applyAiBtn").onclick = () => {
    const raw = $("aiPaste").value.trim();
    if (!raw) return alert("Paste JSON first.");
    let obj;
    try { obj = JSON.parse(raw); }
    catch { return alert("Invalid JSON."); }

    const cur = getActiveIssue();

    // Apply known fields only (keeps your storage stable)
    if (typeof obj.title === "string") cur.title = obj.title;
    if (typeof obj.opening === "string") cur.opening = obj.opening;
    if (Array.isArray(obj.important)) cur.important = obj.important.map(String);
    if (Array.isArray(obj.schedule)) cur.schedule = obj.schedule;
    if (typeof obj.communityCorner === "string") cur.communityCorner = obj.communityCorner;

    if (obj.democracyWatch) {
      cur.democracyWatch = cur.democracyWatch || { headline:"", source:"", summaryBullets:[], link:"", imageNote:"" };
      if (typeof obj.democracyWatch.headline === "string") cur.democracyWatch.headline = obj.democracyWatch.headline;
      if (typeof obj.democracyWatch.source === "string") cur.democracyWatch.source = obj.democracyWatch.source;
      if (typeof obj.democracyWatch.link === "string") cur.democracyWatch.link = obj.democracyWatch.link;
      if (Array.isArray(obj.democracyWatch.summaryBullets)) cur.democracyWatch.summaryBullets = obj.democracyWatch.summaryBullets.map(String);
      if (typeof obj.democracyWatch.imageNote === "string") cur.democracyWatch.imageNote = obj.democracyWatch.imageNote;
    }

    if (Array.isArray(obj.callToAction)) cur.callToAction = obj.callToAction;

    if (obj.meta?.templateName) cur.meta.templateName = obj.meta.templateName;

    persistIssues();
    renderIssueSelect();
    renderIssueForm();
    alert("Applied JSON to the active issue.");
    $("aiPaste").value = "";
  };
}
function buildSectionBlocks(issue, mode){
  const social = issue.social || settings.social;
  const dw = issue.democracyWatch || {};
  const blocks = [];

  const fmtDeadline = (cta) => {
    if (cta.deadlineDate) return prettyDate(cta.deadlineDate);
    if (cta.deadline) return cta.deadline; // existing text field (e.g., "Tomorrow")
    return "";
  };

  if (mode === "substack") {
    // Title + Opening
    blocks.push({
      key: "title_opening",
      label: "Title + Opening",
      text: [
        (issue.title || "Title"),
        "",
        (issue.opening || "This is the opening statement.").trim()
      ].join("\n")
    });

    // Important
    blocks.push({
      key: "important",
      label: "⭐ What’s Important",
      text: [
        "⭐ What’s Important (Read First)",
        "",
        ...(issue.important?.length
          ? issue.important.filter(x=>String(x||"").trim()).map((x,i)=>`${i+1}) ${String(x).trim()}`)
          : ["(Add key points here.)"])
      ].join("\n")
    });

    // Schedule
    const schedLines = ["📅 Upcoming Schedule", ""];
    if (issue.schedule?.length) {
      issue.schedule.forEach(ev => {
        const d = ev.date ? prettyDate(ev.date) : "Date TBD";
        schedLines.push(`${d} — ${ev.name || "Event"}`);
        if (ev.location) schedLines.push(`📍 ${ev.location}`);
        if (ev.time)     schedLines.push(`🕔 ${ev.time}`);
        if (ev.focus)    schedLines.push(`🎯 ${ev.focus}`);
        if (ev.link)     schedLines.push(`👉 ${ev.link}`);
        schedLines.push(""); // blank line between events
      });
    } else {
      schedLines.push("(Add events here.)");
    }
    blocks.push({ key: "schedule", label: "📅 Upcoming Schedule", text: schedLines.join("\n").trim() });

    // Democracy Watch
    const dwLines = ["📰 Democracy Watch", ""];
    if (dw.headline || dw.link) {
      const src = dw.source ? ` (${dw.source})` : "";
      dwLines.push(`${dw.headline || "Headline"}${src}`);
      if (dw.link) dwLines.push(`👉 ${dw.link}`);
      if (dw.summaryBullets?.length) {
        dwLines.push("");
        dw.summaryBullets.forEach(b => dwLines.push(`• ${b}`));
      }
      if (dw.imageNote) {
        dwLines.push("");
        dwLines.push(`(Image note: ${dw.imageNote})`);
      }
    } else {
      dwLines.push("(Pick a headline in Democracy Watch tab.)");
    }
    blocks.push({ key: "dw", label: "📰 Democracy Watch", text: dwLines.join("\n") });

    // Call to Action
    const ctaLines = ["📢 Call to Action", ""];
    if (issue.callToAction?.length) {
      issue.callToAction.forEach(cta => {
        const dead = fmtDeadline(cta);
        const head = cta.action ? `${cta.action}:` : "Action:";
        ctaLines.push(`• ${head} ${(cta.text || "").trim()}`.trim());
        if (cta.link) ctaLines.push(`👉 ${cta.link}`);
        if (dead) ctaLines.push(`Deadline: ${dead}`);
        ctaLines.push("");
      });
    } else {
      ctaLines.push("(Add 1–3 actions people can do today.)");
    }
    blocks.push({ key: "cta", label: "📢 Call to Action", text: ctaLines.join("\n").trim() });

    // Community Corner
    blocks.push({
      key: "community",
      label: "💬 Community Corner",
      text: [
        "💬 Community Corner",
        "",
        (issue.communityCorner || "(Add community highlight / photo notes here.)").trim(),
        "",
        "Send photos/clips/art/reflections to ragefordemocracy@gmail.com — we’ll highlight community submissions in the next issue."
      ].join("\n")
    });

    // Social
    blocks.push({
      key: "social",
      label: "📲 Stay Connected",
      text: [
        "📲 Stay Connected",
        "",
        `📸 Instagram → ${social.instagram || ""}`,
        `😁 Facebook → ${social.facebook || ""}`,
        `🔵 BlueSky → ${social.bluesky || ""}`,
        `📹 TikTok → ${social.tiktok || ""}`,
        social.discord ? `💬 Discord → ${social.discord}` : ""
      ].filter(Boolean).join("\n")
    });

    return blocks;
  }

  // Markdown mode (kept for other uses)
  blocks.push({
    key: "markdown_full",
    label: "Full Markdown",
    text: buildMarkdown(issue)
  });
  return blocks;
}

function renderSectionOutputs(){
  const mode = $("outputMode")?.value || "substack";
  const blocks = buildSectionBlocks(getActiveIssue(), mode);

  const wrap = $("sectionOutputs");
  wrap.innerHTML = "";

  blocks.forEach(b => {
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="row between">
        <b>${escapeHtml(b.label)}</b>
        <button class="copySectionBtn">Copy</button>
      </div>
      <textarea rows="8" class="sectionText"></textarea>
    `;
    const ta = div.querySelector(".sectionText");
    ta.value = b.text;
    div.querySelector(".copySectionBtn").onclick = () => copyToClipboard(ta.value);
    wrap.appendChild(div);
  });

  // Store for Copy All
  window.__lastSectionBlocks = blocks;
}

function wireSectionOutputs(){
  $("genSectionsBtn").onclick = renderSectionOutputs;

  $("copyAllSectionsBtn").onclick = () => {
    const blocks = window.__lastSectionBlocks || buildSectionBlocks(getActiveIssue(), $("outputMode").value);
    const joined = blocks.map(b => b.text).join("\n\n---\n\n");
    copyToClipboard(joined);
  };

  $("outputMode").onchange = () => renderSectionOutputs();
}


// -----------------------------
// Wire top buttons
// -----------------------------
function wireTopButtons(){
  $("newIssueBtn").onclick = newIssue;
  $("dupIssueBtn").onclick = duplicateIssue;
  $("exportIssueBtn").onclick = exportIssue;
  $("importIssueBtn").onclick = importIssue;
}

// -----------------------------
// Small HTML escaping helpers
// -----------------------------
function escapeHtml(str){
  return String(str ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
function escapeAttr(str){ return escapeHtml(str).replaceAll("\n"," "); }

// -----------------------------
// Boot
// -----------------------------
function init(){
  initTabs();
  wireTopButtons();
  renderIssueSelect();
  renderTemplateSelect();
  renderIssueForm();
  wireMarkdown();
  wireScrape();
  wireRss();
  wireSky();
  wireLab();
  wireAiPaste();
  renderSettings();

  // Settings may affect dropdowns
  $("issueSelect").dispatchEvent(new Event("change"));
}

wireSectionOutputs();
renderSectionOutputs(); // auto-generate on load

init();
