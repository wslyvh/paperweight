import { describe, expect, it } from "vitest";
import { detectPii } from "../src/detect";
import { detectAddressBlocks } from "../src/detect/address";
import { detectCreditCards } from "../src/detect/credit-card";
import { detectEmails } from "../src/detect/email";
import { detectIbans } from "../src/detect/iban";
import { detectNationalIds } from "../src/detect/national-id";
import { detectPhones, regionFromDomain } from "../src/detect/phone";
import { detectPostalCodes } from "../src/detect/postal-code";
import { markFooterSegments } from "../src/detect/footer";

const ctx = { quoted: [], footer: [] };

describe("detectEmails", () => {
  it("finds addresses with correct offsets and lowercased normalization", () => {
    const text = "Contact Support@Shop.Example.COM for help.";
    const f = detectEmails(text)[0]!;
    expect(f.valueNormalized).toBe("support@shop.example.com");
    expect(text.slice(f.start, f.end)).toBe("Support@Shop.Example.COM");
    expect(f.confidence).toBe("pattern");
  });

  it("does not match bare domains or @handles", () => {
    expect(detectEmails("visit shop.example and follow @shopnews")).toEqual([]);
  });
});

describe("detectIbans", () => {
  // valid vectors from the ibantools test suite / official registry examples
  it.each([
    ["NL91 ABNA 0417 1643 00", "NL91ABNA0417164300", "NL"],
    ["DE89370400440532013000", "DE89370400440532013000", "DE"],
    ["GB29 NWBK 6016 1331 9268 19", "GB29NWBK60161331926819", "GB"],
  ])("validates %s", (raw, normalized, country) => {
    const f = detectIbans(`Uw rekening ${raw} is belast.`)[0]!;
    expect(f.valueNormalized).toBe(normalized);
    expect(f.country).toBe(country);
    expect(f.confidence).toBe("verified");
    expect(f.signals).toContainEqual({ id: "checksum.mod97" });
  });

  it("rejects a failed checksum entirely (no finding)", () => {
    expect(detectIbans("rekening NL92 ABNA 0417 1643 00")).toEqual([]);
  });

  it("rejects a wrong length for the country", () => {
    expect(detectIbans("code NL91ABNA04171643001234")).toEqual([]);
  });
});

describe("detectCreditCards", () => {
  it("accepts a Luhn-valid Visa with grouping", () => {
    const f = detectCreditCards("Paid with card 4111 1111 1111 1111 today")[0]!;
    expect(f.valueNormalized).toBe("4111111111111111");
    expect(f.confidence).toBe("verified");
    expect(f.signals).toContainEqual({ id: "iin.match", detail: "visa" });
  });

  it("rejects Luhn-valid numbers with no scheme prefix", () => {
    // 16 digits, Luhn-valid, starts with 1 — no scheme
    expect(detectCreditCards("ref 1111111111111117")).toEqual([]);
  });

  it("drops a Luhn-valid run right after tracking vocabulary", () => {
    expect(detectCreditCards("Track & trace: 4111111111111111")).toEqual([]);
  });

  it("finds masked forms as contextual", () => {
    const stars = detectCreditCards("Card **** **** **** 4242 was charged");
    expect(stars[0]!.valueNormalized).toBe("****4242");
    expect(stars[0]!.confidence).toBe("contextual");

    const phrase = detectCreditCards("your Visa ending in 4242");
    expect(phrase[0]!.valueNormalized).toBe("****4242");

    const dutch = detectCreditCards("creditcard eindigend op 1234");
    expect(dutch[0]!.valueNormalized).toBe("****1234");
  });

  it("does not match digit runs embedded in longer numbers", () => {
    expect(detectCreditCards("id 94111111111111111234")).toEqual([]);
  });
});

describe("detectNationalIds (BSN)", () => {
  it("finds an elfproef-valid BSN with context keyword", () => {
    const f = detectNationalIds("Uw BSN: 111222333 is geregistreerd")[0]!;
    expect(f.valueNormalized).toBe("111222333");
    expect(f.country).toBe("NL");
    expect(f.confidence).toBe("verified");
    expect(f.signals).toContainEqual({ id: "context.keyword", detail: "bsn" });
  });

  it("requires context: a bare elfproef-valid number is not a finding", () => {
    expect(detectNationalIds("Zaaknummer 111222333 is in behandeling")).toEqual([]);
  });

  it("rejects elfproef failures even with context", () => {
    expect(detectNationalIds("BSN: 111222334")).toEqual([]);
  });
});

