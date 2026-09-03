import { reconnectError } from "./settingsReconnect";

describe("Settings reconnect result", () => {
  it("returns the service error for a rejected reconnect", () => {
    expect(
      reconnectError({
        success: false,
        error: "Sign-in returned a different account.",
      }),
    ).toBe("Sign-in returned a different account.");
  });

  it("returns a fallback when a rejected reconnect has no error", () => {
    expect(reconnectError({ success: false })).toBe("Reconnect failed");
  });

  it("returns no error after a successful reconnect", () => {
    expect(reconnectError({ success: true })).toBeUndefined();
  });
});
