import { describe, expect, it } from "vitest";
import {
  analyzeText,
  extractKnownAddressComponents,
  type KnownPiiValue,
} from "../src/index";

const known = (
  type: KnownPiiValue["type"],
  valueNormalized: string,
): KnownPiiValue => ({ type, valueNormalized });

const structuredAddress = (
  valueNormalized: string,
  street: string,
  houseNumber: string,
  postalCode: string,
  country: string,
): KnownPiiValue => ({
  type: "address",
  valueNormalized,
  addressComponents: {
    street,
    houseNumber,
    postalCode,
    country,
  },
});

describe("known PII values", () => {
  it("finds an exact local phone without inferring a country", async () => {
    const result = await analyzeText("Reach me on 06 12 34 56 78.", {
      knownValues: [known("phone", "0612345678")],
    });

    expect(result.findings).toEqual([
      expect.objectContaining({
        type: "phone",
        valueNormalized: "0612345678",
        confidence: "pattern",
        signals: [{ id: "known-value.exact" }],
      }),
    ]);
  });

  it("finds an exact IBAN with normalized spacing", async () => {
    const result = await analyzeText("Account: NL91  ABNA 0417.1643 00", {
      knownValues: [known("iban", "NL91ABNA0417164300")],
    });

    expect(result.findings).toEqual([
      expect.objectContaining({
        type: "iban",
        valueRaw: "NL91  ABNA 0417.1643 00",
        valueNormalized: "NL91ABNA0417164300",
        confidence: "pattern",
      }),
    ]);
  });

  it("finds exact national IDs without generic context", async () => {
    const result = await analyzeText("Recorded value AB 12 34.", {
      knownValues: [known("national_id", "AB1234")],
    });

    expect(result.findings[0]).toEqual(
      expect.objectContaining({
        type: "national_id",
        valueNormalized: "AB1234",
      }),
    );
  });

  it("finds exact raw addresses outside the street grammar", async () => {
    const result = await analyzeText("Deliver to Blue Cabin, Upper Meadow.", {
      knownValues: [known("address", "blue cabin upper meadow")],
    });

    expect(result.findings[0]).toEqual(
      expect.objectContaining({
        type: "address",
        valueRaw: "Blue Cabin, Upper Meadow",
        valueNormalized: "blue cabin upper meadow",
      }),
    );
  });

  it("matches equivalent spacing inside a supported postcode", async () => {
    for (const { normalized, texts } of [
      {
        normalized: "voorbeeldsingel 7 1234 ab teststad",
        texts: [
          "Deliver to voorbeeldsingel 7 1234AB teststad.",
          "Deliver to voorbeeldsingel 7 1234 AB teststad.",
        ],
      },
      {
        normalized: "10 downing street sw1a 2aa london",
        texts: [
          "Deliver to 10 downing street sw1a2aa london.",
          "Deliver to 10 downing street sw1a 2aa london.",
        ],
      },
    ]) {
      const knownValues = [known("address", normalized)];
      for (const text of texts) {
        const result = await analyzeText(text, { knownValues });
        expect(result.findings).toContainEqual(
          expect.objectContaining({
            type: "address",
            valueNormalized: normalized,
            signals: [{ id: "known-value.exact" }],
          }),
        );
      }
    }
  });

  it("keeps non-postcode address word boundaries strict", async () => {
    const result = await analyzeText(
      "Deliver to voorbeeldsingel7 1234AB teststad.",
      {
        knownValues: [
          known("address", "voorbeeldsingel 7 1234 ab teststad"),
        ],
      },
    );

    expect(
      result.findings.some((finding) => finding.type === "address"),
    ).toBe(false);

    const usResult = await analyzeText(
      "Deliver to sample road ca90210.",
      {
        knownValues: [
          known("address", "sample road ca 90210"),
        ],
      },
    );
    expect(
      usResult.findings.some((finding) => finding.type === "address"),
    ).toBe(false);

    const ptResult = await analyzeText(
      "Deliver to rua exemplo 1 1234567 lisboa.",
      {
        knownValues: [
          known("address", "rua exemplo 1 1234 567 lisboa"),
        ],
      },
    );
    expect(
      ptResult.findings.some((finding) => finding.type === "address"),
    ).toBe(false);
  });

  it("maps reordered structured-address components to one profile value", async () => {
    const value = structuredAddress(
      "voorbeeldsingel 7 1234 ab teststad",
      "voorbeeldsingel",
      "7",
      "1234 ab",
      "NL",
    );
    const texts = [
      "Voorbeeldsingel 7, 1234 AB Teststad",
      "Voorbeeldsingel 7, Teststad 1234AB",
      "Voorbeeldsingel 7, Teststad, Testregio 1234 AB",
      "Voorbeeldsingel 7, Teststad 1234 AB Netherlands",
      "Voorbeeldsingel 7, 1234 AB",
      "7 Voorbeeldsingel, 1234 AB Teststad",
    ];

    for (const text of texts) {
      const result = await analyzeText(text, { knownValues: [value] });
      const addresses = result.findings.filter(
        (finding) => finding.type === "address",
      );
      expect(addresses).toHaveLength(1);
      expect(addresses[0]).toEqual(
        expect.objectContaining({
          valueNormalized: value.valueNormalized,
          country: "NL",
        }),
      );
    }
  });

  it("derives component matches from one complete raw profile line", async () => {
    const valueNormalized = "voorbeeldsingel 7 1234 ab teststad";
    const addressComponents = extractKnownAddressComponents(
      "Voorbeeldsingel 7, 1234 AB Teststad",
    );
    expect(addressComponents).toEqual({
      street: "voorbeeldsingel",
      houseNumber: "7",
      postalCode: "1234 ab",
    });

    for (const text of [
      "Voorbeeldsingel 7, Teststad, 1234AB",
      "7 Voorbeeldsingel, 1234 AB",
    ]) {
      const result = await analyzeText(text, {
        knownValues: [{
          type: "address",
          valueNormalized,
          addressComponents,
        }],
      });
      // Layout differences (city/postcode order, house-before-street) collapse
      // to the one known value — via direct detection when generic address
      // detection already gets the order right, via the reconcile signal
      // otherwise. Either path is fine; the resulting value is what matters.
      expect(result.findings).toContainEqual(
        expect.objectContaining({
          type: "address",
          valueNormalized,
        }),
      );
    }
  });

  it("reconciles a detected address when raw layout exceeds the matcher bound", async () => {
    const value = structuredAddress(
      "voorbeeldsingel 7 1234 ab teststad",
      "voorbeeldsingel",
      "7",
      "1234 ab",
      "NL",
    );
    const result = await analyzeText(
      "Voorbeeldsingel 7,\n\n\nTeststad 1234 AB",
      { knownValues: [value] },
    );

    expect(result.findings).toContainEqual(
      expect.objectContaining({
        type: "address",
        valueNormalized: value.valueNormalized,
      }),
    );
  });

  it("keeps incomplete or ambiguous raw profile lines opaque", () => {
    for (const value of [
      "1234 AB",
      "Voorbeeldsingel",
      "California Road, CA, US",
      "Voorbeeldsingel 7, 1234 AB Teststad, SW1A 2AA",
    ]) {
      expect(extractKnownAddressComponents(value)).toBeUndefined();
    }
  });

  it.each([
    {
      raw: "10 Example Street, SW1A 2AA London",
      expected: {
        street: "example street",
        houseNumber: "10",
        postalCode: "sw1a 2aa",
      },
    },
    {
      raw: "12 Example Street, CA 90210 Exampleton",
      expected: {
        street: "example street",
        houseNumber: "12",
        postalCode: "ca 90210",
      },
    },
    {
      raw: "Rua Exemplo 1, 1234-567 Lisboa",
      expected: {
        street: "rua exemplo",
        houseNumber: "1",
        postalCode: "1234 567",
      },
    },
    {
      raw: "Musterstraße 9, 10115 Berlin",
      expected: {
        street: "musterstraße",
        houseNumber: "9",
        postalCode: "10115",
      },
    },
  ])("extracts raw address anchors across registered formats: $raw", ({
    raw,
    expected,
  }) => {
    expect(extractKnownAddressComponents(raw)).toEqual(expected);
  });

  it("does not promote a partial structured-address match", async () => {
    const value = structuredAddress(
      "voorbeeldsingel 7 1234 ab teststad",
      "voorbeeldsingel",
      "7",
      "1234 ab",
      "NL",
    );
    const texts = [
      "Postal code: 1234 AB",
      "Voorbeeldsingel 7A, 1234 AB Teststad",
      "Voorbeeldsingel 7, 1235 AB Teststad",
      "Anderesingel 7, 1234 AB Teststad",
      `Voorbeeldsingel 7 ${"far ".repeat(30)}1234 AB`,
    ];

    for (const text of texts) {
      const result = await analyzeText(text, { knownValues: [value] });
      expect(
        result.findings.some((finding) => (
          finding.type === "address"
          && finding.valueNormalized === value.valueNormalized
        )),
      ).toBe(false);
    }
  });

  it("does not turn a postcode-only profile entry into a full-address match", async () => {
    const result = await analyzeText(
      "Voorbeeldsingel 7, 1234 AB Teststad",
      {
        // This is the pair emitted from a postal-code-only profile row.
        knownValues: [
          known("address", "1234 ab"),
          known("postal_code", "1234 AB"),
        ],
      },
    );

    expect(result.findings).toContainEqual(
      expect.objectContaining({
        type: "address",
        valueNormalized: "voorbeeldsingel 7 1234 ab teststad",
      }),
    );
    expect(result.findings).not.toContainEqual(
      expect.objectContaining({
        type: "address",
        valueNormalized: "1234 ab",
      }),
    );
  });

  it("does not choose between ambiguous structured profile rows", async () => {
    const values = [
      structuredAddress(
        "voorbeeldsingel 7 1234 ab teststad",
        "voorbeeldsingel",
        "7",
        "1234 ab",
        "NL",
      ),
      structuredAddress(
        "voorbeeldsingel 7 1234 ab anderestad",
        "voorbeeldsingel",
        "7",
        "1234 ab",
        "NL",
      ),
    ];
    const result = await analyzeText(
      "Voorbeeldsingel 7, 1234 AB",
      { knownValues: values },
    );

    expect(
      result.findings.some((finding) => (
        finding.type === "address"
        && values.some(
          (value) => value.valueNormalized === finding.valueNormalized,
        )
      )),
    ).toBe(false);
  });

  it("uses the same exact anchors across supported address formats", async () => {
    for (const { value, text } of [
      {
        value: structuredAddress(
          "downing street 10 sw1a 2aa london",
          "downing street",
          "10",
          "sw1a 2aa",
          "GB",
        ),
        text: "10 Downing Street, London, SW1A2AA, United Kingdom",
      },
      {
        value: structuredAddress(
          "main street 12 ca 90210 beverly hills",
          "main street",
          "12",
          "ca 90210",
          "US",
        ),
        text: "12 Main Street, Beverly Hills, CA 90210, United States",
      },
      {
        value: structuredAddress(
          "rua exemplo 1 1234 567 lisboa",
          "rua exemplo",
          "1",
          "1234 567",
          "PT",
        ),
        text: "Rua Exemplo 1, Lisboa, 1234-567 Portugal",
      },
    ]) {
      const result = await analyzeText(text, { knownValues: [value] });
      expect(result.findings).toContainEqual(
        expect.objectContaining({
          type: "address",
          valueNormalized: value.valueNormalized,
          country: value.addressComponents?.country,
          signals: expect.arrayContaining([
            { id: "known-value.address-components" },
          ]),
        }),
      );
    }
  });

  it("keeps required country-format separators in component matches", async () => {
    for (const { value, text } of [
      {
        value: structuredAddress(
          "main street 12 ca 90210 beverly hills",
          "main street",
          "12",
          "ca 90210",
          "US",
        ),
        text: "12 Main Street, Beverly Hills, CA90210",
      },
      {
        value: structuredAddress(
          "rua exemplo 1 1234 567 lisboa",
          "rua exemplo",
          "1",
          "1234 567",
          "PT",
        ),
        text: "Rua Exemplo 1, Lisboa, 1234567",
      },
    ]) {
      const result = await analyzeText(text, { knownValues: [value] });
      expect(
        result.findings.some((finding) => (
          finding.type === "address"
          && finding.valueNormalized === value.valueNormalized
        )),
      ).toBe(false);
    }
  });

  it("keeps local and international phone values distinct", async () => {
    const result = await analyzeText("Call +31 6 1234 5678.", {
      knownValues: [known("phone", "0612345678")],
    });

    expect(result.findings.map((finding) => finding.valueNormalized)).not.toContain(
      "0612345678",
    );
  });

  it("does not match inside a longer identifier", async () => {
    const result = await analyzeText("Reference XAB1234Z", {
      knownValues: [known("national_id", "AB1234")],
    });

    expect(result.findings).toEqual([]);
  });

  it("keeps a generic detector's confidence and signals", async () => {
    const result = await analyzeText("Email Person@Example.com", {
      knownValues: [known("email", "person@example.com")],
    });

    expect(result.findings).toEqual([
      expect.objectContaining({
        type: "email",
        confidence: "pattern",
        signals: [{ id: "pattern.email" }],
      }),
    ]);
  });

  it("deduplicates repeated supplied values and repeated text", async () => {
    const value = known("phone", "0612345678");
    const result = await analyzeText("06 1234 5678 and 06 1234 5678", {
      knownValues: [value, value],
    });

    expect(result.findings).toHaveLength(1);
  });

  it("reuses one compiled value set across consecutive messages", async () => {
    const knownValues = [known("national_id", "AB1234")];

    for (const text of [
      "First record: AB 12 34.",
      "Second record: AB 12 34.",
      "Third record: AB 12 34.",
    ]) {
      const result = await analyzeText(text, { knownValues });
      expect(result.findings).toEqual([
        expect.objectContaining({
          type: "national_id",
          valueNormalized: "AB1234",
          signals: [{ id: "known-value.exact" }],
        }),
      ]);
    }
  });

  it("retains quoted-text evidence on profile-assisted findings", async () => {
    const result = await analyzeText(
      "Reply\n\nOn Monday Alex wrote:\n> Call 06 1234 5678",
      { knownValues: [known("phone", "0612345678")] },
    );

    expect(result.findings[0]?.inQuotedText).toBe(true);
  });
});
