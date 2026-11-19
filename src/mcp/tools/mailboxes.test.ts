import { vi } from "vitest";
import { emailToFileKey } from "../../main/credentials";
import {
  findMailbox,
  getAppActiveMailbox,
  getSelectedMailbox,
  isMailboxAvailable,
  selectMailbox,
} from "../runtime";
import { selectMailboxResult } from "./mailboxes";

vi.mock("../../main/db", () => ({ getDb: vi.fn() }));
vi.mock("../../main/services/cases", () => ({ queryGdprCases: vi.fn(() => []) }));
vi.mock("../../main/services/stats", () => ({
  getDashboardStats: vi.fn(),
  getImpactStats: vi.fn(),
}));
vi.mock("../../main/services/sync", () => ({ getSyncState: vi.fn() }));
vi.mock("../payload", () => ({
  agentToolResult: (payload: Record<string, unknown>, isError = false) => ({
    content: [{ type: "text", text: JSON.stringify(payload) }],
    structuredContent: payload,
    ...(isError ? { isError: true } : {}),
  }),
}));
vi.mock("../runtime", async () => {
  const actual = await vi.importActual("../runtime") as typeof import("../runtime");
  return {
    ...actual,
    findMailbox: vi.fn(),
    getAppActiveMailbox: vi.fn(),
    getSelectedMailbox: vi.fn(),
    isMailboxAvailable: vi.fn(),
    selectMailbox: vi.fn(),
  };
});

const mockedFindMailbox = vi.mocked(findMailbox);
const mockedSelectMailbox = vi.mocked(selectMailbox);
const mockedGetSelectedMailbox = vi.mocked(getSelectedMailbox);
const mockedGetAppActiveMailbox = vi.mocked(getAppActiveMailbox);
const mockedIsMailboxAvailable = vi.mocked(isMailboxAvailable);

describe("selectMailboxResult", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedFindMailbox.mockReturnValue({
      email: "second@example.test",
      providerType: "gmail",
    } as never);
    mockedIsMailboxAvailable.mockReturnValue(true);
    mockedGetSelectedMailbox.mockReturnValue("first_example.test");
    mockedGetAppActiveMailbox.mockReturnValue("first_example.test");
    mockedSelectMailbox.mockReturnValue(true);
  });

  it("reconnects the mailbox database when the key is a different mailbox", () => {
    const result = selectMailboxResult("second_example.test");

    expect(mockedSelectMailbox).toHaveBeenCalledWith("second_example.test");
    expect(result).toEqual(expect.objectContaining({
      structuredContent: expect.objectContaining({
        selectedMailbox: "second_example.test",
        changed: true,
      }),
    }));
  });

  it("does not reconnect when the key is already selected", () => {
    mockedGetSelectedMailbox.mockReturnValue(emailToFileKey("second@example.test"));

    const result = selectMailboxResult("second_example.test");

    expect(mockedSelectMailbox).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({
      structuredContent: expect.objectContaining({
        selectedMailbox: "second_example.test",
        changed: false,
      }),
    }));
  });
});