describe("detectNationalIds (other countries)", () => {
  it("validates ES DNI/NIE control letters without context", () => {
    const dni = detectNationalIds("documento 12345678Z adjunto")[0]!;
    expect(dni.country).toBe("ES");
    expect(detectNationalIds("documento 12345678A adjunto")).toEqual([]);

    const nie = detectNationalIds("NIE X1234567L registrado")[0]!;
    expect(nie.valueNormalized).toBe("X1234567L");
  });

  it("validates the IT codice fiscale control character", () => {
    const [f] = detectNationalIds("codice RSSMRA85T10A562S intestato");
    expect(f!.country).toBe("IT");
    expect(detectNationalIds("codice RSSMRA85T10A562T intestato")).toEqual([]);
  });

  it("validates BE rijksregisternummer for both centuries, context required", () => {
    expect(detectNationalIds("rijksregisternummer 85073003328")[0]!.country).toBe("BE");
    expect(detectNationalIds("rijksregisternummer 10121512341")).toHaveLength(1);
    expect(detectNationalIds("pakket 85073003328 onderweg")).toEqual([]);
  });

  it("validates the FR NIR mod-97 key, context required", () => {
    const [f] = detectNationalIds("numero de securite sociale 2 94 03 75 123 456 35");
    expect(f!.country).toBe("FR");
    expect(f!.valueNormalized).toBe("294037512345635");
    // wrong key
    expect(detectNationalIds("numero de securite sociale 2 94 03 75 123 456 36")).toEqual([]);
  });

  it("never emits a bare 15-digit run as a FR NIR", () => {
    // A two-digit key lets roughly one in a hundred 15-digit runs through, and
    // 15-digit runs are what social platforms use for profile ids.
    expect(detectNationalIds("Profile 294037512345635 was viewed")).toEqual([]);
  });

  it("rejects an impossible birth month", () => {
    expect(detectNationalIds("numero de securite sociale 2 94 45 75 123 456 84")).toEqual([]);
  });

  it("validates the PT NIF, context required", () => {
    expect(detectNationalIds("NIF: 123456789")[0]!.country).toBe("PT");
    expect(detectNationalIds("fatura 123456789 paga")).toEqual([]);
    expect(detectNationalIds("NIF: 123456780")).toEqual([]);
  });

  it("validates the DE Steuer-ID, context required", () => {
    expect(detectNationalIds("Steuer-ID: 86095742719")[0]!.country).toBe("DE");
    expect(detectNationalIds("Rechnung 86095742719 anbei")).toEqual([]);
    expect(detectNationalIds("Steuer-ID: 86095742718")).toEqual([]);
  });

  it("accepts GB NINO format with context as contextual (no checksum exists)", () => {
    const [f] = detectNationalIds("your National Insurance number AB 12 34 56 C");
    expect(f!.country).toBe("GB");
    expect(f!.confidence).toBe("contextual");
    expect(detectNationalIds("booking ref AB 12 34 56 C confirmed")).toEqual([]);
  });
});

describe("detectPhones", () => {
  it("finds international numbers as verified", () => {
    const f = detectPhones("Bel +31 6 12345678 voor vragen")[0]!;
    expect(f.valueNormalized).toBe("+31612345678");
    expect(f.confidence).toBe("verified");
    expect(f.country).toBe("NL");
  });

  it("finds separated national numbers with a region hint", () => {
    const f = detectPhones("Neem contact op via 088 - 123 45 67.", "NL")[0]!;
    expect(f.valueNormalized).toBe("+31881234567");
    expect(f.confidence).toBe("contextual");
  });

  it("drops separator-less digit runs without phone vocabulary", () => {
    expect(detectPhones("Kundennummer 4929123456781234 angeben", "DE")).toEqual([]);
    expect(detectPhones("factuurnummer 0612345678", "NL")).toEqual([]);
  });

  it("keeps separator-less runs when phone vocabulary is nearby", () => {
    const f = detectPhones("bel ons: 0612345678", "NL")[0]!;
    expect(f.valueNormalized).toBe("+31612345678");
  });

  it("drops national numbers without a trunk 0 unless vocabulary is nearby", () => {
    // libphonenumber still validates legacy "118 xxx" service codes — reference bait
    expect(detectPhones("bedrag 118 350 verwerkt", "NL")).toEqual([]);
    expect(detectPhones("bel 118 350 voor informatie", "NL")).toHaveLength(1);
  });

  it("maps sender ccTLDs to phone regions", () => {
    expect(regionFromDomain("shop.example.nl")).toBe("NL");
    expect(regionFromDomain("shop.co.uk")).toBe("GB");
    expect(regionFromDomain("shop.example.com")).toBeUndefined();
    expect(regionFromDomain(undefined)).toBeUndefined();
  });
});

