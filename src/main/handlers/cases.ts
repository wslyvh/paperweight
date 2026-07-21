import { ipcMain } from "electron";
import { IPC } from "@shared/ipc";
import type {
  ActionType,
  CreateGdprCaseInput,
  GdprCaseEventInput,
  GdprCaseStatus,
} from "@shared/types";
import {
  closeGdprCase,
  createGdprCase,
  escalateGdprCase,
  getGdprCaseById,
  getGdprCaseReplies,
  getUnseenCaseReplyCount,
  insertGdprCaseEvent,
  linkGdprCaseMessage,
  markGdprCaseViewed,
  queryGdprCases,
  reopenGdprCase,
  unlinkGdprCaseMessage,
} from "../services/cases";

export function registerCaseHandlers(): void {
  ipcMain.handle(IPC.createGdprCase, (_e, input: CreateGdprCaseInput) =>
    createGdprCase(input),
  );

  ipcMain.handle(IPC.getGdprCase, (_e, id: number) => getGdprCaseById(id));

  ipcMain.handle(
    IPC.queryGdprCases,
    (_e, filter?: { status?: GdprCaseStatus; vendorId?: number }) =>
      queryGdprCases(filter),
  );

  ipcMain.handle(IPC.closeGdprCase, (_e, id: number) => closeGdprCase(id));

  ipcMain.handle(IPC.reopenGdprCase, (_e, id: number) => reopenGdprCase(id));

  ipcMain.handle(IPC.escalateGdprCase, (_e, id: number) => escalateGdprCase(id));

  ipcMain.handle(
    IPC.addGdprCaseEvent,
    (_e, caseId: number, actionType: ActionType, details?: GdprCaseEventInput) =>
      insertGdprCaseEvent(caseId, actionType, details),
  );

  ipcMain.handle(IPC.getGdprCaseReplies, (_e, caseId: number) =>
    getGdprCaseReplies(caseId),
  );

  ipcMain.handle(IPC.linkGdprCaseMessage, (_e, caseId: number, messageId: string) =>
    linkGdprCaseMessage(caseId, messageId),
  );

  ipcMain.handle(IPC.unlinkGdprCaseMessage, (_e, caseId: number, messageId: string) =>
    unlinkGdprCaseMessage(caseId, messageId),
  );

  ipcMain.handle(IPC.markGdprCaseViewed, (_e, caseId: number) => markGdprCaseViewed(caseId));

  ipcMain.handle(IPC.getUnseenCaseReplyCount, () => getUnseenCaseReplyCount());
}
