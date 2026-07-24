import { describe, expect, it } from "vitest";
import { LEXICONS } from "../src/data/lexicons";
import type { Lexicon } from "../src/data/lexicons";
import { deu } from "../src/data/lexicons/deu";
import { eng } from "../src/data/lexicons/eng";
import { fra } from "../src/data/lexicons/fra";
import { ita } from "../src/data/lexicons/ita";
import { nld } from "../src/data/lexicons/nld";
import { por } from "../src/data/lexicons/por";
import { spa } from "../src/data/lexicons/spa";

const CATEGORIES: Array<keyof Lexicon> = [
  "purchaseConfirmation", "purchaseVocab", "updateVocab", "unsubscribeLinkText", "unsubscribeUrl",
];

describe("lexicons", () => {
  it("registers all seven languages", () => {
    expect(LEXICONS).toHaveLength(7);
  });

  it("covers every category in every language", () => {
    for (const lexicon of LEXICONS) {
      for (const category of CATEGORIES) {
        expect(lexicon[category].length, category).toBeGreaterThan(0);
      }
    }
  });

  it("no pattern matches plain English prose", () => {
    const prose =
      "in order to deliver a better experience we will keep you posted and share what changed " +
      "over the last months across the board so nothing surprises anyone anymore";
    for (const lexicon of LEXICONS) {
      for (const category of ["purchaseConfirmation", "purchaseVocab", "updateVocab"] as const) {
        for (const pattern of lexicon[category]) {
          expect(pattern.test(prose), String(pattern)).toBe(false);
        }
      }
    }
  });

  it("no pattern matches plain Dutch prose (1:1 human mail)", () => {
    const prose =
      "ik herinner me onze afspraak van vorige week nog goed en zullen we binnenkort weer een " +
      "afspraak inplannen zodra ik mijn wachtwoord weer weet stuur ik je de fotos door";
    for (const lexicon of LEXICONS) {
      for (const category of ["purchaseConfirmation", "purchaseVocab", "updateVocab"] as const) {
        for (const pattern of lexicon[category]) {
          expect(pattern.test(prose), String(pattern)).toBe(false);
        }
      }
    }
  });

  // Spot-check per language: a representative sender phrase classifies.
  // purchaseVocab needs two distinct hits (classifier contract); the others one.
  const hits = (patterns: RegExp[], text: string): number =>
    patterns.filter((p) => p.test(text)).length;

  const samples: Array<{ code: string; lex: Lexicon; conf: string; vocab: string; upd: string }> = [
    { code: "deu", lex: deu, conf: "hier ist ihre bestellbestätigung", vocab: "die lieferung ist ein paket", upd: "willkommen bei uns" },
    { code: "eng", lex: eng, conf: "your order confirmation is attached", vocab: "your invoice and tracking number", upd: "welcome to the service" },
    { code: "fra", lex: fra, conf: "voici la confirmation de commande", vocab: "votre numéro de commande et la facture", upd: "bienvenue chez nous" },
    { code: "ita", lex: ita, conf: "conferma dell'ordine", vocab: "numero d'ordine e fattura", upd: "benvenuto a bordo" },
    { code: "nld", lex: nld, conf: "je bestelbevestiging staat klaar", vocab: "de levering is een pakket", upd: "welkom bij ons" },
    { code: "por", lex: por, conf: "confirmação do pedido", vocab: "número do pedido e fatura", upd: "bem-vindo a bordo" },
    { code: "spa", lex: spa, conf: "confirmación de pedido", vocab: "número de pedido y factura", upd: "bienvenido a" },
  ];

  it("classifies representative sender phrases in every language", () => {
    for (const { code, lex, conf, vocab, upd } of samples) {
      expect(hits(lex.purchaseConfirmation, conf), `${code} confirmation`).toBeGreaterThanOrEqual(1);
      expect(hits(lex.purchaseVocab, vocab), `${code} vocab`).toBeGreaterThanOrEqual(2);
      expect(hits(lex.updateVocab, upd), `${code} update`).toBeGreaterThanOrEqual(1);
    }
  });
});
