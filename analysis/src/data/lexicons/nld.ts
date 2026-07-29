import type { Lexicon } from "./lexicon";

export const nld: Lexicon = {
  purchaseConfirmation: [
    /\bbestelbevestiging\b/, /\breserveringsbevestiging\b/, /\bboekingsbevestiging\b/,
    /\b(?:uw|je) bestelling\b/, /\bontvangstbewijs\b/, /\bterugbetaling\b/,
    /\bbetaling (?:geautoriseerd|verwerkt|ontvangen)\b/, /\bafspraak (?:staat|bevestigd)\b/,
  ],
  purchaseVocab: [
    /\bbestelling\b/, /\bbestelnummer\b/, /\bordernummer\b/, /\bverzonden\b/,
    /\bverzending\b/, /\bbezorging\b/, /\bbezorgd\b/, /\bpakket\b/, /\blevering\b/,
    /\bfactuur\b/, /\baankoop\b/, /\baankopen\b/,
  ],
  updateVocab: [
    /\bwelkom (?:bij|op)\b/, /\bbevestig (?:je |uw )?e-?mail\b/,
    // phrase-grade only: bare "wachtwoord"/"afspraak"/"herinner" fire on 1:1 human mail
    /\bwachtwoord (?:opnieuw instellen|vergeten|gewijzigd|verlopen)\b/, /\bnieuw wachtwoord\b/,
    /\bverificatiecode\b/, /\bherinnering\b/, /\bherinneren (?:wij|we) (?:u|je)\b/,
    /\b(?:uw|je|jouw) afspraak\b/, /uitslag/, /pati[eë]ntenportaal/,
    /\bpremie\b/, /\bpolis\b/,
  ],
  unsubscribeLinkText: [
    /\buitschrijven\b/i,
    /\bafmelden\b/i,
    // separable verb: "meld u (dan) (nu) af" — "afmelden" alone misses it
    /\bmeld\s+(?:u|je)\s+(?:dan\s+)?(?:nu\s+)?af\b/i,
    /\bvoorkeuren\s*beheren\b/i,
    /\bniet?\s*meer\s*ontvangen\b/i,
  ],
  unsubscribeUrl: [/uitschrijven/i, /afmelden/i],
  footerCue: [
    /\b(?:je|u) (?:ontvangt|krijgt) (?:deze|dit)\b/i,
    /\bdeze (?:e-?mail|bericht) is (?:verstuurd|verzonden) naar\b/i,
    /\balle rechten voorbehouden\b/i,
    /\bkvk[-\s]?(?:nummer|nr)?\b/i,
    /\bbtw[-\s]?(?:nummer|nr)\b/i,
    /\bprivacybeleid\b/i,
    /\balgemene voorwaarden\b/i,
  ],
  referenceCodeStem: [/bestell?/, /boekings?/, /reserverings?/, /transactie/, /factuur/],
  referenceCodeLabel: [/nummer/, /referentie/],
};
