export const meta = {
  name: 'kt-verify-existing',
  description: 'Adversarially verify + polish the already-generated question files',
  phases: [
    { title: 'Verify', detail: 'one fact-checker per file audits, fixes, and polishes' },
  ],
}

const REV = 'C:/r/reviewer'
const KT = 'C:/r/knowledge-test'

const FILES = __FILES__

function verifyPrompt(it) {
  const out = KT + '/content/questions/' + it.topic + '/' + it.base + '.json'
  return [
    'You are a ruthless technical fact-checker validating exam questions before publication. Correctness is the ONLY priority.',
    '',
    'INPUTS — read BOTH in full:',
    '  - Ground truth reviewer: ' + REV + '/' + it.src,
    '  - Questions file to AUDIT and FIX (overwrite in place): ' + out,
    '',
    'For EACH question, independently work out the correct answer from the source and your own expertise, then verify:',
    '  1. The marked "answer" is actually correct.',
    '  2. mcq/truefalse: exactly one option is correct and EVERY other option is genuinely wrong. multi: the marked subset is exactly the correct set (none missing, none extra).',
    '  3. The "explanation" is accurate and consistent with the answer and the source.',
    '  4. The question is unambiguous and well-posed; no "all/none of the above".',
    '  5. Any "code" is valid and behaves exactly as the question claims.',
    '  6. Schema valid: type in {mcq,multi,truefalse}; difficulty in {easy,medium,hard}; 2-6 distinct non-empty options; every question has an in-range "answer".',
    '',
    'FIX problems in place: correct a wrong answer index; rewrite misleading or accidentally-correct distractors; fix inaccurate explanations. If a question is ambiguous, factually shaky, or unfixable, DELETE it. Remove duplicates. Keep all the good questions unchanged.',
    '',
    'ALSO POLISH (so each question stands alone as a quiz item):',
    '  - Reword any question or explanation that refers to "the reviewer"/"the guide"/"the source"/"the author" (e.g. "Why does the reviewer warn against X" -> "Why should you avoid X"; "the reviewer\'s four-part test" -> "the four-part test"). Keep the meaning identical; never invent facts.',
    '  - Balance option lengths so the correct answer is NOT consistently the longest/most-detailed option. Trim or pad distractors to comparable length.',
    '',
    'OUTPUT: Use the Write tool to OVERWRITE the same file with the COMPLETE corrected set (all surviving questions, fixes applied), same JSON schema ({ topic, source, questions:[...] }). Valid JSON only, no commentary.',
    'Return ONLY a one-line summary, e.g.: checked 18, fixed 2 answers + 1 explanation, reworded 5 reviewer-refs, dropped 1; 17 remain.',
  ].join('\n')
}

const results = await pipeline(
  FILES,
  (it) => agent(verifyPrompt(it), { label: 'verify:' + (it.topic + '/' + it.base).replace(/-reviewer$/, '').slice(-30), phase: 'Verify', agentType: 'general-purpose' })
    .then((vSummary) => ({ base: it.base, topic: it.topic, verify: vSummary })),
)

const ok = results.filter(Boolean)
log('Verify pass done: ' + ok.length + '/' + FILES.length + ' files')
return ok
