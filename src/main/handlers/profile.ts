import { ipcMain } from "electron";
import { IPC } from "@shared/ipc";
import type { UserProfile } from "@shared/types";
import { getUserProfile, saveUserProfile } from "../services/profile";
import { markProfileAnalysisStale } from "../sync-manager";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasId(value: Record<string, unknown>): boolean {
  return Number.isSafeInteger(value.id);
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isProfile(value: unknown): value is UserProfile {
  if (!isRecord(value)) return false;
  if (!isOptionalString(value.country)) return false;
  if (
    value.birthDate !== undefined
    && (
      !isRecord(value.birthDate)
      || !Number.isInteger(value.birthDate.day)
      || !Number.isInteger(value.birthDate.month)
      || !Number.isInteger(value.birthDate.year)
    )
  ) return false;

  if (
    !Array.isArray(value.names)
    || !value.names.every((entry: unknown) => (
      isRecord(entry)
      && hasId(entry)
      && typeof entry.firstName === "string"
      && isOptionalString(entry.middleName)
      && typeof entry.lastName === "string"
    ))
  ) return false;

  if (
    !Array.isArray(value.emails)
    || !value.emails.every((entry: unknown) => (
      isRecord(entry)
      && hasId(entry)
      && typeof entry.address === "string"
    ))
  ) return false;

  if (
    !Array.isArray(value.phones)
    || !value.phones.every((entry: unknown) => (
      isRecord(entry)
      && hasId(entry)
      && typeof entry.number === "string"
    ))
  ) return false;

  if (
    !Array.isArray(value.addresses)
    || !value.addresses.every((entry: unknown) => {
      if (!isRecord(entry) || !hasId(entry)) return false;
      if (entry.mode === "raw") return typeof entry.raw === "string";
      return (
        entry.mode === "structured"
        && typeof entry.street === "string"
        && typeof entry.houseNumber === "string"
        && typeof entry.postalCode === "string"
        && typeof entry.city === "string"
        && typeof entry.country === "string"
      );
    })
  ) return false;

  if (
    !Array.isArray(value.nationalIds)
    || !value.nationalIds.every((entry: unknown) => (
      isRecord(entry)
      && hasId(entry)
      && typeof entry.value === "string"
    ))
  ) return false;

  return (
    Array.isArray(value.payments)
    && value.payments.every((entry: unknown) => (
      isRecord(entry)
      && hasId(entry)
      && (entry.type === "iban" || entry.type === "credit_card")
      && typeof entry.value === "string"
    ))
  );
}

export function registerProfileHandlers(): void {
  ipcMain.handle(IPC.getUserProfile, () => getUserProfile());

  ipcMain.handle(IPC.saveUserProfile, (_event, profile: unknown) => {
    if (!isProfile(profile)) throw new Error("Invalid user profile");
    if (saveUserProfile(profile)) markProfileAnalysisStale();
  });
}
