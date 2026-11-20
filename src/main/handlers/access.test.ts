import { vi } from "vitest";
const mockHandlers = vi.hoisted(() => (new Map<string, (...args: unknown[]) => unknown>()));
let mockMailbox = vi.hoisted(() => ("first@example.test"));
vi.mock("electron", () => ({
  ipcMain: { handle: (channel: string, listener: (...args: unknown[]) => unknown) => mockHandlers.set(channel, listener) },
}));
vi.mock("../credentials", () => ({
  getActiveEmail: () => mockMailbox,
}));
import { IPC } from "@shared/ipc";
import { handle } from "./access";

beforeEach(() => {
  mockMailbox = "first@example.test";
  mockHandlers.clear();
});

it.each([IPC.markVendorReviewed, IPC.addWhitelistEntry, IPC.confirmPiiFinding, IPC.suppressPiiFinding, IPC.linkGdprCaseMessage])(
  "allows local curation on the selected account for %s", async (channel) => {
    const mutate = vi.fn();
    handle(channel, mutate);
    await mockHandlers.get(channel)?.({});
    expect(mutate).toHaveBeenCalledTimes(1);
  },
);

it("allows inspection and global profile edits without the write lock", () => {
  for (const channel of [IPC.queryVendors, IPC.getPiiOverview, IPC.queryGdprCases, IPC.saveUserProfile]) {
    const operation = vi.fn(() => "available");
    handle(channel, operation);
    expect(mockHandlers.get(channel)?.({})).toBe("available");
  }
});

it("keeps the selected database stable while a mailbox action is pending", async () => {
  let finish: (() => void) | undefined;
  handle(IPC.sendEmail, () => new Promise<void>((resolve) => { finish = resolve; }));
  const switchAccount = vi.fn();
  handle(IPC.switchAccount, switchAccount);
  const sending = mockHandlers.get(IPC.sendEmail)?.({});
  expect(() => mockHandlers.get(IPC.switchAccount)?.({}, "second@example.test")).toThrow("Wait for the current action to finish before continuing.");
  expect(switchAccount).not.toHaveBeenCalled();
  finish?.();
  await sending;
  await mockHandlers.get(IPC.switchAccount)?.({}, "second@example.test");
  expect(switchAccount).toHaveBeenCalled();
});

it("blocks mailbox writes while an account change is pending", async () => {
  let finish: (() => void) | undefined;
  handle(IPC.switchAccount, () => new Promise<void>((resolve) => { finish = resolve; }));
  const send = vi.fn();
  handle(IPC.sendEmail, send);
  const switching = mockHandlers.get(IPC.switchAccount)?.({}, "second@example.test");
  expect(() => mockHandlers.get(IPC.sendEmail)?.({})).toThrow("Wait for the current action to finish before continuing.");
  expect(send).not.toHaveBeenCalled();
  finish?.();
  await switching;
  await mockHandlers.get(IPC.sendEmail)?.({});
  expect(send).toHaveBeenCalled();
});

it("rejects a mailbox write whose originating mailbox changed before it finished", async () => {
  let finish: (() => void) | undefined;
  handle(IPC.sendEmail, () => new Promise<void>((resolve) => { finish = resolve; }));
  const sending = mockHandlers.get(IPC.sendEmail)?.({});
  mockMailbox = "second@example.test";
  finish?.();
  await expect(sending).rejects.toThrow("no longer matches the current mailbox");
});

it("treats account connection as a mailbox transition, not a failed write", async () => {
  handle(IPC.startGmailAuth, () => {
    mockMailbox = "new@example.test";
    return { success: true };
  });
  await expect(mockHandlers.get(IPC.startGmailAuth)?.({})).resolves.toEqual({ success: true });
});

it("blocks connecting an account while a mailbox write is pending", async () => {
  let finish: (() => void) | undefined;
  handle(IPC.sendEmail, () => new Promise<void>((resolve) => { finish = resolve; }));
  const connect = vi.fn();
  handle(IPC.startGmailAuth, connect);
  const sending = mockHandlers.get(IPC.sendEmail)?.({});
  expect(() => mockHandlers.get(IPC.startGmailAuth)?.({})).toThrow("Wait for the current action to finish before continuing.");
  expect(connect).not.toHaveBeenCalled();
  finish?.();
  await sending;
});
