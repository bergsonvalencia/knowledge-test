/* ============================================================
   Knowledge Test — quiz engine (vanilla ES module, no framework)
   Views: home (builder) -> quiz -> results. Hash-routed-ish via state.
   ============================================================ */

const $ = (sel, el = document) => el.querySelector(sel);
const main = $("#main");

/* ---------------- persistence ---------------- */
const LS = {
  get(k, d) { try { const v = localStorage.getItem("kt." + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("kt." + k, JSON.stringify(v)); } catch { /* ignore */ } },
};

/* ---------------- theme ---------------- */
(function initTheme() {
  const saved = LS.get("theme", null);
  const sys = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", saved || sys);
})();
$("#theme-toggle")?.addEventListener("click", () => {
  const cur = document.documentElement.getAttribute("data-theme");
  const next = cur === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  LS.set("theme", next);
});

/* ---------------- helpers ---------------- */
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
// Tiny inline formatter: escape, then `code` and **bold**. Safe (operates on escaped text).
function fmt(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`)
    .replace(/\*\*([^*]+)\*\*/g, (_, b) => `<strong>${b}</strong>`);
}
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function eqSet(a, b) { if (a.size !== b.size) return false; for (const x of a) if (!b.has(x)) return false; return true; }
const LETTERS = "ABCDEFGH";
const DIFF_LABEL = { easy: "Easy", medium: "Medium", hard: "Hard" };

/* ---------------- data ---------------- */
let MANIFEST = null;
let QUESTIONS = [];
let TOPIC_BY_KEY = {};
const ACCENT_CLASS = { blue: "acc-blue", teal: "acc-teal", amber: "acc-amber", rose: "acc-rose", purple: "acc-purple", green: "acc-green" };

/* ---------------- app state ---------------- */
const state = {
  view: "home",
  selected: new Set(),     // topic keys
  difficulty: "all",       // all | easy | medium | hard
  count: 20,               // number or "all"
  session: null,           // { items, idx, answers, correct, streak }
};

async function boot() {
  main.innerHTML = `<div class="center-msg"><div class="spinner"></div>Loading question bank…</div>`;
  try {
    const [m, q] = await Promise.all([
      fetch("data/manifest.json").then((r) => r.json()),
      fetch("data/questions.json").then((r) => r.json()),
    ]);
    MANIFEST = m; QUESTIONS = q;
    for (const t of m.topics) TOPIC_BY_KEY[t.key] = t;
    // restore last selection
    const lastSel = LS.get("selected", null);
    if (Array.isArray(lastSel) && lastSel.length) {
      for (const k of lastSel) if (TOPIC_BY_KEY[k]?.count) state.selected.add(k);
    }
    if (!state.selected.size) for (const t of m.topics) if (t.count) state.selected.add(t.key);
    state.difficulty = LS.get("difficulty", "all");
    state.count = LS.get("count", 20);
    updateStreakPill();
    renderHome();
  } catch (e) {
    main.innerHTML = `<div class="center-msg">Couldn't load the question bank.<br><span class="faint">${esc(String(e))}</span></div>`;
  }
}

/* ---------------- pool building ---------------- */
function availableCount() {
  return QUESTIONS.filter((q) => state.selected.has(q.topic) && (state.difficulty === "all" || q.difficulty === state.difficulty)).length;
}
function buildPool() {
  let pool = QUESTIONS.filter((q) => state.selected.has(q.topic) && (state.difficulty === "all" || q.difficulty === state.difficulty));
  pool = shuffle(pool);
  const n = state.count === "all" ? pool.length : Math.min(state.count, pool.length);
  return pool.slice(0, n).map(prepItem);
}
// Prepare a runtime item: shuffled option order + remapped correct set.
function prepItem(q) {
  const order = shuffle(q.options.map((_, i) => i));   // new position -> original index
  const correctOrig = new Set(q.type === "multi" ? q.answer : [q.answer]);
  const correctNew = new Set();
  order.forEach((orig, pos) => { if (correctOrig.has(orig)) correctNew.add(pos); });
  return { q, order, correct: correctNew, picked: new Set(), locked: false, isCorrect: null };
}

