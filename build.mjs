// Static build: content/questions/**/*.json -> dist/data/{questions,manifest}.json + SPA shell.
// Vanilla output (no client framework). Validates every question, pre-highlights code
// blocks at build time with highlight.js, and emits a single bundled question bank.
import {
  readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync,
  copyFileSync, cpSync, existsSync, statSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const hljs = require("highlight.js");

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const CONTENT = join(ROOT, "content");
const QDIR = join(CONTENT, "questions");
const OUT = join(ROOT, "dist");
const SRC = join(ROOT, "src");

const SITE = {
  title: "Knowledge Test",
  short: "Knowledge Test",
  tagline: "Randomized interview & exam Q&A for senior software engineers.",
  repo: "https://github.com/bergsonvalencia/knowledge-test",
};

const VALID_DIFF = new Set(["easy", "medium", "hard"]);
const VALID_TYPE = new Set(["mcq", "multi", "truefalse"]);

/* ---------------- helpers ---------------- */
function escHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
function escAttr(s) { return escHtml(s); }
function slug(s) {
  return String(s).toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "q";
}
// Normalize for duplicate detection. Keys on question + code + options together, so two
// distinct questions that merely share a generic stem ("What does this print?") don't collide.
function normText(s) { return String(s == null ? "" : s).toLowerCase().replace(/\s+/g, " ").replace(/[^a-z0-9 ]/g, "").trim(); }
function dupKey(q) {
  const opts = Array.isArray(q.options) ? q.options.map(normText).sort().join("|") : "";
  return [normText(q.question), normText(q.code), opts].join("##");
}

function highlight(code, lang) {
  const l = (lang || "").toLowerCase();
  if (l && hljs.getLanguage(l)) {
    try { return hljs.highlight(code, { language: l, ignoreIllegals: true }).value; } catch { /* fall through */ }
  }
  return escHtml(code);
}

function walkJson(dir, acc) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkJson(p, acc);
    else if (name.endsWith(".json")) acc.push(p);
  }
  return acc;
}

/* ---------------- load topic metadata ---------------- */
const topicsRaw = JSON.parse(readFileSync(join(CONTENT, "topics.json"), "utf8")).topics;
const TOPIC = {};
for (const t of topicsRaw) TOPIC[t.key] = t;

/* ---------------- collect + validate questions ---------------- */
const files = walkJson(QDIR, []);
const questions = [];
const errors = [];
const seen = new Map();   // normQ -> id (dup detection)
const counters = {};      // `${topic}|${subslug}` -> n

function pushErr(file, msg) { errors.push(`${file.replace(ROOT, ".")}: ${msg}`); }

for (const file of files) {
  let doc;
  try {
    let txt = readFileSync(file, "utf8").trim();
    // Tolerate an accidental ```json … ``` fence around the JSON.
    if (txt.startsWith("```")) txt = txt.replace(/^```[a-z]*\s*/i, "").replace(/\s*```$/, "");
    doc = JSON.parse(txt);
  }
  catch (e) { pushErr(file, `invalid JSON — ${e.message}`); continue; }

  const topic = doc.topic;
  if (!TOPIC[topic]) { pushErr(file, `unknown/missing topic "${topic}"`); continue; }
  const list = Array.isArray(doc.questions) ? doc.questions : [];
  if (!list.length) { pushErr(file, "no questions[]"); continue; }

  list.forEach((q, i) => {
    const where = `q[${i}]`;
    // --- structural validation (skip invalid, don't crash the build) ---
    if (typeof q.question !== "string" || !q.question.trim()) { pushErr(file, `${where}: empty question`); return; }
    if (typeof q.explanation !== "string" || !q.explanation.trim()) { pushErr(file, `${where}: empty explanation`); return; }
    const type = q.type || "mcq";
    if (!VALID_TYPE.has(type)) { pushErr(file, `${where}: bad type "${type}"`); return; }
    const diff = q.difficulty;
    if (!VALID_DIFF.has(diff)) { pushErr(file, `${where}: bad difficulty "${diff}"`); return; }

    let options = q.options;
    let answer = q.answer;
    if (type === "truefalse") {
      options = ["True", "False"];
      if (answer === true) answer = 0;
      if (answer === false) answer = 1;
    }
    if (!Array.isArray(options) || options.length < 2 || options.length > 6) {
      pushErr(file, `${where}: options must have 2–6 entries`); return;
    }
    if (options.some((o) => typeof o !== "string" || !o.trim())) { pushErr(file, `${where}: empty option`); return; }
    const normOpts = options.map((o) => o.trim().toLowerCase());
    if (new Set(normOpts).size !== normOpts.length) { pushErr(file, `${where}: duplicate options`); return; }

    if (type === "multi") {
      if (!Array.isArray(answer) || !answer.length) { pushErr(file, `${where}: multi answer must be a non-empty array`); return; }
      if (answer.some((a) => !Number.isInteger(a) || a < 0 || a >= options.length)) { pushErr(file, `${where}: multi answer index out of range`); return; }
    } else {
      if (!Number.isInteger(answer) || answer < 0 || answer >= options.length) { pushErr(file, `${where}: answer index out of range`); return; }
    }

    // --- duplicate detection (across the whole bank) ---
    const nk = dupKey(q);
    if (seen.has(nk)) { pushErr(file, `${where}: duplicate question (also ${seen.get(nk)})`); return; }

    // --- normalize + id ---
    const sub = (q.subtopic && String(q.subtopic).trim()) || TOPIC[topic].label;
    const subslug = slug(sub);
    const ck = `${topic}|${subslug}`;
    counters[ck] = (counters[ck] || 0) + 1;
    const id = q.id || `${topic}-${subslug}-${String(counters[ck]).padStart(3, "0")}`;
    seen.set(nk, id);

    const out = {
      id,
      topic,
      subtopic: sub,
      source: q.source || null,
      difficulty: diff,
      type,
      question: q.question.trim(),
      options: options.map((o) => o.trim()),
      answer,
      explanation: q.explanation.trim(),
    };
    if (q.code && String(q.code).trim()) {
      out.codeHtml = highlight(String(q.code).replace(/\s+$/, ""), q.lang);
      out.lang = (q.lang || "").toLowerCase() || null;
    }
    questions.push(out);
  });
}

