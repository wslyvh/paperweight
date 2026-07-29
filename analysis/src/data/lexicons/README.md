# Language lexicons

One file per language (`eng.ts`, `nld.ts`, …), each exporting a single
`Lexicon` object. Codes are **ISO 639-3** — the same codes franc emits and
the engine's `lang` field carries, so there is no conversion table anywhere. These patterns drive message-type classification and footer-
unsubscribe detection. Adding or improving a language is a data contribution —
no engine changes needed.

## Status

`en` and `nl` are curated from a real mailbox and carry the scenario coverage
(purchase confirmations, security alerts, appointment/insurance/lab updates,
separable-verb unsubscribe phrasing, …). `de`, `fr`, `es`, `it`, `pt` are
unverified starter sets.

**TODO (translation pass):** translate the full `en`/`nl` scenario list into
each other language — not word-for-word, but the equivalent native phrasing a
real sender would use — and hold them to the same precision rules below.
Until then, expect weaker recall (and review single-word entries critically)
in those languages. Reference-code stems/labels (`referenceCodeStem`,
`referenceCodeLabel`) are part of the same pass — extend them per language
here; `classify/text-signals.ts` only assembles the merged fragments.

## Adding a language

1. Copy an existing file (e.g. `spa.ts`) to `<iso-639-3>.ts` (the code franc
   reports for that language).
2. Fill every field — the `Lexicon` interface makes missing categories a type
   error.
3. Register it in `index.ts` (`LEXICONS` array).
4. Add one spot-check per category to `test/lexicons.test.ts`.

## Pattern rules (precision over recall)

- **No pattern may read as an English word or common substring.** A missed
  match is fine; a false positive is not. `\border\b` is banned ("in order
  to"); `\byour order\b` is fine.
- **No single common word in the pattern's own language either.** One
  `updateVocab` hit alone classifies non-list mail, so bare `afspraak`,
  `Termin` or `wachtwoord` would tag a friend's mail as update. Write the
  phrase a *sender* uses ("uw afspraak", "wachtwoord vergeten"), not the
  topic word.
- Use `\b` word boundaries for whole words; bare substrings only for
  compound-word languages where they're distinctive (Dutch `/uitslag/` catches
  "labuitslagen").
- `purchaseConfirmation` is confirmation-grade: one hit alone classifies the
  mail. Only phrases that unambiguously say "a transaction/booking happened"
  belong here. Generic commerce words go in `purchaseVocab` (two distinct
  hits required).
- Patterns are matched against lowercased text — write them in lowercase,
  no `/i` flag needed (except `unsubscribeLinkText`/`unsubscribeUrl`, which
  run against original link text and hrefs).
- Every new pattern needs a test or fixture that exercises it. False
  positives found later become regression fixtures.
