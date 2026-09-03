import { isOAuthTokenError } from "./syncStatus";

describe("SyncStatusBar OAuth recovery", () => {
  it("recognizes normalized authorization-expired errors", () => {
    expect(
      isOAuthTokenError(
        "Authorization expired. Reconnect your account to continue syncing.",
      ),
    ).toBe(true);
  });

  it("does not offer OAuth reconnect for unrelated sync errors", () => {
    expect(isOAuthTokenError("Could not reach the mail server.")).toBe(false);
  });
});
