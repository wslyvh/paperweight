import { emailToFileKey } from "../../main/credentials";
import {
  findMailbox,
  getAppActiveMailbox,
  getSelectedMailbox,
  isMailboxAvailable,
  selectMailbox,
} from "../runtime";
import { selectMailboxResult } from "./mailboxes";

jest.mock("../../main/db", () => ({ getDb: jest.fn() }));
jest.mock("../../main/services/cases", () => ({ queryGdprCases: jest.fn(() => []) }));
jest.mock("../../main/services/stats", () => ({
  getDashboardStats: jest.fn(),
  getImpactStats: jest.fn(),
}));
jest.mock("../../main/services/sync", () => ({ getSyncState: jest.fn() }));
jest.mock("../payload", () => ({
  agentToolResult: (payload: Record<string, unknown>, isError = false) => ({
    content: [{ type: "text", text: JSON.stringify(payload) }],
    structuredContent: payload,
    ...(isError ? { isError: true } : {}),
  }),
}));
jest.mock("../runtime", () => {
  const actual = jest.requireActual("../runtime") as typeof import("../runtime");
  return {
    ...actual,
    findMailbox: jest.fn(),
    getAppActiveMailbox: jest.fn(),
    getSelectedMailbox: jest.fn(),
    isMailboxAvailable: jest.fn(),
    selectMailbox: jest.fn(),
  };
});

const mockedFindMailbox = jest.mocked(findMailbox);
const mockedSelectMailbox = jest.mocked(selectMailbox);
const mockedGetSelectedMailbox = jest.mocked(getSelectedMailbox);
const mockedGetAppActiveMailbox = jest.mocked(getAppActiveMailbox);
const mockedIsMailboxAvailable = jest.mocked(isMailboxAvailable);

describe("selectMailboxResult", () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
