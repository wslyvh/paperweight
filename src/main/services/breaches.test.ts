import Database from "better-sqlite3";
import { getBreachLookup, ON_BREACH_LIST_SQL } from "./breaches";

function referenceDb() {
  const d = new Database(":memory:");
  d.exec(`
    ATTACH DATABASE ':memory:' AS breaches;
    CREATE TABLE breaches.breaches (
      name TEXT, title TEXT, domain TEXT, breach_date TEXT, pwn_count INTEGER,
      description TEXT, data_classes TEXT, is_verified INTEGER, is_sensitive INTEGER
    );
    CREATE TABLE vendors (root_domain TEXT);
  `);
  const insert = d.prepare("INSERT INTO breaches.breaches VALUES (?, ?, ?, ?, 1, NULL, '[]', 1, 0)");
  for (const [name, domain, date] of [
    ["older", "example.test", "2020-01-01"],
    ["newer", "example.test", "2024-01-01"],
    ["nested", "shop.example.test", "2023-01-01"],
    ["case", "Mixed.test", "2022-01-01"],
    ["unicode", "É.test", "2022-01-01"],
    ["underscore", "under_score.test", "2022-01-01"],
    ["percent", "wild%.test", "2022-01-01"],
    ["empty", "", "2022-01-01"],
    ["missing", null, "2022-01-01"],
  ]) insert.run(name, name, domain, date);
  return d;
}

it("matches the existing SQL semantics and ordering for membership and details", () => {
  const d = referenceDb();
  try {
    const lookup = getBreachLookup(d)!;
    const original = d.prepare(`SELECT name FROM breaches.breaches
      WHERE domain = ? OR ? LIKE '%.' || domain ORDER BY breach_date DESC`);
    for (const domain of [
      "example.test", "shop.example.test", "deep.shop.example.test",
      "notexample.test", "example.test.attacker.test", "other.test",
      "Mixed.test", "mixed.test", "SUB.MIXED.TEST", "É.test", "sub.é.test",
      "under_score.test", "sub.underXscore.test", "sub.wildcard.test", "", "trailing.",
    ]) {
      const expected = original.all(domain, domain) as Array<{ name: string }>;
      expect(lookup.find(domain).map((row) => row.name)).toEqual(expected.map((row) => row.name));
      d.prepare("INSERT INTO vendors VALUES (?)").run(domain);
    }
    d.prepare("INSERT INTO vendors VALUES (NULL)").run();
    const oldMatches = d.prepare(`SELECT root_domain FROM vendors WHERE EXISTS (
      SELECT 1 FROM breaches.breaches b
      WHERE b.domain = vendors.root_domain OR vendors.root_domain LIKE '%.' || b.domain
    )`).all();
    expect(d.prepare(`SELECT root_domain FROM vendors WHERE ${ON_BREACH_LIST_SQL}`).all()).toEqual(oldMatches);
    expect(getBreachLookup(d)).toBe(lookup);
    expect(lookup.find("example.test")).toBe(lookup.find("example.test"));
    expect(lookup.find("other.test")).toBe(lookup.find("other.test"));
  } finally {
    d.close();
  }
});

it("uses a fresh lookup for a different connection and allows missing reference data", () => {
  const first = referenceDb();
  const second = referenceDb();
  const missing = new Database(":memory:");
  try {
    const oldLookup = getBreachLookup(first)!;
    second.exec("DELETE FROM breaches.breaches");
    expect(getBreachLookup(second)!.find("example.test")).toEqual([]);
    expect(oldLookup.find("example.test")).toHaveLength(2);
    expect(getBreachLookup(missing)).toBeUndefined();
  } finally {
    first.close();
    second.close();
    missing.close();
  }
});