describe("detectPostalCodes", () => {
  it("finds NL and UK postcodes standalone", () => {
    const { findings } = detectPostalCodes("Verzonden naar 1234 AB. Office: SW1A 1AA.");
    expect(findings.map((f) => f.valueNormalized)).toEqual(["1234 AB", "SW1A 1AA"]);
    expect(findings[0]!.country).toBe("NL");
    expect(findings[1]!.country).toBe("GB");
  });

  it("excludes never-issued NL letter pairs and lowercase", () => {
    const { findings } = detectPostalCodes("codes 1234 SS and 5678 ab");
    expect(findings).toEqual([]);
  });

  it("finds US state+ZIP pairs standalone but never a bare ZIP", () => {
    const { findings } = detectPostalCodes("Springfield, IL 62704, USA");
    expect(findings.map((f) => f.valueNormalized)).toEqual(["IL 62704"]);
    expect(detectPostalCodes("order 62704 shipped").findings).toEqual([]);
  });

  it("keeps bare 5-digit codes as anchor-only candidates, never findings", () => {
    const { findings, candidates } = detectPostalCodes("Rechnung 54321 anbei");
    expect(findings).toEqual([]);
    expect(candidates.map((c) => c.country).sort()).toEqual(["DE", "ES", "FR", "IT", "US"]);
    expect(candidates.every((c) => c.tier === "anchor-only")).toBe(true);
  });

  it("never reads the digits of an NL postcode as a bare BE/AT code", () => {
    const { candidates } = detectPostalCodes("Postbus 99, 1234 AB Voorbeeldstad");
    expect(
      candidates.some((c) => (c.country === "BE" || c.country === "AT") && c.value === "1234"),
    ).toBe(false);
  });
});

