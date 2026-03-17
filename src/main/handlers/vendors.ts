import { ipcMain } from "electron";
import { IPC } from "@shared/ipc";
import { isString, isIntInRange } from "@shared/validation";
import { getAccountInfo } from "../services/account";
import { queryVendors, updateVendor, getVendorDetail, deleteVendor } from "../services/vendors";
import type { VendorQuery } from "@shared/types";

export function registerVendorHandlers(): void {
  ipcMain.handle(IPC.queryVendors, (_event, query: unknown) => {
    if (!query || typeof query !== "object") throw new Error("Invalid query");
    const q = query as Record<string, unknown>;
    if (!isIntInRange(q.page, 1, 1_000_000)) throw new Error("Invalid page");
    if (!isIntInRange(q.limit, 1, 500)) throw new Error("Invalid limit");

    const filter = isString(q.filter) && ["all", "lists", "accounts"].includes(q.filter)
      ? (q.filter as VendorQuery["filter"])
      : undefined;

    const VALID_ACTIVITIES = ["recent", "active", "inactive", "stale", "dead"];
    const VALID_DATA_TYPES = ["has_orders", "has_account", "marketing_only"];
    const VALID_VOLUMES = ["oneoff", "low", "medium", "high"];

    const result = queryVendors({
      page: q.page,
      limit: q.limit,
      sortBy: isString(q.sortBy) ? q.sortBy : undefined,
      sortDir:
        isString(q.sortDir) && (q.sortDir === "ASC" || q.sortDir === "DESC")
          ? q.sortDir
          : undefined,
      search: isString(q.search) ? q.search : undefined,
      category: isString(q.category) ? q.category : undefined,
      risk: isString(q.risk) ? q.risk : undefined,
      showReviewed:
        typeof q.showReviewed === "boolean" ? q.showReviewed : undefined,
      filter,
      activity: isString(q.activity) && VALID_ACTIVITIES.includes(q.activity)
        ? q.activity : undefined,
      dataType: isString(q.dataType) && VALID_DATA_TYPES.includes(q.dataType)
        ? q.dataType : undefined,
      volume: isString(q.volume) && VALID_VOLUMES.includes(q.volume)
        ? q.volume : undefined,
      maxMessages: typeof q.maxMessages === "number" && q.maxMessages > 0
        ? Math.floor(q.maxMessages) : undefined,
      onBreachList: typeof q.onBreachList === "boolean" ? q.onBreachList : undefined,
      activeSubscriptions: typeof q.activeSubscriptions === "boolean" ? q.activeSubscriptions : undefined,
      showWhitelisted: typeof q.showWhitelisted === "boolean" ? q.showWhitelisted : undefined,
    });
    return { vendors: result.vendors, total: result.total };
  });

  ipcMain.handle(IPC.markVendorReviewed, (_event, vendorId: unknown, reviewed: unknown) => {
    if (typeof vendorId !== "number") throw new Error("Invalid vendor id");
    updateVendor(vendorId, { status: reviewed === false ? undefined : "reviewed" });
  });

  ipcMain.handle(IPC.deleteVendor, (_event, vendorId: unknown) => {
    if (typeof vendorId !== "number") throw new Error("Invalid vendor id");
    deleteVendor(vendorId);
  });

  ipcMain.handle(IPC.getVendorDetail, (_event, groupKey: unknown) => {
    if (!isString(groupKey) || !groupKey) throw new Error("Invalid group key");
    const detail = getVendorDetail(groupKey);
    let user_email: string | undefined;
    try {
      user_email = getAccountInfo().email;
    } catch {
      // non-fatal — user_email stays undefined
    }
    return {
      ...detail,
      first_activity: detail.vendor.first_seen ?? undefined,
      user_email,
    };
  });
}
