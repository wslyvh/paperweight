import {
  acceptedContent,
  inputRequired,
  inputResponse,
} from "@modelcontextprotocol/server";
import type { McpServer, ServerContext } from "@modelcontextprotocol/server";
import {
  bindApprovalServer,
  requestOutboundEmailApproval,
  resolveUserConfirmation,
  UserInputRequired,
} from "./elicitation";

jest.mock("@modelcontextprotocol/server", () => ({
  acceptedContent: jest.fn(),
  inputRequired: Object.assign(jest.fn(), { elicit: jest.fn() }),
  inputResponse: jest.fn(),
}));

const mockedAcceptedContent = jest.mocked(acceptedContent);
const mockedInputRequired = jest.mocked(inputRequired);
const mockedInputResponse = jest.mocked(inputResponse);
const mockedElicit = jest.mocked(inputRequired.elicit);

function context(): ServerContext {
  return { mcpReq: { inputResponses: { confirm: true } } } as unknown as ServerContext;
}

function connectionWithoutElicitation(): McpServer {
  return {
    server: {
      getClientCapabilities: () => ({}),
    },
  } as McpServer;
}

describe("resolveUserConfirmation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    bindApprovalServer();
    mockedElicit.mockReturnValue({ method: "elicitation/create" } as never);
    mockedInputRequired.mockReturnValue({ resultType: "input_required" } as never);
    mockedInputResponse.mockReturnValue({ kind: "missing" } as never);
    mockedAcceptedContent.mockReturnValue(undefined);
  });

  it("requires accept and confirm true before proceeding", () => {
    mockedInputResponse.mockReturnValue({ kind: "elicit", action: "accept" } as never);
    mockedAcceptedContent.mockReturnValue({ confirm: true });
    expect(resolveUserConfirmation(context(), {
      message: "Switch?",
      title: "Switch mailbox",
      description: "Confirm that this agent may use a different mailbox.",
    })).toEqual({ kind: "confirmed" });
    mockedAcceptedContent.mockReturnValue({ confirm: false });
    expect(resolveUserConfirmation(context(), {
      message: "Switch?",
      title: "Switch mailbox",
      description: "Confirm that this agent may use a different mailbox.",
    })).toEqual({ kind: "declined" });
  });

  it("preserves decline and cancel, and fails closed when elicitation cannot be shown", () => {
    mockedInputResponse.mockReturnValue({ kind: "elicit", action: "decline" } as never);
    expect(resolveUserConfirmation(context(), {
      message: "Switch?",
      title: "Switch mailbox",
      description: "Confirm",
    })).toEqual({ kind: "declined" });
    mockedInputResponse.mockReturnValue({ kind: "elicit", action: "cancel" } as never);
    expect(resolveUserConfirmation(context(), {
      message: "Switch?",
      title: "Switch mailbox",
      description: "Confirm",
    })).toEqual({ kind: "cancelled" });
    mockedInputResponse.mockReturnValue({ kind: "missing" } as never);
    mockedInputRequired.mockImplementation(() => {
      throw new Error("Client does not support elicitation");
    });
    expect(resolveUserConfirmation(context(), {
      message: "Switch?",
      title: "Switch mailbox",
      description: "Confirm",
    })).toEqual({ kind: "unavailable" });
  });

  it("returns an input_required result so 2026 clients can show the prompt", () => {
    const result = { resultType: "input_required" };
    mockedInputRequired.mockReturnValue(result as never);
    expect(resolveUserConfirmation(context(), {
      message: "Send?",
      title: "Send email",
      description: "Confirm that Paperweight may send this email.",
    })).toEqual({ kind: "input_required", result });
    expect(mockedElicit).toHaveBeenCalledWith(expect.objectContaining({ message: "Send?" }));
  });

  it("fails closed when the client declared capabilities without elicitation", () => {
    const ctx = {
      mcpReq: {
        inputResponses: undefined,
        envelope: { clientCapabilities: {} },
      },
    } as unknown as ServerContext;
    expect(resolveUserConfirmation(ctx, {
      message: "Switch?",
      title: "Switch mailbox",
      description: "Confirm",
    })).toEqual({ kind: "unavailable" });
    expect(mockedInputRequired).not.toHaveBeenCalled();
  });

  it("fails closed on 2025-era initialize capabilities without elicitation", () => {
    bindApprovalServer(connectionWithoutElicitation());
    expect(resolveUserConfirmation(context(), {
      message: "Switch?",
      title: "Switch mailbox",
      description: "Confirm",
    })).toEqual({ kind: "unavailable" });
    expect(mockedInputRequired).not.toHaveBeenCalled();
  });

  it("fails closed when the envelope uses the namespaced capabilities key", () => {
    const ctx = {
      mcpReq: {
        inputResponses: undefined,
        envelope: { "io.modelcontextprotocol/clientCapabilities": {} },
      },
    } as unknown as ServerContext;
    expect(resolveUserConfirmation(ctx, {
      message: "Switch?",
      title: "Switch mailbox",
      description: "Confirm",
    })).toEqual({ kind: "unavailable" });
    expect(mockedInputRequired).not.toHaveBeenCalled();
  });

  it("throws UserInputRequired from the outbound-mail helper so nested sends can pause", async () => {
    const result = { resultType: "input_required" };
    mockedInputRequired.mockReturnValue(result as never);
    await expect(requestOutboundEmailApproval(context(), "Send?")).rejects.toBeInstanceOf(UserInputRequired);
    await expect(requestOutboundEmailApproval(context(), "Send?")).rejects.toMatchObject({ result });
  });
});
