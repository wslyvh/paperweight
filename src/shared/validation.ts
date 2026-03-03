export function isString(value: unknown): value is string {
  return typeof value === "string";
}

export function isNumber(value: unknown): value is number {
  return typeof value === "number" && !Number.isNaN(value);
}

export function isIntInRange(value: unknown, min: number, max: number): value is number {
  return isNumber(value) && Number.isInteger(value) && value >= min && value <= max;
}

export function isEmail(value: unknown): value is string {
  return isString(value) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isDomain(value: unknown): value is string {
  return isString(value) && /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value) && !value.includes("@");
}

export function isEmailOrDomain(value: unknown): value is string {
  return isEmail(value) || isDomain(value);
}

export function isLicenseKey(value: unknown): value is string {
  return isString(value) && value.length > 0 && value.length <= 256;
}

export function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || isString(value);
}
