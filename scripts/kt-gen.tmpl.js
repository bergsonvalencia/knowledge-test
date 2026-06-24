export const meta = {
  name: 'kt-generate-rest',
  description: 'Generate + adversarially verify exam questions for the remaining reviewer topics',
  phases: [
    { title: 'Generate', detail: 'one agent per reviewer writes grounded questions' },
    { title: 'Verify', detail: 'independent fact-checker audits and fixes each file' },
  ],
}

const REV = 'C:/r/reviewer'
const KT = 'C:/r/knowledge-test'

const FILES = __FILES__

function counts(kind) {
  return kind === 'glossary' ? { n: 14, e: 5, m: 6, h: 3 } : { n: 18, e: 5, m: 8, h: 5 }
}

function genPrompt(it) {
  const c = counts(it.kind)
  const out = KT + '/content/questions/' + it.topic + '/' + it.base + '.json'
  return [
    'You are a principal-level software engineer writing interview and certification-exam questions. Every question you write must be 100% factually correct.',
    '',
    'SOURCE (verified ground truth) — read the ENTIRE file first:',
    '  ' + REV + '/' + it.src,
    'Ground every question in this reviewer\'s content plus standard, uncontroversial domain knowledge consistent with it.',
    '',
    'TASK: Write ' + c.n + ' high-quality questions that test a SENIOR software engineer\'s understanding — concepts, trade-offs, when-to-use, gotchas, failure modes, and code behavior. Avoid trivia and anything answerable without real understanding. Spread the questions across the whole reviewer, not just the first sections.',
    '',
    'DIFFICULTY MIX: ' + c.e + ' easy, ' + c.m + ' medium, ' + c.h + ' hard.',
    '  easy = core recall a competent dev should know; medium = applied/common interview depth; hard = senior edge cases, subtle trade-offs, "why" and "what breaks".',
    '',
    'TYPE MIX (approximate): mostly "mcq" (single answer, exactly 4 options); about 3 "multi" (select all that apply, 4-5 options, 2-3 correct); about 2-3 "truefalse". Where the topic is code-heavy, make 2-4 of them short code-reading questions (add a "code" string + "lang").',
    '',
    'STRICT CORRECTNESS RULES:',
    '  - Exactly one defensible correct answer for mcq/truefalse; for multi the correct subset must be complete and unambiguous.',
    '  - Every distractor must be clearly and defensibly WRONG — never "also arguably correct".',
    '  - No "All of the above" / "None of the above". Keep options mutually exclusive and similar in length so the answer is not guessable by shape.',
    '  - If you are not 100% certain an answer is correct, do NOT include that question.',
    '  - Each "explanation" (1-3 sentences) says why the answer is correct and, when useful, why the tempting distractor is wrong.',
    '',
    'OUTPUT: Use the Write tool to create EXACTLY this file (valid JSON, nothing else — no markdown, no code fences, no prose):',
    '  ' + out,
    'Schema:',
    '{ "topic": "' + it.topic + '", "source": "' + it.src + '", "questions": [',
    '  { "subtopic": "short concept label", "source": "' + it.src + '", "difficulty": "easy|medium|hard", "type": "mcq", "question": "text; inline `code` and **bold** allowed", "options": ["a","b","c","d"], "answer": 0, "explanation": "why correct (+ why a distractor is wrong)" }',
    '] }',
    'Field rules: "answer" is a 0-based integer index for "mcq"; an array of indices for "multi"; a boolean true/false for "truefalse" (and OMIT "options" — the build supplies True/False). Optional "code" is a short (<15 line) correct snippet shown with the question, paired with "lang" (csharp, typescript, sql, json, yaml, bash...). Valid JSON: double quotes, no trailing commas.',
    '',
    'Return ONLY a one-line summary, e.g.: wrote 18 (5e/8m/5h; 3 multi, 2 tf, 2 code).',
  ].join('\n')
}

function verifyPrompt(it) {
  const out = KT + '/content/questions/' + it.topic + '/' + it.base + '.json'
  return [
    'You are a ruthless technical fact-checker validating exam questions before publication. Correctness is the ONLY priority.',
    '',
    'INPUTS — read BOTH in full:',
    '  - Ground truth reviewer: ' + REV + '/' + it.src,
    '  - Generated questions file to AUDIT and FIX (overwrite in place): ' + out,
    '',
    'For EACH question, independently work out the correct answer from the source and your own expertise, then verify:',
    '  1. The marked "answer" is actually correct.',
    '  2. mcq/truefalse: exactly one option is correct and EVERY other option is genuinely wrong. multi: the marked subset is exactly the correct set (none missing, none extra).',
    '  3. The "explanation" is accurate and consistent with the answer and the source.',
    '  4. The question is unambiguous and well-posed; no "all/none of the above".',
    '  5. Any "code" is valid and behaves exactly as the question claims.',
    '  6. Schema valid: difficulty in {easy,medium,hard}; 2-6 distinct non-empty options; answer index/indices in range; every question has an "answer".',
    '',
    'FIX problems in place: correct a wrong answer index; rewrite misleading or accidentally-correct distractors; fix inaccurate explanations. If a question is ambiguous, factually shaky, or unfixable, DELETE it. Remove duplicates. Keep all the good questions unchanged.',
    '',
    'OUTPUT: Use the Write tool to OVERWRITE the same file with the COMPLETE corrected set (all surviving questions, fixes applied), same JSON schema ({ topic, source, questions:[...] }). Valid JSON only, no commentary.',
    'Return ONLY a one-line summary, e.g.: checked 18, fixed 2 answers + 1 explanation, dropped 1; 17 remain.',
  ].join('\n')
}

const results = await pipeline(
  FILES,
  (it) => agent(genPrompt(it), { label: 'gen:' + it.base.replace(/-reviewer$/, '').slice(0, 28), phase: 'Generate', agentType: 'general-purpose' }),
  (genSummary, it) => agent(verifyPrompt(it), { label: 'verify:' + it.base.replace(/-reviewer$/, '').slice(0, 26), phase: 'Verify', agentType: 'general-purpose' })
    .then((vSummary) => ({ base: it.base, topic: it.topic, gen: genSummary, verify: vSummary })),
)

const ok = results.filter(Boolean)
log('Done: ' + ok.length + '/' + FILES.length + ' files generated + verified')
return ok
