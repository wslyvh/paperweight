import type { Lexicon } from "./lexicon";

export const deu: Lexicon = {
  purchaseConfirmation: [
    /\bbestellbest[aä]tigung\b/, /\bihre bestellung\b/, /\br[uü]ckerstattung\b/,
    /\bzahlung (?:autorisiert|verarbeitet|eingegangen)\b/,
  ],
  purchaseVocab: [
    /\bbestellung\b/, /\bversandt?\b/, /\brechnung\b/, /\bquittung\b/,
    /\blieferung\b/, /\bsendung\b/, /\bpaket\b/,
  ],
  updateVocab: [
    /\bwillkommen bei\b/, /\bpasswort (?:zur[uü]cksetzen|vergessen|ge[aä]ndert)\b/,
    /\bneues passwort\b/, /\bverifizierungscode\b/,
    /\bterminbest[aä]tigung\b/, /\bterminerinnerung\b/, /\bihr termin\b/, /\berinnerung\b/,
  ],
  unsubscribeLinkText: [
    /\babmelden\b/i,
    /\babbestellen\b/i,
    /\babmeldelink\b/i,
    /\bnicht\s*mehr\s*erhalten\b/i,
  ],
  unsubscribeUrl: [/abmelden/i, /abbestellen/i],
  footerCue: [
    /\bsie (?:erhalten|bekommen) diese\b/i,
    /\balle rechte vorbehalten\b/i,
    /\bimpressum\b/i,
    /\bhandelsregister\b/i,
    /\bust-?\s?idnr\b/i,
    /\bdatenschutz(?:erkl[aä]rung)?\b/i,
    /\bagb\b/i,
  ],
};