/* ---------------- manifest ---------------- */
const manifestTopics = topicsRaw.map((t) => {
  const qs = questions.filter((q) => q.topic === t.key);
  const byDiff = { easy: 0, medium: 0, hard: 0 };
  for (const q of qs) byDiff[q.difficulty]++;
  const subs = [...new Set(qs.map((q) => q.subtopic))].sort();
  return { ...t, count: qs.length, byDiff, subtopics: subs };
});
const totals = { easy: 0, medium: 0, hard: 0 };
for (const q of questions) totals[q.difficulty]++;

const manifest = {
  site: SITE,
  total: questions.length,
  byDiff: totals,
  topics: manifestTopics,
  builtTopics: manifestTopics.filter((t) => t.count > 0).length,
};

/* ---------------- write output ---------------- */
rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "assets"), { recursive: true });
mkdirSync(join(OUT, "data"), { recursive: true });

copyFileSync(join(SRC, "theme.css"), join(OUT, "assets", "theme.css"));
copyFileSync(join(SRC, "app.js"), join(OUT, "assets", "app.js"));
cpSync(join(SRC, "vendor"), join(OUT, "assets", "vendor"), { recursive: true });

writeFileSync(join(OUT, "data", "questions.json"), JSON.stringify(questions));
writeFileSync(join(OUT, "data", "manifest.json"), JSON.stringify(manifest));
writeFileSync(join(OUT, "index.html"), shell());

/* ---------------- report ---------------- */
console.log(`\nKnowledge Test build`);
console.log(`  ${questions.length} questions across ${manifest.builtTopics}/${topicsRaw.length} topics`);
console.log(`  difficulty: ${totals.easy} easy · ${totals.medium} medium · ${totals.hard} hard`);
for (const t of manifestTopics) {
  if (!t.count) continue;
  console.log(`    ${t.label.padEnd(26)} ${String(t.count).padStart(4)}  (${t.byDiff.easy}e/${t.byDiff.medium}m/${t.byDiff.hard}h)`);
}
if (errors.length) {
  console.log(`\n  ⚠ ${errors.length} validation issue(s):`);
  for (const e of errors.slice(0, 60)) console.log(`     - ${e}`);
  if (errors.length > 60) console.log(`     … and ${errors.length - 60} more`);
  writeFileSync(join(ROOT, "build-errors.log"), errors.join("\n"));
}
if (!questions.length) { console.error("\nNo valid questions — aborting."); process.exit(1); }
console.log("");

/* ---------------- SPA shell ---------------- */
function shell() {
  return `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escHtml(SITE.title)} — ${escHtml(SITE.tagline)}</title>
<meta name="description" content="${escAttr(SITE.tagline)}">
<link rel="stylesheet" href="assets/vendor/fonts.css">
<link rel="stylesheet" href="assets/vendor/github-dark.min.css">
<link rel="stylesheet" href="assets/theme.css">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="topbar">
  <a class="brand" href="#/" data-nav><span class="logo">✓</span><span>${escHtml(SITE.title)}</span></a>
  <span class="spacer"></span>
  <span class="stat-pill" id="streak-pill" hidden>🔥 <b id="streak-n">0</b></span>
  <button class="icon-btn" id="theme-toggle" aria-label="Toggle theme" title="Toggle light/dark">☾</button>
  <a class="icon-btn gh-link" href="${SITE.repo}" target="_blank" rel="noopener" aria-label="GitHub" title="Source on GitHub">★</a>
</header>
<main id="main" class="app" aria-live="polite"></main>
<footer class="site-footer">
  Generated from the senior software-engineering reviewers · built with vanilla HTML, CSS &amp; JS ·
  <a href="${SITE.repo}" target="_blank" rel="noopener">source</a>
</footer>
<script type="module" src="assets/app.js"></script>
</body>
</html>`;
}