/* ============================================================
   HOME (builder)
   ============================================================ */
function renderHome() {
  state.view = "home";
  state.session = null;
  updateStreakPill();
  const m = MANIFEST;
  const stats = LS.get("stats", { answered: 0, correct: 0, best: 0 });
  const acc = stats.answered ? Math.round((stats.correct / stats.answered) * 100) : 0;

  const topicCards = m.topics.map((t) => {
    if (!t.count) return "";
    const sel = state.selected.has(t.key) ? " sel" : "";
    const cls = ACCENT_CLASS[t.accent] || "acc-teal";
    return `<button class="topic-card ${cls}${sel}" data-topic="${esc(t.key)}" aria-pressed="${state.selected.has(t.key)}">
      <div class="tc-top"><span class="dot"></span><span class="tc-count">${t.count}</span><span class="check">✓</span></div>
      <h3>${esc(t.label)}</h3>
      <p>${esc(t.blurb)}</p>
    </button>`;
  }).join("");

  const diffBtn = (v, label) => `<button data-diff="${v}" class="${state.difficulty === v ? "on" : ""}">${label}</button>`;
  const countBtn = (v, label) => `<button data-count="${v}" class="${String(state.count) === String(v) ? "on" : ""}">${label}</button>`;

  main.innerHTML = `
  <section class="hero">
    <span class="eyebrow">${esc(m.total)} questions · ${esc(m.builtTopics)} topics · easy → hard</span>
    <h1>Drill the questions that<br><span class="grad">crack senior interviews &amp; exams</span></h1>
    <p>${esc(m.site.tagline)} Pick your topics, choose a difficulty, and get instant explanations — right or wrong — grounded in the reviewers.</p>
    <div class="totals">
      <div><div class="t-n">${esc(m.total)}</div><div class="t-l">Questions</div></div>
      <div><div class="t-n">${esc(m.byDiff.easy)}</div><div class="t-l">Easy</div></div>
      <div><div class="t-n">${esc(m.byDiff.medium)}</div><div class="t-l">Medium</div></div>
      <div><div class="t-n">${esc(m.byDiff.hard)}</div><div class="t-l">Hard</div></div>
      ${stats.answered ? `<div><div class="t-n">${acc}%</div><div class="t-l">Your accuracy</div></div>` : ""}
    </div>
  </section>

  <div class="section-h">1 · Choose topics</div>
  <div class="builder">
    <div class="toolbar-mini" style="margin-top:0;margin-bottom:14px">
      <button class="link-btn" id="sel-all">Select all</button>
      <span class="faint">·</span>
      <button class="link-btn" id="sel-none">Clear</button>
      <span class="faint" id="sel-summary" style="margin-left:auto"></span>
    </div>
    <div class="topic-grid" id="topic-grid">${topicCards}</div>

    <div class="builder-row">
      <div class="field">
        <label>2 · Difficulty</label>
        <div class="seg" id="diff-seg">
          ${diffBtn("all", "All")} ${diffBtn("easy", "Easy")} ${diffBtn("medium", "Medium")} ${diffBtn("hard", "Hard")}
        </div>
      </div>
      <div class="field">
        <label>3 · How many</label>
        <div class="seg" id="count-seg">
          ${countBtn(10, "10")} ${countBtn(20, "20")} ${countBtn(40, "40")} ${countBtn("all", "All")}
        </div>
      </div>
    </div>

    <div class="builder-actions">
      <button class="btn btn-primary btn-lg" id="start-btn">Start quiz →</button>
      <span class="muted" id="avail-note"></span>
    </div>
  </div>
  ${stats.answered ? `<div class="section-h">Your record</div>
    <div class="res-stats" style="justify-content:flex-start">
      <div class="res-stat"><div class="n">${stats.answered}</div><div class="l">Answered</div></div>
      <div class="res-stat ok"><div class="n">${stats.correct}</div><div class="l">Correct</div></div>
      <div class="res-stat"><div class="n">${acc}%</div><div class="l">Accuracy</div></div>
      <div class="res-stat"><div class="n">${stats.best}</div><div class="l">Best streak</div></div>
      <div class="res-stat"><button class="btn btn-ghost" id="reset-stats" style="height:100%">Reset</button></div>
    </div>` : ""}
  `;

  // wire up
  $("#topic-grid").addEventListener("click", (e) => {
    const card = e.target.closest("[data-topic]");
    if (!card) return;
    const k = card.dataset.topic;
    if (state.selected.has(k)) state.selected.delete(k); else state.selected.add(k);
    card.classList.toggle("sel");
    card.setAttribute("aria-pressed", state.selected.has(k));
    persistSettings(); refreshAvail();
  });
  $("#sel-all").addEventListener("click", () => { for (const t of m.topics) if (t.count) state.selected.add(t.key); persistSettings(); renderHome(); });
  $("#sel-none").addEventListener("click", () => { state.selected.clear(); persistSettings(); renderHome(); });
  $("#diff-seg").addEventListener("click", (e) => { const b = e.target.closest("[data-diff]"); if (!b) return; state.difficulty = b.dataset.diff; persistSettings(); renderHome(); });
  $("#count-seg").addEventListener("click", (e) => { const b = e.target.closest("[data-count]"); if (!b) return; state.count = b.dataset.count === "all" ? "all" : Number(b.dataset.count); persistSettings(); renderHome(); });
  $("#start-btn").addEventListener("click", startQuiz);
  $("#reset-stats")?.addEventListener("click", () => { if (confirm("Reset your saved stats?")) { LS.set("stats", { answered: 0, correct: 0, best: 0 }); LS.set("topicStats", {}); renderHome(); } });
  refreshAvail();
}

