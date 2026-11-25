import { vi } from "vitest";
vi.mock("./cases", () => ({
  createGdprCase: vi.fn(),
  getGdprCaseById: vi.fn(),
  insertGdprCaseEvent: vi.fn(),
  queryGdprCases: vi.fn(() => []),
}));
vi.mock("./email", () => ({ sendEmail: vi.fn() }));
vi.mock("./settings", () => ({ requirePro: vi.fn(), getSetting: vi.fn(() => "Test User") }));
vi.mock("./vendors", () => ({
  getVendorDetail: vi.fn(),
  updateVendor: vi.fn(),
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

const getDetail = vi.mocked(getVendorDetail);
const update = vi.mocked(updateVendor);
const send = vi.mocked(sendEmail);
const createCase = vi.mocked(createGdprCase);
const getCase = vi.mocked(getGdprCaseById);
const addEvent = vi.mocked(insertGdprCaseEvent);
const queryCases = vi.mocked(queryGdprCases);
const approve = vi.fn(async () => "confirmed" as const);

beforeEach(() => {
  vi.clearAllMocks();
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
    )).resolves.toEqual({ status: "sent", caseId: 12, messageId: "sent-id" });

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

  it("returns sent_case_failed with the message id and records without sending again", async () => {
    getDetail.mockReturnValue({
      vendor: { id: 7, root_domain: "example.nl" },
      company: { email: "privacy@example.nl" },
      senders: [],
      receivedAddresses: [],
    } as never);
    send.mockResolvedValue({ success: true, messageId: "sent-id" });
    createCase.mockImplementationOnce(() => { throw new Error("disk full"); });
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
    )).resolves.toEqual({ status: "sent_case_failed", messageId: "sent-id" });
    expect(send).toHaveBeenCalledTimes(1);

    await expect(sendPrivacyRequest(
      7,
      "example.nl",
      "access",
      "mailbox@example.test",
      undefined,
      undefined,
      undefined,
      approve,
      "sent-id",
    )).resolves.toEqual({ status: "sent", caseId: 12, messageId: "sent-id" });
    expect(send).toHaveBeenCalledTimes(1);
    expect(approve).toHaveBeenCalledTimes(1);
  });

  it("records without sending again when the provider omitted a message id", async () => {
    getDetail.mockReturnValue({
      vendor: { id: 7, root_domain: "example.nl" },
      company: { email: "privacy@example.nl" },
      senders: [],
      receivedAddresses: [],
    } as never);
    send.mockResolvedValue({ success: true });
    createCase.mockImplementationOnce(() => { throw new Error("disk full"); });
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
    )).resolves.toEqual({ status: "sent_case_failed" });
    expect(send).toHaveBeenCalledTimes(1);

    await expect(sendPrivacyRequest(
      7,
      "example.nl",
      "access",
      "mailbox@example.test",
      undefined,
      undefined,
      undefined,
      approve,
      undefined,
      true,
    )).resolves.toEqual({ status: "sent", caseId: 12 });
    expect(send).toHaveBeenCalledTimes(1);
    expect(approve).toHaveBeenCalledTimes(1);
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
    const decline = vi.fn(async () => "declined" as const);

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

  it("returns sent_event_failed with the message id and records without sending again", async () => {
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
    send.mockResolvedValue({ success: true, messageId: "follow-id" });
    addEvent.mockImplementationOnce(() => { throw new Error("disk full"); });

    await expect(sendCaseMessage(4, "reminder", "mailbox@example.test", approve))
      .resolves.toEqual({ status: "sent_event_failed", messageId: "follow-id" });
    expect(send).toHaveBeenCalledTimes(1);

    await expect(sendCaseMessage(
      4,
      "reminder",
      "mailbox@example.test",
      approve,
      true,
      "follow-id",
    )).resolves.toEqual({ status: "sent", messageId: "follow-id" });
    expect(send).toHaveBeenCalledTimes(1);
    expect(approve).toHaveBeenCalledTimes(1);
    expect(addEvent).toHaveBeenCalledWith(
      4,
      "reminder_sent",
      expect.objectContaining({ messageId: "follow-id" }),
    );
  });
});


it("blocks Free privacy requests before approval, sending, or local changes", async () => {
  const { requirePro } = await import("./settings");
  vi.mocked(requirePro).mockImplementationOnce(() => { throw new Error("Pro required"); });
  await expect(sendPrivacyRequest(7, "example.nl", "access", "mailbox@example.test", undefined, undefined, undefined, approve))
    .rejects.toThrow("Pro required");
  expect(approve).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
  expect(update).not.toHaveBeenCalled();
  expect(createCase).not.toHaveBeenCalled();
});
