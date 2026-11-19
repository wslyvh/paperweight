import { vi } from "vitest";
import { join } from "node:path";
const mockReconnect = vi.hoisted(() => (vi.fn()));
let mockActiveEmail = vi.hoisted(() => ("first@example.test"));
const mockSetActive = vi.hoisted(() => (vi.fn((email: string) => { mockActiveEmail = email; })));
const mockSend = vi.hoisted(() => (vi.fn()));
vi.mock("electron", () => ({
  app: { getPath: () => "/tmp/account-view-test" },
  BrowserWindow: { getAllWindows: () => [{ webContents: { send: mockSend } }] },
}));
vi.mock("fs", () => ({ existsSync: () => true }));
vi.mock("../db", () => ({ reconnectDb: mockReconnect }));
vi.mock("../credentials", () => ({
  getActiveEmail: () => mockActiveEmail,
  setActiveEmail: mockSetActive,
  listAccounts: () => [{ email: "first@example.test" }, { email: "second@example.test" }],
  emailToFileKey: (email: string) => email.split("@")[0],
}));
import { switchToAccount } from "./accountView";

beforeEach(() => { mockActiveEmail = "first@example.test"; vi.clearAllMocks(); });

it("switches the open mailbox and the sync account together", () => {
  switchToAccount("second@example.test");
  expect(mockReconnect).toHaveBeenCalledWith(join("/tmp/account-view-test", "second.db"));
  expect(mockSetActive).toHaveBeenCalledWith("second@example.test");
  expect(mockActiveEmail).toBe("second@example.test");
  expect(mockSend).toHaveBeenCalledWith("account-switched", "second@example.test");
});

it("restores the previous database if opening the next account fails", () => {
  mockReconnect.mockImplementationOnce(() => { throw new Error("Unavailable"); });
  expect(() => switchToAccount("second@example.test")).toThrow("Unavailable");
  expect(mockReconnect).toHaveBeenLastCalledWith(join("/tmp/account-view-test", "first.db"));
  expect(mockSetActive).not.toHaveBeenCalled();
  expect(mockActiveEmail).toBe("first@example.test");
});