function refreshAvail() {
  const n = availableCount();
  const note = $("#avail-note"); const sum = $("#sel-summary");
  const startBtn = $("#start-btn");
  if (sum) sum.textContent = `${state.selected.size} topic${state.selected.size === 1 ? "" : "s"} selected`;
  if (note) {
    if (!state.selected.size) note.textContent = "Pick at least one topic.";
    else { const take = state.count === "all" ? n : Math.min(state.count, n); note.textContent = `${take} of ${n} available question${n === 1 ? "" : "s"}.`; }
  }
  if (startBtn) startBtn.disabled = !state.selected.size || n === 0;
}
function persistSettings() { LS.set("selected", [...state.selected]); LS.set("difficulty", state.difficulty); LS.set("count", state.count); }

/* ============================================================
   QUIZ
   ============================================================ */
function startQuiz() {
  const items = buildPool();
  if (!items.length) return;
  state.session = { items, idx: 0, answers: [], correct: 0, streak: 0 };
  state.view = "quiz";
  renderQuestion();
}

function renderQuestion() {
  const s = state.session;
  const item = s.items[s.idx];
  const q = item.q;
  const topic = TOPIC_BY_KEY[q.topic] || { label: q.topic, accent: "teal" };
  const accCls = ACCENT_CLASS[topic.accent] || "acc-teal";
  const total = s.items.length;
  const pct = Math.round((s.idx / total) * 100);

  const optsHtml = item.order.map((orig, pos) => {
    const text = q.options[orig];
    const inputMark = q.type === "multi" ? `<span class="key">${LETTERS[pos]}</span>` : `<span class="key">${LETTERS[pos]}</span>`;
    return `<button class="opt" data-pos="${pos}" type="button">
      ${inputMark}<span class="otext">${fmt(text)}</span><span class="mark"></span>
    </button>`;
  }).join("");

  const codeHtml = q.codeHtml ? `<div class="q-code"><pre><code class="hljs ${q.lang ? "language-" + esc(q.lang) : ""}">${q.codeHtml}</code></pre></div>` : "";
  const multiHint = q.type === "multi" ? `<span class="chip">Select all that apply</span>` : "";

  main.innerHTML = `
  <div class="quiz-wrap">
    <div class="quiz-head">
      <button class="icon-btn" id="quit-btn" title="Back to setup" aria-label="Quit">✕</button>
      <div class="progress"><span style="width:${pct}%"></span></div>
      <span class="q-count">${s.idx + 1} / ${total}</span>
      <span class="q-score">${s.correct} ✓</span>
    </div>
    <div class="q-card ${accCls}">
      <div class="q-meta">
        <span class="chip topic">${esc(topic.label)}</span>
        <span class="chip d-${q.difficulty}">${DIFF_LABEL[q.difficulty]}</span>
        ${q.subtopic ? `<span class="chip">${esc(q.subtopic)}</span>` : ""}
        ${multiHint}
      </div>
      <p class="q-text">${fmt(q.question)}</p>
      ${codeHtml}
      <div class="opts" id="opts">${optsHtml}</div>
      <div id="feedback"></div>
      <div class="quiz-foot">
        <span class="kbd-hint"><kbd>A</kbd>–<kbd>${LETTERS[item.order.length - 1]}</kbd> pick · <kbd>Enter</kbd> ${q.type === "multi" ? "check / next" : "next"}</span>
        <div id="foot-actions">${q.type === "multi" ? `<button class="btn btn-primary" id="check-btn" disabled>Check answer</button>` : ""}</div>
      </div>
    </div>
  </div>`;

  $("#quit-btn").addEventListener("click", () => { if (confirm("Quit this quiz? Progress will be lost.")) renderHome(); });
  $("#opts").addEventListener("click", onOptClick);
  if (q.type === "multi") $("#check-btn").addEventListener("click", () => checkMulti(item));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function onOptClick(e) {
  const btn = e.target.closest(".opt");
  if (!btn) return;
  const item = state.session.items[state.session.idx];
  if (item.locked) return;
  const pos = Number(btn.dataset.pos);
  if (item.q.type === "multi") {
    if (item.picked.has(pos)) { item.picked.delete(pos); btn.classList.remove("chosen"); }
    else { item.picked.add(pos); btn.classList.add("chosen"); }
    const cb = $("#check-btn"); if (cb) cb.disabled = item.picked.size === 0;
  } else {
    item.picked = new Set([pos]);
    lockAndReveal(item);
  }
}
function checkMulti(item) { if (item.picked.size) lockAndReveal(item); }

function lockAndReveal(item) {
  const s = state.session;
  item.locked = true;
  item.isCorrect = eqSet(item.picked, item.correct);
  if (item.isCorrect) { s.correct++; s.streak++; } else { s.streak = 0; }

  // record
  s.answers.push({ q: item.q, picked: [...item.picked], correct: [...item.correct], order: item.order, isCorrect: item.isCorrect });
  recordStat(item.q, item.isCorrect, s.streak);

  // paint options
  const optEls = $("#opts").querySelectorAll(".opt");
  optEls.forEach((el) => {
    const pos = Number(el.dataset.pos);
    el.disabled = true;
    const isCorrect = item.correct.has(pos);
    const isPicked = item.picked.has(pos);
    if (isCorrect) { el.classList.add("correct"); el.querySelector(".mark").textContent = "✓"; }
    if (isPicked && !isCorrect) { el.classList.add("wrong"); el.querySelector(".mark").textContent = "✗"; }
  });

  // explanation
  const q = item.q;
  const fb = $("#feedback");
  fb.innerHTML = `<div class="explain ${item.isCorrect ? "is-ok" : "is-bad"}">
    <div class="ex-head">${item.isCorrect ? "✓ Correct" : "✗ Not quite"}</div>
    <div class="ex-body">${fmt(q.explanation)}</div>
    ${q.source ? `<div class="ex-src">Source: ${esc(q.source)}</div>` : ""}
  </div>`;

  // footer -> Next
  const last = s.idx === s.items.length - 1;
  $("#foot-actions").innerHTML = `<button class="btn btn-primary" id="next-btn">${last ? "See results →" : "Next →"}</button>`;
  $("#next-btn").addEventListener("click", nextQuestion);
  updateStreakPill();
}

function nextQuestion() {
  const s = state.session;
  if (s.idx < s.items.length - 1) { s.idx++; renderQuestion(); }
  else renderResults();
}

/* keyboard */
window.addEventListener("keydown", (e) => {
  if (state.view !== "quiz" || !state.session) return;
  const item = state.session.items[state.session.idx];
  const tag = (e.target.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea") return;
  const k = e.key.toLowerCase();
  // letter selection
  const li = LETTERS.toLowerCase().indexOf(k);
  if (li >= 0 && li < item.order.length) {
    const btn = $(`#opts .opt[data-pos="${li}"]`);
    if (btn) btn.click();
    e.preventDefault(); return;
  }
  if (e.key === "Enter" || e.key === "ArrowRight") {
    if (item.locked) { $("#next-btn")?.click(); }
    else if (item.q.type === "multi" && item.picked.size) { $("#check-btn")?.click(); }
    e.preventDefault();
  }
});

/* ============================================================
   RESULTS
   ============================================================ */
function renderResults() {
  state.view = "results";
  const s = state.session;
  const total = s.answers.length;
  const correct = s.answers.filter((a) => a.isCorrect).length;
  const pct = total ? Math.round((correct / total) * 100) : 0;

  // breakdown by topic + difficulty
  const byTopic = {}; const byDiff = { easy: [0, 0], medium: [0, 0], hard: [0, 0] };
  for (const a of s.answers) {
    const tk = a.q.topic;
    (byTopic[tk] = byTopic[tk] || [0, 0]);
    byTopic[tk][1]++; if (a.isCorrect) byTopic[tk][0]++;
    byDiff[a.q.difficulty][1]++; if (a.isCorrect) byDiff[a.q.difficulty][0]++;
  }

  const verdict = pct >= 90 ? "Outstanding 🏆" : pct >= 75 ? "Strong pass ✅" : pct >= 60 ? "Solid — keep drilling" : pct >= 40 ? "Getting there" : "Lots of room to grow";
  const lead = pct >= 75 ? "You'd hold up well in a senior panel on these." : pct >= 50 ? "Review the misses below, then run it again." : "Read the explanations below — they're the fast way up.";

  const R = 76, C = 2 * Math.PI * R;
  const off = C * (1 - pct / 100);

  const topicRows = Object.entries(byTopic).sort((a, b) => b[1][1] - a[1][1]).map(([tk, [c, n]]) => {
    const t = TOPIC_BY_KEY[tk] || { label: tk };
    const p = Math.round((c / n) * 100);
    return `<div class="bd-row"><span class="bd-name">${esc(t.label)}</span><span class="bd-bar"><span style="width:${p}%"></span></span><span class="bd-frac">${c}/${n}</span></div>`;
  }).join("");

  const diffRows = ["easy", "medium", "hard"].filter((d) => byDiff[d][1]).map((d) => {
    const [c, n] = byDiff[d]; const p = Math.round((c / n) * 100);
    return `<div class="bd-row"><span class="bd-name">${DIFF_LABEL[d]}</span><span class="bd-bar"><span style="width:${p}%"></span></span><span class="bd-frac">${c}/${n}</span></div>`;
  }).join("");

  const wrong = s.answers.filter((a) => !a.isCorrect);
  const reviewList = wrong.length ? wrong.map((a) => reviewItem(a)).join("") : `<div class="rev-item ok"><div class="rev-q">Clean sweep — no misses. 🎯</div></div>`;

  main.innerHTML = `
  <div class="results">
    <div class="score-ring">
      <svg width="168" height="168" viewBox="0 0 168 168">
        <circle class="ring-bg" cx="84" cy="84" r="${R}" fill="none" stroke-width="13"></circle>
        <circle class="ring-fg" cx="84" cy="84" r="${R}" fill="none" stroke-width="13" stroke-dasharray="${C}" stroke-dashoffset="${C}" id="ring-fg"></circle>
      </svg>
      <div class="ring-label"><div class="pct">${pct}%</div><div class="sub">${correct} / ${total}</div></div>
    </div>
    <h2 class="verdict">${verdict}</h2>
    <p class="lead">${lead}</p>
    <div class="res-stats">
      <div class="res-stat ok"><div class="n">${correct}</div><div class="l">Correct</div></div>
      <div class="res-stat bad"><div class="n">${total - correct}</div><div class="l">Missed</div></div>
      <div class="res-stat"><div class="n">${bestStreakIn(s)}</div><div class="l">Best streak</div></div>
    </div>

    <div class="section-h" style="text-align:left">By topic</div>
    <div class="breakdown">${topicRows}</div>
    <div class="section-h" style="text-align:left">By difficulty</div>
    <div class="breakdown">${diffRows}</div>

    <div class="results-actions">
      <button class="btn btn-primary btn-lg" id="again-btn">New quiz</button>
      ${wrong.length ? `<button class="btn btn-lg" id="retry-wrong">Retry ${wrong.length} missed</button>` : ""}
      <button class="btn btn-ghost btn-lg" id="home-btn">Change topics</button>
    </div>

    <div class="review">
      <h3>${wrong.length ? `Review your ${wrong.length} miss${wrong.length === 1 ? "" : "es"}` : "Review"}</h3>
      ${reviewList}
    </div>
  </div>`;

  requestAnimationFrame(() => { const r = $("#ring-fg"); if (r) r.style.strokeDashoffset = off; });
  $("#again-btn").addEventListener("click", () => startQuiz());
  $("#home-btn").addEventListener("click", renderHome);
  $("#retry-wrong")?.addEventListener("click", () => {
    const items = wrong.map((a) => prepItem(a.q));
    state.session = { items, idx: 0, answers: [], correct: 0, streak: 0 };
    state.view = "quiz"; renderQuestion();
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function reviewItem(a) {
  const q = a.q;
  const optText = (origList) => origList.map((o) => q.options[o]).map((t) => fmt(t)).join("<span class='faint'> · </span>");
  const yourOrig = a.picked.map((pos) => a.order[pos]);
  const corrOrig = a.correct.map((pos) => a.order[pos]);
  return `<div class="rev-item">
    <div class="rev-q">${fmt(q.question)}</div>
    <div class="rev-a your"><span class="tag">Your answer:</span> ${a.picked.length ? optText(yourOrig) : "<span class='faint'>—</span>"}</div>
    <div class="rev-a corr"><span class="tag">Correct:</span> ${optText(corrOrig)}</div>
    <div class="rev-ex">${fmt(q.explanation)}</div>
  </div>`;
}

function bestStreakIn(s) {
  let best = 0, cur = 0;
  for (const a of s.answers) { if (a.isCorrect) { cur++; best = Math.max(best, cur); } else cur = 0; }
  return best;
}

/* ---------------- stats ---------------- */
function recordStat(q, ok, streak) {
  const st = LS.get("stats", { answered: 0, correct: 0, best: 0 });
  st.answered++; if (ok) st.correct++; st.best = Math.max(st.best || 0, streak);
  LS.set("stats", st);
  const ts = LS.get("topicStats", {});
  const e = ts[q.topic] || { answered: 0, correct: 0 };
  e.answered++; if (ok) e.correct++; ts[q.topic] = e;
  LS.set("topicStats", ts);
}
function updateStreakPill() {
  const pill = $("#streak-pill"); if (!pill) return;
  const cur = state.session?.streak || 0;
  if (state.view === "quiz" && cur >= 2) { pill.hidden = false; $("#streak-n").textContent = cur; }
  else pill.hidden = true;
}

boot();
