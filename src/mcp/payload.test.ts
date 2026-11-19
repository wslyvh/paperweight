import { vi } from "vitest";
import { getGlobalSetting } from "../main/services/globalSettings";
import { getPiiFindingValues } from "../main/services/pii";
import { getProfileMatchValues } from "../main/services/profile";
import {
  agentToolResult,
  maskAgentPayload,
} from "./payload";

vi.mock("../main/services/globalSettings");
vi.mock("../main/services/pii", async () => ({
  getPiiFindingValues: vi.fn(),
  maskValue: (await vi.importActual<typeof import("../main/services/pii")>("../main/services/pii")).maskValue,
}));
vi.mock("../main/services/profile");

const mockedGetGlobalSetting = vi.mocked(getGlobalSetting);
const mockedGetPiiFindingValues = vi.mocked(getPiiFindingValues);
const mockedGetProfileMatchValues = vi.mocked(getProfileMatchValues);

describe("maskAgentPayload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("masks birthdate findings and known dates in both output formats", () => {
    mockedGetProfileMatchValues.mockReturnValue([{ type: "date_of_birth", value: "1990-04-23" }]);
    mockedGetPiiFindingValues.mockReturnValue([{ type: "date_of_birth", value: "1985-06-17" }]);
    const result = agentToolResult({
      items: [{ type: "date_of_birth", maskedValue: "1990-04-23" }],
      birthDate: "1990-04-23",
      preview: "Dates: 1990-04-23 and 1985-06-17",
    });

    expect(result.structuredContent).toEqual({
      items: [{ type: "date_of_birth", maskedValue: "••-••-1990" }],
      birthDate: "••-••-1990",
      preview: "Dates: ••-••-1990 and ••-••-1985",
    });
    expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent);
  });

  it("preserves full birthdates when masking is off", () => {
    mockedGetGlobalSetting.mockReturnValue(false);
    const payload = { items: [{ type: "date_of_birth", maskedValue: "1990-04-23" }] };
    const result = agentToolResult(payload);
    expect(result.structuredContent).toEqual(payload);
    expect(JSON.parse(result.content[0].text)).toEqual(payload);
  });

});
