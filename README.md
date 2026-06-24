# Knowledge Test — interview & exam Q&A trainer

A fast, randomized **multiple-choice trainer** for senior software-engineering interviews and
certification exams. Pick your topics, choose a difficulty, and drill question after question —
every answer, right or wrong, comes with a **grounded explanation**.

It's a companion to the [`algo`](https://github.com/bergsonvalencia/algo) site (which handles
algorithms & data structures): this one covers **everything else** in the
[reviewer](https://github.com/bergsonvalencia/reviewer) library.

> **Live site:** _enable GitHub Pages on first push — see [Deploy](#deploy)._

---

## What's inside

- **14 topic areas** — .NET / C#, TypeScript, React, Angular, SQL Server / T-SQL, Web & API,
  Software Design (OOP/SOLID/Patterns), Architecture, System Design, Azure, AWS, AI / Machine
  Learning, Testing, and Agile & Leadership.
- **Thousands of questions** across **easy / medium / hard**, written to test real understanding —
  trade-offs, gotchas, failure modes, code behavior — not trivia.
- **Question types:** single-answer multiple choice, "select all that apply", and true/false, with
  build-time syntax-highlighted **code-reading** questions where the topic calls for it.
- **Instant feedback:** the correct answer is revealed and explained immediately, with a pointer to
  the source reviewer.
- **Session results:** score ring, per-topic and per-difficulty breakdown, a review of every miss,
  and "retry the ones you missed."
- **Local-only progress:** accuracy, best streak, and your last setup are saved in `localStorage` —
  no accounts, no tracking, no backend.
- **Light / dark**, keyboard-driven (`A`–`H` to pick, `Enter` to advance), responsive, offline-ready.

Every question is **generated from and verified against** the reviewers — each topic file is read by
an author pass and then independently re-checked by an adversarial fact-checking pass before it ships.

---

## How it works

```
content/
  topics.json              # the 14 topic areas (label, accent, blurb)
  questions/<topic>/*.json # one JSON file per source reviewer
build.mjs                  # validates every question, pre-highlights code,
                           # bundles -> dist/data/{questions,manifest}.json + index.html
src/
  app.js                   # the quiz engine (vanilla ES module)
  theme.css                # light/dark theme
  vendor/                  # Inter + JetBrains Mono fonts, github-dark highlight theme
```

The build is a single Node script with **one runtime dependency** (`highlight.js`, used only at
build time). Output is plain static files — HTML, CSS, JS, JSON — so it runs anywhere and needs no
server.

### Question schema

```jsonc
{
  "topic": "dotnet",
  "source": "dotnet/dependency-injection-reviewer.md",
  "questions": [
    {
      "subtopic": "Service lifetimes",
      "difficulty": "medium",          // easy | medium | hard
      "type": "mcq",                   // mcq | multi | truefalse
      "question": "Which lifetime is created once per HTTP request?",
      "options": ["Transient", "Scoped", "Singleton", "Pooled"],
      "answer": 1,                      // index; array for "multi"; boolean for "truefalse"
      "explanation": "Scoped = one instance per request scope …",
      "code": "…optional snippet…",
      "lang": "csharp"
    }
  ]
}
```

The build enforces the schema: valid difficulty/type, 2–6 distinct options, in-range answers,
non-empty explanations, and cross-file duplicate detection. Invalid questions are skipped and logged
to `build-errors.log`.

---

## Run it locally

```bash
npm install
npm run build      # -> dist/
npm run serve      # http://localhost:4180
# or both:
npm run dev
```

---

## Deploy

`.github/workflows/deploy.yml` builds and publishes `dist/` to **GitHub Pages** on every push to
`main` (it enables Pages automatically on the first run). No manual setup needed beyond pushing the
repo.

---

## Credits

Content is distilled from the personal **reviewer** study library. Built with vanilla HTML, CSS, and
JavaScript — no framework.
