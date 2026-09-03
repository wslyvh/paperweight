# @paperweight/analysis

Standalone library that turns text into typed evidence about personal data.
Runs fully local: no network, no telemetry, no knowledge of where the text
came from or where the results go.

```ts
analyzeText(text, options?) -> Promise<TextAnalysis>
```

Paperweight is the first consumer. A CLI, mobile app, or PII-detection
service can call the same function with a bare string.

## Contract

**`src/types.ts`, dependency-free `src/contracts.ts`, and the test suite are
the contract.** This README describes boundaries and intent only — it never
restates interfaces.

Every result carries `version` (`ENGINE_VERSION`). It tracks the **findings**
contract: consumers persist it per analyzed document and re-analyze when it
changes, so **any change to a detector or a normalizer MUST bump
`ENGINE_VERSION`** or existing findings go stale and never re-analyze.
Message-type classification sits outside that contract — type is not versioned
per document, so a classifier change reaches already-stored documents through a
consumer's release migration, not through this constant.

Released engine versions follow the package version and are immutable once
shipped. They are release cache keys, not counters for every local edit:
pre-release databases may be explicitly invalidated while work is in progress,
then the package and engine version are set once for the release. `0.1.0` is the
first release value; the internal `0.2.x` values used while integrating
Paperweight were never published.

Paperweight's explicit development invalidation must clear both per-message
`analysis_version` state and its database-level
`analysis:findings-version` convergence marker.

## Two layers

1. **Core** — `analyzeText`: text in, findings out. Knows nothing about
   email, HTML, or files.
2. **Adapters** — strip a source down to text and hand it to the core, so
   inputs and outputs stay consistent across sources. Today: email
   (`parseEml` for MIME, HTML-to-text extraction, plus `analyzeMessage`,
   which adds email-only results — message type and unsubscribe resolution).
   A future source (PDF, export files, …) is a new adapter that produces
   text; the core does not change. HTML→text conversion is an internal adapter
   detail; consumers store the exact selected text returned by
   `analyzeMessage`.

   `analyzeMessage` returns the body text it selected, so a consumer that
   stores the body stores the exact string the finding offsets index into.
   Consumers may set a maximum text length; truncation happens before
   classification and detection and is reported on the result. For offline
   re-analysis, a previously resolved unsubscribe fact can be supplied so a
   discarded HTML link still informs type and footer placement. For a live
   message, body-footer structure is resolved independently of the preferred
   unsubscribe action: an RFC/List-Unsubscribe header can win the action while
   the body link still anchors the footer.
   `promotion` is an actionable type: `analyzeMessage` emits it only when
   unsubscribe resolution produced a concrete method and target. `List-ID`,
   `Precedence: bulk`, one-click metadata, and a bulk-looking layout remain
   supporting signals, but cannot create a promotion by themselves.
   It reads the subject too, but only to type the message: findings come from
   the body alone, so a value that appears solely in a subject is never a
   finding and a subject can never shift an offset.

## Boundaries

This package never imports providers (Gmail/Graph/IMAP/OAuth), Electron,
IPC, UI, databases, workers, or anything that touches the network.

The engine returns evidence with offsets, confidence, and signals. Consumers
own storage, aggregation across documents, suppression policy, masking,
scheduling, and any product claim about ownership or retention.

Consumers may supply already-normalized `knownValues` for the existing finding
types. For `date_of_birth`, scanning is activated only by a complete canonical
known DOB (`YYYY-MM-DD`). Complete date candidates are calendar-validated and
normalized; only exact equivalents emit `known-value.exact`. The engine does
not perform generic date detection or claim profile ownership. For other known
types, it finds exact occurrences under that type's normal formatting rules
and emits `known-value.exact` evidence when a generic detector did not already
produce the same value. This is detector input, not an ownership claim:
consumers own the policy for deciding whose value it is.

A structured address may additionally carry normalized street, house-number,
and postcode components. The engine requires the exact street phrase adjacent
to the exact house number plus the exact canonical postcode within one short
address block. Their overall order may vary; city, region, and country labels
may move or be absent. A component hit emits the profile row's one canonical
value with `known-value.address-components`. Postcode-only and raw-address
values keep whole-value matching, and no spelling or token fuzziness is added.

## Detection: rules + model

**Layer 1 — deterministic rules** for structured values. Validation is real
verification wherever a checksum exists:

| Type          | Validation                                                    | Confidence               |
| ------------- | ------------------------------------------------------------- | ------------------------ |
| `email`       | pragmatic RFC-ish pattern, normalized domain                  | `pattern`                |
| `iban`        | country length table + ISO 7064 mod-97                        | `verified`               |
| `credit_card` | IIN prefix + scheme length + Luhn; masked forms separately    | `verified` / `contextual`|
| `phone`       | libphonenumber-js; region from locale option or sender ccTLD  | `verified` / `contextual`|
| `date_of_birth` | complete known DOB; calendar-valid candidate normalized     | `pattern`                |
| `national_id` | per-country registry: official checksum, optional context word| `verified` / `contextual`|
| `postal_code` | per-country registry; only distinctive formats stand alone    | `pattern`                |
| `address`     | postcode-anchored street grammar                              | `contextual`             |

Country coverage lives in `src/data/` registries. Adding a country is a data
+ fixtures contribution, never an engine change.

**Layer 2 — contextual model** (planned, gated) for entities without a stable
format: person names, free-form addresses. One existing off-the-shelf
multilingual token classifier, evaluated against a frozen suite before it
ships. It must be commercially licensable, fully local, small enough to
bundle, and measurably better per language. Model spans map into the same
`Finding` shape and pass through the same post-processing. If no candidate
passes, the structured layer ships alone.

Pipeline: detect language (metadata) → mark quoted and footer regions → run
detectors → dedupe by normalized value → resolve overlaps (longer span, then
stronger confidence) → tag quoted / footer / own-identifier / self-reference →
return versioned findings.

The tags are facts about *where* a value sits and *whose* it is, never a
judgement about whether it matters — a consumer decides that. `inFooter` marks
the closing boilerplate block, where a company's own address and switchboard
number live; `selfReference` marks an email at the sender's own domain.
Cross-document facts such as "also seen in this sender's footer" and distinct
company count belong to the consumer's aggregation layer; the core has no
mailbox or vendor graph.

## Languages

Structured formats are language-independent; they scale by country registry.
Language detection (`franc`, ISO 639-3) is metadata and a future model hint.
The message-type classifier uses per-language lexicons — see
[`src/data/lexicons/README.md`](src/data/lexicons/README.md) for
contribution rules.

## Testing

`yarn vitest run`. Unit tests per validator and normalizer, positive and
negative span tests, a false-positive regression per confirmed defect, and
synthetic `fixtures/` cases run through the harness. **Never commit real
mail content or values — including in comments.** Recreate cases
synthetically. Dev CLI: `yarn analyze <file.eml|file.txt>`.

## Future improvements

- Message-level sensitive-topic results (health/financial as a separate
  output concept, not fake spans) once a consumer screen exists.
- More country registries; lexicon translation pass for de/fr/es/it/pt.
- The contextual model layer, per the gate above.
