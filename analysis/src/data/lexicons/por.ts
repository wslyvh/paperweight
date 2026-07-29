import type { Lexicon } from "./lexicon";

// Translated from the en/nl scenario template (see README) without Portuguese
// real-mail validation: phrase-grade only, precision over recall. Covers PT-PT
// and PT-BR variants (senha/palavra-passe, rastreio/rastreamento).
export const por: Lexicon = {
  purchaseConfirmation: [
    /\bconfirma[cç][aã]o (?:do )?pedido\b/, /\bconfirma[cç][aã]o de compra\b/,
    /\bconfirma[cç][aã]o de envio\b/, /\bconfirma[cç][aã]o de reserva\b/,
    /\bseu pedido\b/, /\bconfirma[cç][aã]o de pagamento\b/,
    /\bpagamento (?:autorizado|recebido|processado|confirmado)\b/,
    /\breembolso\b/, /\bfoi enviad[oa]\b/,
    /\b(?:consulta|reserva|agendamento) confirmad[oa]\b/,
  ],
  purchaseVocab: [
    /\bn[uú]mero do pedido\b/, /\bc[oó]digo de (?:rastreio|rastreamento)\b/,
    /\bfatura\b/, /\benvio\b/, /\bentrega\b/, /\bencomenda\b/,
  ],
  updateVocab: [
    /\bbem-?vind[oa]\b/, /\bobrigado por se (?:registrar|inscrever|cadastrar)\b/,
    /\b(?:confirme|verifique) (?:o seu|seu) (?:e-?mail|email|conta)\b/,
    /\bative (?:a sua|sua) conta\b/,
    /\b(?:redefinir|redefina) (?:a )?(?:senha|palavra-passe)\b/, /\bsenha esquecida\b/,
    /\bnova senha\b/, /\bc[oó]digo de verifica[cç][aã]o\b/, /\bc[oó]digo de seguran[cç]a\b/,
    /\blembrete\b/, /\bsua consulta\b/, /\brenova[cç][aã]o\b/,
    /\balerta de seguran[cç]a\b/, /\bnovo (?:in[ií]cio de sess[aã]o|login)\b/,
  ],
  unsubscribeLinkText: [
    /\bdesinscrever\b/i,
    /\bcancelar\s*(?:a\s*)?inscri[cç][aã]o\b/i,
    /\bdescadastrar\b/i,
    /\bger(?:ir|enciar) (?:as suas |suas )?prefer[eê]ncias\b/i,
    /\bn[aã]o (?:quero|desejo) (?:mais )?receber\b/i,
  ],
  unsubscribeUrl: [/desinscrever/i, /descadastrar/i, /cancelar-inscricao/i],
  footerCue: [
    /\brecebeu est[ea]\b/i,
    /\best[ea] (?:e-?mail|mensagem) foi enviad[oa]\b/i,
    /\btodos os direitos reservados\b/i,
    /\bpol[íi]tica de privacidade\b/i,
    /\bnif\b/i,
    /\btermos e condi[cç][õo]es\b/i,
  ],
  // "número" is covered by spa's n[uú]mero label; Portuguese adds only stems.
  referenceCodeStem: [/fatura/],
  referenceCodeLabel: [],
};
