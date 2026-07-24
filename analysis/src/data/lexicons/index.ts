// All lexicons merged. Adding a language = adding one file here and to the
// LEXICONS array; the Lexicon interface forces every category to be covered.
// File and export names are ISO 639-3, matching franc's output and the
// public `lang` field.
import { deu } from "./deu";
import { eng } from "./eng";
import { fra } from "./fra";
import { ita } from "./ita";
import { nld } from "./nld";
import { por } from "./por";
import { spa } from "./spa";
import type { Lexicon } from "./lexicon";

export type { Lexicon };

export const LEXICONS: Lexicon[] = [deu, eng, fra, ita, nld, por, spa];

function merge(key: keyof Lexicon): RegExp[] {
  return LEXICONS.flatMap((lexicon) => lexicon[key]);
}

export const PURCHASE_CONFIRMATION = merge("purchaseConfirmation");
export const PURCHASE_VOCAB = merge("purchaseVocab");
export const UPDATE_VOCAB = merge("updateVocab");
export const UNSUBSCRIBE_LINK_TEXT = merge("unsubscribeLinkText");
export const UNSUBSCRIBE_URL = merge("unsubscribeUrl");
export const FOOTER_CUE = merge("footerCue");
