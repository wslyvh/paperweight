import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Settings reconnect result", () => {
  it("starts sync after IMAP server settings are saved", () => {
    const source = readFileSync(join(__dirname, "Settings.tsx"), "utf8");
    const modal = source.slice(
      source.indexOf("{/* Server settings modal (IMAP accounts only) */}"),
      source.indexOf("{/* Remove account confirmation modal */}"),
    );

    expect(modal).toContain("window.api.startSync();");
  });
});
