import type { Lexicon } from "./lexicon";

export const por: Lexicon = {
  purchaseConfirmation: [
    /\bconfirma[cç][aã]o (?:do )?pedido\b/, /\bseu pedido\b/,
  ],
  purchaseVocab: [
    /\bfatura\b/, /\bn[uú]mero do pedido\b/, /\breembolso\b/,
  ],
  updateVocab: [
    /\bbem-vindo\b/, /\bredefinir senha\b/, /\bc[oó]digo de verifica[cç][aã]o\b/,
  ],
  unsubscribeLinkText: [
    /\bdesinscrever\b/i,
    /\bcancelar\s*(?:a\s*)?inscri[cç][aã]o\b/i,
    /\bdescadastrar\b/i,
  ],
  unsubscribeUrl: [/desinscrever/i, /descadastrar/i],
  footerCue: [
    /\brecebeu est[ea]\b/i,
    /\btodos os direitos reservados\b/i,
    /\bpol[íi]tica de privacidade\b/i,
    /\bnif\b/i,
  ],
};
