// Fixture harness: loads fixtures/<case>/ dirs and matches partial expectations.
// Semantics: objects are subset-matched, scalars exact,
// arrays by containment (every expected element must match at least one actual
// element, order-insensitive, extras allowed). Reserved top-level keys in
// expected.json: "absent" (finding shapes that must match nothing) and
// "findingCount" (exact total). "version" is never asserted.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Analysis, AnalyzeOptions, RawMessage } from "../src/types";

export interface ExpectedAnalysis {
  absent?: unknown[];
  findingCount?: number;
  [key: string]: unknown;
}

export interface FixtureCase {
  name: string;
  input: { kind: "eml"; raw: Uint8Array } | { kind: "raw"; message: RawMessage };
  options?: AnalyzeOptions;
  expected: ExpectedAnalysis;
}

const fixturesRoot = fileURLToPath(new URL("../fixtures", import.meta.url));

export function loadFixtureCases(): FixtureCase[] {
  if (!existsSync(fixturesRoot)) {
    return [];
  }
  return readdirSync(fixturesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => loadCase(entry.name, join(fixturesRoot, entry.name)))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function loadCase(name: string, dir: string): FixtureCase {
  const expected = readJson(join(dir, "expected.json")) as ExpectedAnalysis;
  const optionsPath = join(dir, "options.json");
  const options = existsSync(optionsPath)
    ? (readJson(optionsPath) as AnalyzeOptions)
    : undefined;

  const emlPath = join(dir, "input.eml");
  if (existsSync(emlPath)) {
    return { name, input: { kind: "eml", raw: new Uint8Array(readFileSync(emlPath)) }, options, expected };
  }
  const jsonPath = join(dir, "input.json");
  if (existsSync(jsonPath)) {
    return { name, input: { kind: "raw", message: readJson(jsonPath) as RawMessage }, options, expected };
  }
  throw new Error(`fixture "${name}": needs input.eml or input.json`);
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function analysisMismatches(actual: Analysis, expected: ExpectedAnalysis): string[] {
  const { absent, findingCount, ...subset } = expected;
  const errors = subsetMismatches(actual, subset);

  if (findingCount !== undefined && actual.findings.length !== findingCount) {
    errors.push(
      `findingCount: expected ${findingCount}, got ${actual.findings.length}: ` +
        JSON.stringify(actual.findings.map((f) => ({ type: f.type, valueNormalized: f.valueNormalized }))),
    );
  }
  for (const shape of absent ?? []) {
    if (actual.findings.some((finding) => subsetMismatches(finding, shape).length === 0)) {
      errors.push(`absent: a finding matches ${JSON.stringify(shape)}`);
    }
  }
  return errors;
}

export function subsetMismatches(actual: unknown, expected: unknown, path = "$"): string[] {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      return [`${path}: expected an array, got ${describe(actual)}`];
    }
    const errors: string[] = [];
    expected.forEach((element, index) => {
      const matched = actual.some((candidate) => subsetMismatches(candidate, element).length === 0);
      if (!matched) {
        errors.push(`${path}[${index}]: no element matches ${JSON.stringify(element)} in ${JSON.stringify(actual)}`);
      }
    });
    return errors;
  }

  if (isPlainObject(expected)) {
    if (!isPlainObject(actual)) {
      return [`${path}: expected an object, got ${describe(actual)}`];
    }
    const errors: string[] = [];
    for (const [key, value] of Object.entries(expected)) {
      errors.push(...subsetMismatches(actual[key], value, `${path}.${key}`));
    }
    return errors;
  }

  if (!Object.is(actual, expected)) {
    return [`${path}: expected ${JSON.stringify(expected)}, got ${describe(actual)}`];
  }
  return [];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function describe(value: unknown): string {
  return value === undefined ? "undefined" : JSON.stringify(value);
}
