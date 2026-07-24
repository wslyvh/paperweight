import type { Lexicon } from "./lexicon";

// Translated from the en/nl scenario template (see README) without German
// real-mail validation: phrase-grade only, precision over recall.
export const deu: Lexicon = {
  purchaseConfirmation: [
    /\bbestellbest[aä]tigung\b/, /\bkaufbest[aä]tigung\b/, /\bversandbest[aä]tigung\b/,
    /\bbuchungsbest[aä]tigung\b/, /\breservierungsbest[aä]tigung\b/,
    /\bihre bestellung\b/, /\bzahlungsbest[aä]tigung\b/,
    /\bzahlung (?:autorisiert|verarbeitet|eingegangen|erhalten)\b/,
    /\br[uü]ckerstattung\b/, /\bwurde versandt\b/, /\btermin (?:best[aä]tigt|steht fest)\b/,
  ],
  purchaseVocab: [
    /\bbestellung\b/, /\bbestellnummer\b/, /\bsendungsnummer\b/, /\bsendungsverfolgung\b/,
    /\bversand\b/, /\bzustellung\b/, /\bzugestellt\b/, /\bpaket\b/, /\blieferung\b/,
    /\brechnung\b/, /\bquittung\b/,
  ],
  updateVocab: [
    /\bwillkommen bei\b/, /\bdanke f[uü]r (?:ihre|deine) (?:anmeldung|registrierung)\b/,
    /\b(?:e-?mail|konto) best[aä]tigen\b/, /\bkonto aktivieren\b/,
    /\bpasswort (?:zur[uü]cksetzen|vergessen|ge[aä]ndert|abgelaufen)\b/, /\bneues passwort\b/,
    /\bverifizierungscode\b/, /\bbest[aä]tigungscode\b/, /\bsicherheitscode\b/,
    /\berinnerung\b/, /\bterminerinnerung\b/, /\bihr termin\b/,
    /\bverl[aä]ngerung\b/, /\bsicherheitswarnung\b/, /\bneue anmeldung\b/,
  ],
  unsubscribeLinkText: [
    /\babmelden\b/i,
    /\babbestellen\b/i,
    /\babmeldelink\b/i,
    /\beinstellungen verwalten\b/i,
    /\bnicht\s*mehr\s*erhalten\b/i,
  ],
  unsubscribeUrl: [/abmelden/i, /abbestellen/i],
  footerCue: [
    /\bsie (?:erhalten|bekommen) diese\b/i,
    /\bdiese (?:e-?mail|nachricht) (?:wurde|ging) an\b/i,
    /\balle rechte vorbehalten\b/i,
    /\bimpressum\b/i,
    /\bhandelsregister\b/i,
    /\bust-?\s?idnr\b/i,
    /\bdatenschutz(?:erkl[aä]rung)?\b/i,
    /\bagb\b/i,
  ],
  // "nummer"/"code" labels are shared with nld/eng; German carries only its
  // distinctive stems (see referenceCodeStem docs in lexicon.ts).
  referenceCodeStem: [/buchungs?/, /rechnungs?/],
  referenceCodeLabel: [],
};
