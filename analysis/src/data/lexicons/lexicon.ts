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
}
