import { useState } from "react";
import type { AccountSummary } from "@shared/types";

export function useAccounts() {
  const [accounts, setAccounts] = useState<AccountSummary[]>(() => window.api.listAccounts());

  const refresh = () => setAccounts(window.api.listAccounts());

  return { accounts, refresh };
}
