import { getGlobalSetting } from "../main/services/globalSettings";
import { getPiiFindingValues } from "../main/services/pii";
import { getProfileMatchValues } from "../main/services/profile";
import {
  agentToolResult,
  maskAgentPayload,
} from "./payload";

jest.mock("../main/services/globalSettings");
jest.mock("../main/services/pii", () => ({
  getPiiFindingValues: jest.fn(),
  maskValue: jest.requireActual("../main/services/pii").maskValue,
}));
jest.mock("../main/services/profile");

const mockedGetGlobalSetting = jest.mocked(getGlobalSetting);
const mockedGetPiiFindingValues = jest.mocked(getPiiFindingValues);
const mockedGetProfileMatchValues = jest.mocked(getProfileMatchValues);

describe("maskAgentPayload", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetGlobalSetting.mockReturnValue(true);
    mockedGetProfileMatchValues.mockReturnValue([
      { type: "email", value: "person@example.test" },
      { type: "phone", value: "+31612345678" },
      { type: "postal_code", value: "1234AB" },
      { type: "address", value: "Main Street 12" },
    ]);
    mockedGetPiiFindingValues.mockReturnValue([]);
  });

  it("masks user values throughout a payload while preserving company contacts", () => {
    const result = maskAgentPayload({
      mailbox: "person_abc123",
      mailboxes: [{ key: "person_abc123", email: "person@example.test" }],
      accountAddress: "person@example.test",
      receivedAddresses: [{ email: "person@example.test" }],
      whitelist: [{ value: "person@example.test" }, { value: "example.org" }],
      profile: {
        email: "privacy@company.test",
        phone: "+31201234567",
        address: "Company Lane 1",
      },
      senders: [{ email: "hello@company.test", name: "Company Team" }],
      recipientEmail: "dpo@company.test",
      country: "NL",
      subject: "For person@example.test or unknown@else.test",
      preview: "Call +31 6 1234 5678, +31 6 8765 4321, postcode 1234 AB, Main Street 12",
    });

    expect(JSON.stringify(result)).not.toContain("person@example.test");
    expect(JSON.stringify(result)).not.toContain("1234 AB");
    expect(JSON.stringify(result)).not.toContain("Main Street 12");
    expect(result.mailbox).toBe("person_abc123");
    expect(result.mailboxes[0].email).toBe("p•••@e••.test");
    expect(result.accountAddress).toBe("p•••@e••.test");
    expect(result.receivedAddresses[0].email).toBe("p•••@e••.test");
    expect(result.profile).toEqual({
      email: "privacy@company.test",
      phone: "+31201234567",
      address: "Company Lane 1",
    });
    expect(result.senders[0].email).toBe("hello@company.test");
    expect(result.recipientEmail).toBe("dpo@company.test");
    expect(result.country).toBe("NL");
    expect(result.subject).not.toContain("unknown@else.test");
    expect(result.preview).not.toContain("+31 6 8765 4321");
  });

  it("leaves unsubscribe URLs intact so the agent can open them", () => {
    const url = "https://example.test/preferences?email=person@example.test&token=abc";
    expect(maskAgentPayload({ status: "manual_required", url })).toEqual({
      status: "manual_required",
      url,
    });
  });

  it("returns raw App-visible values when masking is off", () => {
    mockedGetGlobalSetting.mockReturnValue(false);
    const payload = { email: "person@example.test", subject: "Call +31612345678" };

    expect(maskAgentPayload(payload)).toBe(payload);
    expect(mockedGetProfileMatchValues).not.toHaveBeenCalled();
    expect(mockedGetPiiFindingValues).not.toHaveBeenCalled();
  });

  it("uses the same masked value for structured output and its JSON mirror", () => {
    const result = agentToolResult({ accountAddress: "person@example.test" });

    expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent);
    expect(result.content[0].text).not.toContain("person@example.test");
  });

});
