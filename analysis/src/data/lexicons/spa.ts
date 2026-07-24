import type { Lexicon } from "./lexicon";

export const spa: Lexicon = {
  purchaseConfirmation: [
    /\bconfirmaci[oó]n (?:de )?pedido\b/, /\btu pedido\b/, /\breembolso\b/,
  ],
  purchaseVocab: [
    /\bn[uú]mero de (?:pedido|seguimiento)\b/, /\bfactura\b/,
  ],
  updateVocab: [
    /\bbienvenido\b/, /\brestablecer (?:tu |su )?contraseña\b/,
    /\bcontraseña (?:actualizada|cambiada)\b/, /\bc[oó]digo de verificaci[oó]n\b/,
  ],
  unsubscribeLinkText: [
    /\bdarse?\s*de\s*baja\b/i,
    /\bdesuscribirse\b/i,
    /\bcancelar\s*suscripci[oó]n\b/i,
  ],
  unsubscribeUrl: [/desuscribirse/i, /darse-de-baja/i],
  footerCue: [
    /\brecibes? este\b/i,
    /\btodos los derechos reservados\b/i,
    /\bpol[íi]tica de privacidad\b/i,
    /\baviso legal\b/i,
    /\b(?:nif|cif)\b/i,
  ],
};
