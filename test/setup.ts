import { vi } from "vitest";

vi.mock("electron", () => ({}));

// Preserve lazy Electron loading in production while using each suite's
// ordinary Electron mock for the main-process boundary.
vi.mock("../src/main/electronRuntime", async () => {
  const electron = await import("electron");
  return { getElectron: () => electron };
});