describe("detectAddressBlocks", () => {
  it("emits one block for street + postcode within range", () => {
    const text = "Bezorgadres:\nLaboratoriumweg 5\n1234 AB Voorbeeldstad";
    const postal = detectPostalCodes(text);
    const f = detectAddressBlocks(text, postal.candidates)[0]!;
    expect(f.valueRaw).toBe("Laboratoriumweg 5\n1234 AB Voorbeeldstad");
    expect(f.country).toBe("NL");
    expect(f.confidence).toBe("contextual");
    expect(f.signals).toContainEqual({ id: "anchor.postal-code", detail: "1234 AB" });
  });

  it("matches UK number-first streets", () => {
    const text = "Send to 10 Downing Street, SW1A 2AA, London";
    const postal = detectPostalCodes(text);
    const f = detectAddressBlocks(text, postal.candidates)[0]!;
    expect(f.country).toBe("GB");
  });

  it("never fires on a street without a postcode anchor", () => {
    const text = "We lopen door de Hoofdstraat 12 richting het plein";
    expect(detectAddressBlocks(text, [])).toEqual([]);
  });

  it("never pairs across too much distance", () => {
    const filler = "x".repeat(200);
    const text = `Hoofdstraat 12 ${filler} 1234 AB`;
    const postal = detectPostalCodes(text);
    expect(detectAddressBlocks(text, postal.candidates)).toEqual([]);
  });

  it("captures NL house-number suffix and trailing city", () => {
    const text = "Voorbeeldstraat 12 zw\n1234 XB Voorbeeldstad";
    const postal = detectPostalCodes(text);
    const [f] = detectAddressBlocks(text, postal.candidates);
    expect(f!.valueRaw).toBe("Voorbeeldstraat 12 zw\n1234 XB Voorbeeldstad");
  });

  it("does not swallow prose words after a house number", () => {
    const text = "Voorbeeldkamp 88, 4321 JG Voorbeeldstad";
    const postal = detectPostalCodes(text);
    const [f] = detectAddressBlocks(text, postal.candidates);
    expect(f!.valueRaw).toBe("Voorbeeldkamp 88, 4321 JG Voorbeeldstad");
  });

  it("matches German preposition and suffix streets on anchor-only postcodes", () => {
    for (const text of ["Am Beispielufer 4, 12345 Musterstadt, Germany", "Musterstrasse 72, 54321 Musterstadt"]) {
      const postal = detectPostalCodes(text);
      const found = detectAddressBlocks(text, postal.candidates);
      const de = found.find((f) => f.country === "DE");
      expect(de, text).toBeDefined();
      expect(de!.valueRaw).toContain("Musterstadt");
    }
  });

  it("matches US streets against the state+ZIP anchor", () => {
    const text = "1200 East Sample Street, Suite 210, Springfield, IL 62704, USA";
    const postal = detectPostalCodes(text);
    const us = detectAddressBlocks(text, postal.candidates).find((f) => f.country === "US");
    expect(us).toBeDefined();
    expect(us!.valueRaw).toContain("1200 East Sample Street");
    expect(us!.valueRaw).toContain("IL 62704");
  });

  it("captures multi-word cities via known particles", () => {
    const text = "Stationsweg 1\n1234 AV Den Haag";
    const postal = detectPostalCodes(text);
    expect(detectAddressBlocks(text, postal.candidates)[0]!.valueRaw).toContain("Den Haag");
  });

  it("collapses punctuation and case variants of one address to one value", () => {
    const variants = [
      "Voorbeeldstraat 12,\n1234 XB Voorbeeldstad",
      "Voorbeeldstraat 12\n1234 XB  Voorbeeldstad",
      "Voorbeeldstraat 12 - 1234 XB, Voorbeeldstad",
      "Voorbeeldstraat 12 - 1234XB, Voorbeeldstad",
    ];
    const normalized = new Set(
      variants.map((text) => {
        const postal = detectPostalCodes(text);
        return detectAddressBlocks(text, postal.candidates)[0]!.valueNormalized;
      }),
    );
    expect([...normalized]).toEqual(["voorbeeldstraat 12 1234 xb voorbeeldstad"]);
  });

  it("drops a block whose span runs longer than an address ever is", () => {
    // Street and postcode within the gap, but with a sentence between them:
    // the emitted span would be prose, not an address.
    const text = `Voorbeeldstraat 12 ${"is where we used to be, ".repeat(4)}1234 XB Voorbeeldstad`;
    const postal = detectPostalCodes(text);
    expect(detectAddressBlocks(text, postal.candidates)).toEqual([]);
  });

  it.each([
    ["FR", "12 rue de l'Exemple\n75008 Paris"],
    ["ES", "Calle de Ejemplo 12, 28001 Madrid"],
    ["IT", "Via Esempio 5, 20121 Milano"],
    ["PT", "Rua do Exemplo 12, 1000-100 Lisboa"],
    ["BE", "Voorbeeldstraat 12, 2000 Antwerpen"],
    ["AT", "Musterallee 3, 1010 Wien"],
  ])("matches %s addresses", (country, text) => {
    const postal = detectPostalCodes(text);
    const found = detectAddressBlocks(text, postal.candidates);
    expect(found.some((f) => f.country === country), text).toBe(true);
  });

  it("never anchors on a year or bare reference (anchor-only needs a city token)", () => {
    const text = "Sinds 2019 zijn wij gevestigd aan de Voorbeeldstraat 12 in het centrum";
    const postal = detectPostalCodes(text);
    expect(detectAddressBlocks(text, postal.candidates)).toEqual([]);
  });

  it("never reaches back over a line break for the sender's name", () => {
    // The street pattern accepts leading words for names like "Jan van
    // Galenstraat", which used to let it swallow the line above.
    const text = "ShopExample B.V.\nVoorbeeldgracht 45, 1015 BA Voorbeeldstad";
    const postal = detectPostalCodes(text);
    const [f] = detectAddressBlocks(text, postal.candidates);

    expect(f!.valueRaw).toBe("Voorbeeldgracht 45, 1015 BA Voorbeeldstad");
  });

  it("still takes leading words when they sit on the street's own line", () => {
    const text = "Jan van Voorbeeldstraat 12, 1234 XB Voorbeeldstad";
    const postal = detectPostalCodes(text);
    const [f] = detectAddressBlocks(text, postal.candidates);

    expect(f!.valueRaw).toBe("Jan van Voorbeeldstraat 12, 1234 XB Voorbeeldstad");
  });

  it("never crosses one complete postcode+city to pair a street with a farther one", () => {
    const text = "Voorbeeldstraat 12\n1234 AB Voorbeeldstad Volg ons\nPostbus 99, 5678 CD Anderstad";
    const postal = detectPostalCodes(text);
    const found = detectAddressBlocks(text, postal.candidates);
    expect(found.some((f) => f.valueRaw.includes("Anderstad"))).toBe(false);
  });

  it("never joins a street to a copyright year as a Belgian postcode", () => {
    const text = [
      "Voorbeeldstraat 354",
      "",
      "© 2021 Example Corporation",
    ].join("\n");
    const postal = detectPostalCodes(text);

    expect(detectAddressBlocks(text, postal.candidates)).toEqual([]);
  });
});

