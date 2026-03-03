import { registerAccountHandlers } from "./handlers/account";
import { registerMessageHandlers } from "./handlers/messages";
import { registerSettingsHandlers } from "./handlers/settings";
import { registerStatsHandlers } from "./handlers/stats";
import { registerVendorHandlers } from "./handlers/vendors";

export function registerIpcHandlers() {
  registerAccountHandlers();
  registerMessageHandlers();
  registerSettingsHandlers();
  registerStatsHandlers();
  registerVendorHandlers();
}
