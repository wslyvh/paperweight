import { ipcMain } from "electron";
import { IPC } from "@shared/ipc";
import { isIntInRange } from "@shared/validation";
import {
  getVendorPiiSummary,
  revealVendorPiiValues,
  suppressPiiFinding,
  unsuppressPiiFinding,
} from "../services/pii";

const isRef = (v: unknown): v is number => isIntInRange(v, 1, Number.MAX_SAFE_INTEGER);

export function registerPiiHandlers(): void {
  ipcMain.handle(IPC.getVendorPiiSummary, (_event, vendorId: unknown) => {
    if (typeof vendorId !== "number") throw new Error("Invalid vendor id");
    return getVendorPiiSummary(vendorId);
  });

  // The only channel that returns full values, and only because the user asked
  // to see them. Same vendor-scoped grouping as the summary, so it can't reveal
  // anything the summary was hiding.
  ipcMain.handle(IPC.revealVendorPiiValues, (_event, vendorId: unknown) => {
    if (typeof vendorId !== "number") throw new Error("Invalid vendor id");
    return revealVendorPiiValues(vendorId);
  });

  // The rest take the opaque handle the summary handed out and return nothing: the
  // resolved (type, value) stays in the service, so a success response can't
  // leak back what the renderer was never given.
  ipcMain.handle(IPC.suppressPiiFinding, (_event, ref: unknown) => {
    if (!isRef(ref)) throw new Error("Invalid finding reference");
    suppressPiiFinding(ref);
  });

  ipcMain.handle(IPC.unsuppressPiiFinding, (_event, ref: unknown) => {
    if (!isRef(ref)) throw new Error("Invalid finding reference");
    unsuppressPiiFinding(ref);
  });
}
