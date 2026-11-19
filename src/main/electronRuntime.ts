// Workers and Node-based maintenance scripts load shared infrastructure too.
// Resolve Electron only when a main-process operation actually needs it.
export function getElectron(): typeof import("electron") {
  return require("electron");
}
