import { readFileSync } from "node:fs";
import { join } from "node:path";
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

  it("starts sync after IMAP server settings are saved", () => {
    const source = readFileSync(join(__dirname, "Settings.tsx"), "utf8");
    const modal = source.slice(
      source.indexOf("{/* Server settings modal (IMAP accounts only) */}"),
      source.indexOf("{/* Remove account confirmation modal */}"),
    );

    expect(modal).toContain("window.api.startSync();");
  });
});
