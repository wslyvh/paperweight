import type { Lexicon } from "./lexicon";

export const ita: Lexicon = {
  purchaseConfirmation: [
    /\bconferma (?:dell'?)?ordine\b/, /\btuo ordine\b/, /\brimborso\b/,
  ],
  purchaseVocab: [
    /\bnumero (?:d'|dell'|dell )?ordine\b/, /\bfattura\b/, /\bspedizione\b/,
  ],
  updateVocab: [
    /\bbenvenuto\b/, /\bcodice di verifica\b/,
  ],
  unsubscribeLinkText: [
    /\bdisiscriversi\b/i,
    /\b(?:annullare?|cancellare?)\s*(?:l[a']?\s*)?iscrizione\b/i,
  ],
  unsubscribeUrl: [/disiscriversi/i],
  footerCue: [
    /\bricevi questa\b/i,
    /\btutti i diritti riservati\b/i,
    /\binformativa sulla privacy\b/i,
    /\bpartita iva\b/i,
  ],
};
