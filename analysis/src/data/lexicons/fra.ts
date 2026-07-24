import type { Lexicon } from "./lexicon";

export const fra: Lexicon = {
  purchaseConfirmation: [
    /\bconfirmation de commande\b/, /\bvotre commande\b/, /\bremboursement\b/,
  ],
  purchaseVocab: [
    /\bnum[eé]ro de commande\b/, /\bfacture\b/, /\bexp[eé]dition\b/,
  ],
  updateVocab: [
    /\bbienvenue\b/, /\bmot de passe\b/, /\bcode de v[eé]rification\b/,
    /\brappel de (?:votre|rendez-vous|paiement)\b/,
  ],
  unsubscribeLinkText: [
    /\bse\s*d[eé]sabonner\b/i,
    /\bd[eé]sabonnement\b/i,
    /\bd[eé]sinscription\b/i,
    /\bne\s*plus\s*recevoir\b/i,
  ],
  unsubscribeUrl: [/desabonner/i, /desinscription/i],
  footerCue: [
    /\bvous recevez cet?\b/i,
    /\btous droits r[ée]serv[ée]s\b/i,
    /\bmentions l[ée]gales\b/i,
    /\bpolitique de confidentialit[ée]\b/i,
    /\bconditions g[ée]n[ée]rales\b/i,
    /\bsiret\b/i,
  ],
};
