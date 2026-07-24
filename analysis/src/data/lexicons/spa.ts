import type { Lexicon } from "./lexicon";

// Translated from the en/nl scenario template (see README) without Spanish
// real-mail validation: phrase-grade only, precision over recall.
export const spa: Lexicon = {
  purchaseConfirmation: [
    /\bconfirmaci[oó]n (?:de )?pedido\b/, /\bconfirmaci[oó]n de compra\b/,
    /\bconfirmaci[oó]n de env[ií]o\b/, /\bconfirmaci[oó]n de reserva\b/,
    /\b(?:tu|su) pedido\b/, /\bconfirmaci[oó]n de pago\b/,
    /\bpago (?:aceptado|recibido|procesado|confirmado)\b/,
    /\breembolso\b/, /\bha sido enviad[oa]\b/, /\b(?:cita|reserva) confirmad[ao]\b/,
  ],
  purchaseVocab: [
    /\bn[uú]mero de (?:pedido|seguimiento)\b/, /\bfactura\b/,
    /\benv[ií]o\b/, /\bentrega\b/, /\bpaquete\b/,
  ],
  updateVocab: [
    /\bbienvenid[oa]\b/, /\bgracias por (?:registrarte|suscribirte|unirte)\b/,
    /\b(?:confirma|verifica) tu (?:correo|email|cuenta)\b/, /\bactiva tu cuenta\b/,
    /\b(?:restablecer?|cambiar) (?:tu )?contrase[nñ]a\b/,
    /\bcontrase[nñ]a (?:actualizada|cambiada|caducada)\b/, /\bnueva contrase[nñ]a\b/,
    /\bc[oó]digo de verificaci[oó]n\b/, /\bc[oó]digo de seguridad\b/,
    /\brecordatorio\b/, /\btu cita\b/, /\brenovaci[oó]n\b/,
    /\balerta de seguridad\b/, /\bnuevo inicio de sesi[oó]n\b/,
  ],
  unsubscribeLinkText: [
    /\bdarse?\s*de\s*baja\b/i,
    /\bdesuscribirse\b/i,
    /\bcancelar\s*suscripci[oó]n\b/i,
    /\bgestionar (?:tus )?preferencias\b/i,
    /\bno\s*(?:quiero|deseo)\s*recibir\b/i,
  ],
  unsubscribeUrl: [/desuscribirse/i, /darse-de-baja/i],
  footerCue: [
    /\brecibes? este\b/i,
    /\beste (?:correo|mensaje) (?:fue|ha sido) enviado\b/i,
    /\btodos los derechos reservados\b/i,
    /\bpol[íi]tica de privacidad\b/i,
    /\baviso legal\b/i,
    /\b(?:nif|cif)\b/i,
    /\bcondiciones generales\b/i,
  ],
  referenceCodeStem: [/pedido/, /reserva/, /factura/],
  referenceCodeLabel: [/n[uú]mero/, /referencia/],
};
