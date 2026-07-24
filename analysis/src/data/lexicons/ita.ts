import type { Lexicon } from "./lexicon";

// Translated from the en/nl scenario template (see README) without Italian
// real-mail validation: phrase-grade only, precision over recall.
export const ita: Lexicon = {
  purchaseConfirmation: [
    /\bconferma (?:dell'?)?ordine\b/, /\bconferma d(?:'|i )acquisto\b/,
    /\bconferma di spedizione\b/, /\bconferma di prenotazione\b/,
    /\btuo ordine\b/, /\bconferma di pagamento\b/,
    /\bpagamento (?:autorizzato|ricevuto|elaborato|confermato)\b/,
    /\brimborso\b/, /\b[eè] stat[oa] spedit[oa]\b/,
    /\b(?:appuntamento|prenotazione) confermat[oa]\b/,
  ],
  purchaseVocab: [
    /\bnumero (?:d'|dell'|dell )?ordine\b/, /\bnumero di tracciamento\b/,
    /\bfattura\b/, /\bspedizione\b/, /\bconsegna\b/, /\bpacco\b/,
  ],
  updateVocab: [
    /\bbenvenut[oa]\b/, /\bgrazie per (?:esserti registrato|la registrazione|l'iscrizione)\b/,
    /\b(?:conferma|verifica) (?:la tua|il tuo) (?:e-?mail|account)\b/,
    /\battiva il tuo account\b/,
    /\breimposta(?:re)? (?:la )?password\b/, /\bpassword dimenticata\b/,
    /\bnuova password\b/, /\bcodice di verifica\b/, /\bcodice di sicurezza\b/,
    /\bpromemoria\b/, /\bil tuo appuntamento\b/, /\brinnovo\b/,
    /\bavviso di sicurezza\b/, /\bnuovo accesso\b/,
  ],
  unsubscribeLinkText: [
    /\bdisiscriversi\b/i,
    /\b(?:annullare?|cancellare?)\s*(?:l[a']?\s*)?iscrizione\b/i,
    /\bcancella(?:ti)?\s*dalla\s*lista\b/i,
    /\bgestisci (?:le tue )?preferenze\b/i,
    /\bnon\s*(?:voglio|desidero)\s*(?:pi[uù]\s*)?ricevere\b/i,
  ],
  unsubscribeUrl: [/disiscriversi/i, /cancella-iscrizione/i],
  footerCue: [
    /\bricevi questa\b/i,
    /\bquesta? (?:e-?mail|messaggio) [eè] stat[oa] inviat[oa]\b/i,
    /\btutti i diritti riservati\b/i,
    /\binformativa sulla privacy\b/i,
    /\bpartita iva\b/i,
    /\btermini e condizioni\b/i,
  ],
  referenceCodeStem: [/ordine/, /prenotazione/, /fattura/],
  referenceCodeLabel: [/riferimento/],
};
