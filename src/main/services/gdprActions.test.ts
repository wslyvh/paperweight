jest.mock("./cases", () => ({
  createGdprCase: jest.fn(),
  getGdprCaseById: jest.fn(),
  insertGdprCaseEvent: jest.fn(),
  queryGdprCases: jest.fn(() => []),
}));
jest.mock("./email", () => ({ sendEmail: jest.fn() }));
jest.mock("./settings", () => ({ getSetting: jest.fn(() => "Test User") }));
jest.mock("./vendors", () => ({
  getVendorDetail: jest.fn(),
  updateVendor: jest.fn(),
}));

import {
  createGdprCase,
  getGdprCaseById,
  insertGdprCaseEvent,
  queryGdprCases,
} from "./cases";
import { sendEmail } from "./email";
import { sendCaseMessage, sendPrivacyRequest } from "./gdprActions";
import { getVendorDetail, updateVendor } from "./vendors";

const getDetail = jest.mocked(getVendorDetail);
const update = jest.mocked(updateVendor);
const send = jest.mocked(sendEmail);
const createCase = jest.mocked(createGdprCase);
const getCase = jest.mocked(getGdprCaseById);
const addEvent = jest.mocked(insertGdprCaseEvent);
const queryCases = jest.mocked(queryGdprCases);
const approve = jest.fn(async () => "confirmed" as const);

beforeEach(() => {
  jest.clearAllMocks();
  queryCases.mockReturnValue([]);
});

describe("sendPrivacyRequest", () => {
  it("uses the App recipient and requester defaults, sends, then opens a case", async () => {
    getDetail.mockReturnValue({
      vendor: { id: 7, root_domain: "example.nl" },
      company: { email: "privacy@example.nl" },
      senders: [],
      receivedAddresses: [{ address: "alias@example.test" }],
    } as never);
    send.mockResolvedValue({ success: true, messageId: "sent-id" });
    createCase.mockReturnValue({ id: 12 } as never);

    await expect(sendPrivacyRequest(
      7,
      "example.nl",
      "access",
      "mailbox@example.test",
      undefined,
      undefined,
      undefined,
      approve,
    )).resolves.toEqual({ status: "sent", caseId: 12 });

    expect(update).toHaveBeenCalledWith(7, { account_email: "alias@example.test" });
    expect(approve).toHaveBeenCalledWith({
      companyName: "example.nl",
      recipient: "privacy@example.nl",
      action: "access",
    });
    expect(send).toHaveBeenCalledWith(
      "privacy@example.nl",
      expect.any(String),
      expect.stringContaining("alias@example.test"),
    );
    expect(createCase).toHaveBeenCalledWith(expect.objectContaining({
      vendorId: 7,
      requestType: "access",
      recipientEmail: "privacy@example.nl",
      sentMessageId: "sent-id",
    }));
  });

  it("does not send when only a no-reply address is available", async () => {
    getDetail.mockReturnValue({
      vendor: { id: 7, root_domain: "example.test" },
      senders: [{ sender_email: "no-reply@example.test" }],
      receivedAddresses: [],
    } as never);

    await expect(sendPrivacyRequest(
      7,
      "example.test",
      "deletion",
      "mailbox@example.test",
    )).resolves.toEqual({ status: "no_recipient" });
    expect(send).not.toHaveBeenCalled();
  });

  it("uses an explicit request language instead of the domain default", async () => {
    getDetail.mockReturnValue({
      vendor: { id: 7, root_domain: "example.nl" },
      company: { email: "privacy@example.nl" },
      senders: [],
      receivedAddresses: [],
    } as never);
    send.mockResolvedValue({ success: true });
    createCase.mockReturnValue({ id: 12 } as never);

    await sendPrivacyRequest(
      7,
      "example.nl",
      "access",
      "mailbox@example.test",
      undefined,
      undefined,
      "de",
      approve,
    );

    expect(send).toHaveBeenCalledWith(
      "privacy@example.nl",
      "Antrag auf Auskunft über personenbezogene Daten",
      expect.any(String),
    );
  });

  it("refuses a duplicate active case before requesting approval or sending", async () => {
    getDetail.mockReturnValue({
      vendor: { id: 7, name: "Example", root_domain: "example.test" },
      company: { email: "privacy@example.test" },
      senders: [],
      receivedAddresses: [],
    } as never);
    queryCases.mockReturnValue([{ requestType: "access" }] as never);

    await expect(sendPrivacyRequest(
      7,
      "example.test",
      "access",
      "mailbox@example.test",
      undefined,
      undefined,
      undefined,
      approve,
    )).resolves.toEqual({ status: "active_case_exists" });
    expect(approve).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("does not send without an approval callback", async () => {
    getDetail.mockReturnValue({
      vendor: { id: 7, name: "Example", root_domain: "example.test" },
      company: { email: "privacy@example.test" },
      senders: [],
      receivedAddresses: [],
    } as never);

    await expect(sendPrivacyRequest(
      7,
      "example.test",
      "access",
      "mailbox@example.test",
    )).resolves.toEqual({ status: "approval_unavailable" });
    expect(send).not.toHaveBeenCalled();
  });

  it("shows the recipient override for approval and does not send when declined", async () => {
    getDetail.mockReturnValue({
      vendor: { id: 7, name: "Example", root_domain: "example.test" },
      company: { email: "privacy@example.test" },
      senders: [],
      receivedAddresses: [],
    } as never);
    const decline = jest.fn(async () => "declined" as const);

    await expect(sendPrivacyRequest(
      7,
      "example.test",
      "deletion",
      "mailbox@example.test",
      "legal@other-domain.test",
      undefined,
      undefined,
      decline,
    )).resolves.toEqual({ status: "declined" });
    expect(decline).toHaveBeenCalledWith({
      companyName: "Example",
      recipient: "legal@other-domain.test",
      action: "deletion",
    });
    expect(update).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});

describe("sendCaseMessage", () => {
  it("only sends the action currently due and records it after success", async () => {
    getCase.mockReturnValue({
      id: 4,
      status: "active",
      nextAction: "reminder",
      recipientEmail: "privacy@example.test",
      requestType: "deletion",
      openedAt: 1_700_000_000_000,
      accountEmail: "account@example.test",
      vendorName: "Example",
      vendorDomain: "example.test",
      sentMessageId: "original-id",
      events: [{ actionType: "gdpr_request_sent", subject: "Delete my data" }],
    } as never);
    send.mockResolvedValue({ success: true });

    await expect(sendCaseMessage(4, "reminder", "mailbox@example.test", approve))
      .resolves.toEqual({ status: "sent" });
    expect(send).toHaveBeenCalledWith(
      "privacy@example.test",
      "Re: Delete my data",
      expect.stringContaining("Test User"),
      "original-id",
    );
    expect(approve).toHaveBeenCalledWith({
      companyName: "Example",
      recipient: "privacy@example.test",
      action: "reminder",
    });
    expect(addEvent).toHaveBeenCalledWith(
      4,
      "reminder_sent",
      expect.objectContaining({ subject: "Re: Delete my data" }),
    );
  });

  it("does not send an action that is not due", async () => {
    getCase.mockReturnValue({
      id: 4,
      status: "active",
      nextAction: "reminder",
      recipientEmail: "privacy@example.test",
    } as never);

    await expect(sendCaseMessage(4, "followup", "mailbox@example.test"))
      .resolves.toEqual({ status: "not_available" });
    expect(send).not.toHaveBeenCalled();
  });
});
