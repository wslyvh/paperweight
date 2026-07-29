import type { Lexicon } from "./lexicon";

// Translated from the en/nl scenario template (see README) without French
// real-mail validation: phrase-grade only, precision over recall.
export const fra: Lexicon = {
  purchaseConfirmation: [
    /\bconfirmation de commande\b/, /\bconfirmation d'achat\b/,
    /\bconfirmation d'exp[eé]dition\b/, /\bconfirmation de r[eé]servation\b/,
    /\bvotre commande\b/, /\bconfirmation de paiement\b/,
    /\bpaiement (?:accept[eé]|re[cç]u|trait[eé]|confirm[eé])\b/,
    /\bremboursement\b/, /\bvotre re[cç]u\b/,
    /\ba [eé]t[eé] exp[eé]di[eé]e?\b/, /\brendez-vous confirm[eé]\b/,
  ],
  purchaseVocab: [
    /\bnum[eé]ro de commande\b/, /\bnum[eé]ro de suivi\b/, /\bfacture\b/,
    /\bexp[eé]dition\b/, /\blivraison\b/, /\bcolis\b/,
  ],
  updateVocab: [
    /\bbienvenue\b/, /\bmerci (?:de|pour) votre inscription\b/,
    /\b(?:confirmez|v[eé]rifiez) votre (?:e-?mail|adresse|compte)\b/,
    /\bactivez votre compte\b/,
    /\b(?:r[eé]initialis(?:er|ez)|changez) votre mot de passe\b/, /\bnouveau mot de passe\b/,
    /\bmot de passe (?:oubli[eé]|r[eé]initialis[eé]|expir[eé]|modifi[eé])\b/,
    /\bcode de v[eé]rification\b/, /\bcode de s[eé]curit[eé]\b/, /\bcode (?:à|a) usage unique\b/,
    /\brappel de (?:votre|rendez-vous|paiement)\b/, /\bvotre rendez-vous\b/,
    /\brenouvellement\b/, /\balerte de s[eé]curit[eé]\b/, /\bnouvelle connexion\b/,
  ],
  unsubscribeLinkText: [
    /\bse\s*d[eé]sabonner\b/i,
    /\bd[eé]sabonnement\b/i,
    /\bd[eé]sinscription\b/i,
    /\bg[eé]rer (?:vos |mes )?pr[eé]f[eé]rences\b/i,
    /\bne\s*plus\s*recevoir\b/i,
  ],
  unsubscribeUrl: [/desabonner/i, /desinscription/i],
  footerCue: [
    /\bvous recevez cet?\b/i,
    /\bcet? (?:e-?mail|message) a [eé]t[eé] envoy[eé]/i,
    /\btous droits r[ée]serv[ée]s\b/i,
    /\bmentions l[ée]gales\b/i,
    /\bpolitique de confidentialit[ée]\b/i,
    /\bconditions g[ée]n[ée]rales\b/i,
    /\bsiret\b/i,
    /\btva intracommunautaire\b/i,
  ],
  referenceCodeStem: [/commande/, /r[eé]servation/, /facture/],
  referenceCodeLabel: [/num[eé]ro/, /r[eé]f[eé]rence/, /n[°º]/],
};
