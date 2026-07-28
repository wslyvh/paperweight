import { registerAccountHandlers } from "./handlers/account";
import { registerCaseHandlers } from "./handlers/cases";
import { registerMessageHandlers } from "./handlers/messages";
import { registerPiiHandlers } from "./handlers/pii";
import { registerProfileHandlers } from "./handlers/profile";
import { registerSettingsHandlers } from "./handlers/settings";
import { registerStatsHandlers } from "./handlers/stats";
import { registerVendorHandlers } from "./handlers/vendors";

export function registerIpcHandlers() {
  registerAccountHandlers();
  registerCaseHandlers();
  registerMessageHandlers();
  registerPiiHandlers();
  registerProfileHandlers();
  registerSettingsHandlers();
  registerStatsHandlers();
  registerVendorHandlers();
}
