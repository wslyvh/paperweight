// One lexicon per language, all fields required — TypeScript enforces that a
// new language file covers every category. See README.md for contribution
// rules.
export interface Lexicon {
  // One hit is purchase evidence on its own (confirmation-grade phrases).
  purchaseConfirmation: RegExp[];
  // Weak purchase vocabulary: two distinct hits required.
  purchaseVocab: RegExp[];
  // Account/service lifecycle: welcome, verification, password/security,
  // reminders, service notifications.
  updateVocab: RegExp[];
  // Matched against the visible text of a link.
  unsubscribeLinkText: RegExp[];
  // Matched against the href when the link text is generic ("click here").
  unsubscribeUrl: RegExp[];
  // Boilerplate that marks the start of a message's closing block: legal and
  // company details, "you are receiving this because". Matched line by line,
  // and only in the last stretch of the body (see detect/footer.ts).
  footerCue: RegExp[];
  // Record-type stems for reference codes ("order", "commande", "bestell").
  // Fragments, not standalone patterns: merged across all languages and
  // assembled into one language-agnostic regex in classify/text-signals.ts.
  // Reference detection is global, so a file lists only the stems distinctive
  // to it and may leave this empty when another language already carries them.
  referenceCodeStem: RegExp[];
  // Identifier words that follow a stem ("number", "numéro", "referentie").
  // Same merge/assembly and "distinctive only" rule as referenceCodeStem.
  referenceCodeLabel: RegExp[];
}