describe("detectPii orchestration", () => {
  it("suppresses the standalone postcode inside an address block", () => {
    const text = "Bezorgadres: Laboratoriumweg 5, 1234 AB Voorbeeldstad";
    const findings = detectPii(text, ctx);
    expect(findings.map((f) => f.type)).toEqual(["address"]);
  });

  it("dedupes repeated values", () => {
    const text = "IBAN NL91 ABNA 0417 1643 00 en nogmaals NL91 ABNA 0417 1643 00";
    expect(detectPii(text, ctx)).toHaveLength(1);
  });

  it("flags findings in quoted text", () => {
    const text = "Bedankt!\n\nOp 3 okt 2026 schreef Alex de Vries <alex@voorbeeldmail.example>:\n> Mijn IBAN is NL91 ABNA 0417 1643 00";
    const findings = detectPii(text, { quoted: [{ start: 10, end: text.length }], footer: [] });
    const iban = findings.find((f) => f.type === "iban");
    expect(iban?.inQuotedText).toBe(true);
  });

  it("tags own identifiers", () => {
    const findings = detectPii("Mail me at alex@voorbeeldmail.example", {
      quoted: [],
      footer: [],
      ownEmails: ["Alex@voorbeeldmail.example"],
    });
    expect(findings[0]!.isOwnIdentifier).toBe(true);
  });

  it("returns findings sorted by position", () => {
    const text = "SW1A 1AA then mail@x.example and +31 6 12345678";
    const starts = detectPii(text, ctx).map((f) => f.start);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });
});

describe("markFooterSegments", () => {
  const body = (lines: string[]): string => lines.join("\n");

  it("opens at the closing boilerplate and runs to the end", () => {
    const text = body([
      "Your order is on its way and should arrive within two working days.",
      "We will send tracking as soon as the courier scans the parcel.",
      "Thanks for shopping with us, and do reply if anything looks wrong.",
      "",
      "You are receiving this because you shop with us.",
      "Example Ltd, 4 Sample Street, SW1A 1AA",
    ]);
    const [span] = markFooterSegments(text);
    expect(span).toBeDefined();
    expect(text.slice(span!.start)).toContain("Example Ltd");
    expect(text.slice(0, span!.start)).toContain("Thanks for shopping");
  });

  it("ignores an unsubscribe mention in the opening paragraph", () => {
    // Precision guard: a newsletter writing *about* unsubscribing must not
    // mark its own contents as footer.
    const text = body([
      "You can unsubscribe from any of our lists at any time, and this issue",
      "explains how we changed the preference centre to make that easier.",
      "Read on for the details of what moved and why we moved it.",
      "The rest of this issue covers the new layout in some depth.",
    ]);
    expect(markFooterSegments(text)).toEqual([]);
  });

  it("returns nothing when there is no cue at all", () => {
    expect(markFooterSegments("Just a short personal note about lunch.")).toEqual([]);
  });
});
