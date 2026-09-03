const MONTHS: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

interface DateCandidate {
  start: number;
  end: number;
  year: number;
  month: number;
  day: number;
}

const NUMERIC_DATE_START = "(?<![\\p{L}\\d])(?<!\\d[-/.])";
const NUMERIC_DATE_END = "(?![\\p{L}\\d])(?![-/.]\\d)";
const ISO_DATE = new RegExp(
  `${NUMERIC_DATE_START}(\\d{4})([-/.])(\\d{1,2})\\2(\\d{1,2})${NUMERIC_DATE_END}`,
  "gu",
);
const DAY_MONTH_YEAR = new RegExp(
  `${NUMERIC_DATE_START}(\\d{1,2})([-/.])(\\d{1,2})\\2(\\d{4})${NUMERIC_DATE_END}`,
  "gu",
);
const ENGLISH_DATE = /(?<![\p{L}\d])(?:(\d{1,2})[ \t]+(January|February|March|April|May|June|July|August|September|Sept|Sep|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Oct|Nov|Dec)[ \t]+(\d{4})|(January|February|March|April|May|June|July|August|September|Sept|Sep|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Oct|Nov|Dec)[ \t]+(\d{1,2})(?:,)?[ \t]+(\d{4}))(?![\p{L}\d])/giu;

function canonicalDate(year: number, month: number, day: number): string | undefined {
  if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) {
    return undefined;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    return undefined;
  }
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function numericCandidates(match: RegExpExecArray): DateCandidate[] {
  const [raw, first, separator, second, fourth] = match;
  if (!raw) return [];
  if (separator && first && second && fourth) {
    const firstNumber = Number(first);
    const secondNumber = Number(second);
    const fourthNumber = Number(fourth);
    const base = {
      start: match.index,
      end: match.index + raw.length,
    };
    if (first.length === 4) {
      return [{ ...base, year: firstNumber, month: secondNumber, day: fourthNumber }];
    }
    return [
      { ...base, year: fourthNumber, month: secondNumber, day: firstNumber },
      { ...base, year: fourthNumber, month: firstNumber, day: secondNumber },
    ];
  }
  return [];
}

function englishCandidate(match: RegExpExecArray): DateCandidate | undefined {
  const [raw, dayFirstDay, dayFirstMonth, dayFirstYear, monthFirstMonth, monthFirstDay, monthFirstYear] = match;
  if (!raw) return undefined;
  const day = Number(dayFirstDay ?? monthFirstDay);
  const monthName = (dayFirstMonth ?? monthFirstMonth)?.toLowerCase();
  const year = Number(dayFirstYear ?? monthFirstYear);
  const month = monthName ? MONTHS[monthName] : undefined;
  if (!month) return undefined;
  return {
    start: match.index,
    end: match.index + raw.length,
    year,
    month,
    day,
  };
}

function candidatesIn(text: string): DateCandidate[] {
  const candidates: DateCandidate[] = [];
  for (const match of text.matchAll(ISO_DATE)) candidates.push(...numericCandidates(match));
  for (const match of text.matchAll(DAY_MONTH_YEAR)) candidates.push(...numericCandidates(match));
  for (const match of text.matchAll(ENGLISH_DATE)) {
    const candidate = englishCandidate(match);
    if (candidate) candidates.push(candidate);
  }
  return candidates.sort((a, b) => a.start - b.start);
}

export function normalizeDateOfBirth(raw: string): string | undefined {
  const candidates = candidatesIn(raw.trim());
  const exact = candidates.find((candidate) => candidate.start === 0 && candidate.end === raw.trim().length);
  return exact ? canonicalDate(exact.year, exact.month, exact.day) : undefined;
}

export function findDateOfBirth(
  text: string,
  expected: string,
): { start: number; end: number } | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expected) || normalizeDateOfBirth(expected) !== expected) {
    return undefined;
  }
  for (const candidate of candidatesIn(text)) {
    if (canonicalDate(candidate.year, candidate.month, candidate.day) === expected) {
      return { start: candidate.start, end: candidate.end };
    }
  }
  return undefined;
}
