import { spawn } from "child_process";
import {
  copyFileSync,
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { createInterface } from "readline";
import Database from "better-sqlite3";
import { emailToFileKey } from "../src/main/credentials";
import { configureGlobalDbPath, getGlobalDb } from "../src/main/globalDb";
import { saveGlobalSetting } from "../src/main/services/globalSettings";

interface JsonRpcResponse {
  id?: number;
  result?: Record<string, unknown>;
  error?: unknown;
}

interface Command {
  executable: string;
  args: string[];
  env: NodeJS.ProcessEnv;
}

interface McpConnection {
  request: (
    id: number,
    method: string,
    params: Record<string, unknown>,
  ) => Promise<JsonRpcResponse>;
  notify: (method: string) => void;
  close: () => Promise<void>;
}

const root = resolve(__dirname, "..");
const fixture = join(root, "test", "fixtures", "smoke-account");
const profiles: string[] = [];
const primaryMailbox = "smoke-test@paperweight.test";
const secondMailbox = "second@paperweight.test";
const primaryMailboxKey = emailToFileKey(primaryMailbox);
const secondMailboxKey = emailToFileKey(secondMailbox);
const primaryCompanyKey = `${primaryMailboxKey}:mcp-smoke.test`;

function mailboxRef(mailbox: string, value: string | number): string {
  return `${mailbox}:${String(value)}`;
}

function toolResultText(response: JsonRpcResponse): string {
  const structured = response.result?.structuredContent as { reason?: string } | undefined;
  const content = response.result?.content as Array<{ text?: string }> | undefined;
  return [structured?.reason, content?.[0]?.text].filter(Boolean).join("\n");
}

function prepareProfile(enabled: boolean): string {
  const profile = mkdtempSync(join(tmpdir(), "paperweight-mcp-"));
  profiles.push(profile);
  cpSync(fixture, profile, { recursive: true });
  configureGlobalDbPath(join(profile, "global.db"));
  getGlobalDb();
  if (enabled) {
    saveGlobalSetting("agentAccess", "read");

    const manifest = JSON.parse(
      readFileSync(join(profile, "manifest.json"), "utf-8"),
    ) as { fileKey: string };

    const secondFileKey = emailToFileKey(secondMailbox);
    copyFileSync(
      join(profile, `${manifest.fileKey}.db`),
      join(profile, `${secondFileKey}.db`),
    );
    const secondDatabase = new Database(join(profile, `${secondFileKey}.db`));
    const secondVendor = secondDatabase.prepare(
      `INSERT INTO vendors (
         root_domain, name, category_id, risk_level, first_seen, last_seen,
         message_count, sender_count, has_marketing, has_account
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "mcp-smoke.test",
      "MCP Second",
      "services",
      "medium",
      1_710_000_000_000,
      1_710_000_000_000,
      1,
      1,
      0,
      1,
    );
    secondDatabase.prepare(
      `INSERT INTO messages (
         id, vendor_id, sender_email, subject, body_preview, date, type,
         unsubscribe_method
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "mcp-second-message",
      Number(secondVendor.lastInsertRowid),
      "hello@mcp-second.test",
      "MCP second subject",
      "MCP second preview",
      1_710_000_000_000,
      "update",
      "none",
    );
    secondDatabase.close();

    const global = getGlobalDb();
    global.prepare(
      `UPDATE profile
       SET birth_year = ?, birth_month = ?, birth_day = ?, country = ?
       WHERE id = 1`,
    ).run(1985, 4, 3, "NL");
    global.prepare(
      "INSERT INTO profile_names (first_name, last_name) VALUES (?, ?)",
    ).run("Smoke", "Person");
    global.prepare(
      `INSERT INTO profile_emails (address, value_normalized)
       VALUES (?, ?)`,
    ).run("smoke.person@example.test", "smoke.person@example.test");
    global.prepare(
      `INSERT INTO profile_addresses (
         street, house_number, postal_code, city, country,
         value_normalized, postal_code_normalized
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run("Main Street", "12", "1234 AB", "Amsterdam", "NL", "main street 12 1234ab amsterdam nl", "1234ab");

    const registryPath = join(profile, "accounts.json");
    const registry = JSON.parse(readFileSync(registryPath, "utf-8")) as {
      accounts: Array<{ email: string; providerType: string; registeredAt?: number }>;
    };
    registry.accounts.push({
      email: secondMailbox,
      providerType: "imap",
      registeredAt: 1_710_000_000_000,
    });
    writeFileSync(registryPath, JSON.stringify(registry, null, 2), "utf-8");
  }
  return profile;
}

function seedReadSurface(profile: string): void {
  const manifest = JSON.parse(
    readFileSync(join(profile, "manifest.json"), "utf-8"),
  ) as { fileKey: string };
  const database = new Database(join(profile, `${manifest.fileKey}.db`));
  database.pragma("busy_timeout = 5000");
  const vendor = database.prepare(
    `INSERT INTO vendors (
       root_domain, name, category_id, risk_level, first_seen, last_seen,
       message_count, sender_count, has_marketing, has_account
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "mcp-smoke.test",
    "MCP Smoke",
    "services",
    "low",
    1_700_000_000_000,
    1_700_000_000_000,
    1,
    1,
    0,
    1,
  );
  database.prepare(
    `INSERT INTO messages (
       id, vendor_id, sender_email, subject, body_preview, raw_headers,
       date, type, unsubscribe_method
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "mcp-smoke-message",
    Number(vendor.lastInsertRowid),
    "hello@mcp-smoke.test",
    "MCP smoke subject",
    "MCP smoke preview",
    "X-MCP-Secret: must-not-be-returned",
    1_700_000_000_000,
    "update",
    "none",
  );
  database.prepare(
    "UPDATE messages SET analysis_version = ? WHERE id = ?",
  ).run("mcp-smoke", "mcp-smoke-message");
  database.prepare(
    "UPDATE messages SET received_address = ? WHERE id = ?",
  ).run("smoke.person@example.test", "mcp-smoke-message");
  database.prepare(
    "UPDATE vendors SET account_email = ? WHERE id = ?",
  ).run("smoke.person@example.test", Number(vendor.lastInsertRowid));
  const finding = database.prepare(
    `INSERT INTO pii_findings (message_id, type, value_normalized)
     VALUES (?, ?, ?)`,
  ).run("mcp-smoke-message", "email", "smoke.person@example.test");
  if (Number(finding.lastInsertRowid) <= 0) throw new Error("Could not seed PII finding");
  database.prepare(
    `INSERT INTO pii_findings (message_id, type, value_normalized)
     VALUES (?, ?, ?)`,
  ).run("mcp-smoke-message", "phone", "+31600000000");
  database.prepare(
    `INSERT INTO pii_findings (message_id, type, value_normalized)
     VALUES (?, ?, ?)`,
  ).run("mcp-smoke-message", "postal_code", "1234ab");
  database.prepare(
    `INSERT INTO messages (
       id, vendor_id, sender_email, subject, body_preview, date, type,
       unsubscribe_method
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "mcp-personal-preview",
    Number(vendor.lastInsertRowid),
    "hello@mcp-smoke.test",
    "For smoke.person@example.test or unknown.person@example.test",
    "Call +31 6 0000 0000 or +31 6 9999 9999 near 1234 AB",
    1_712_000_000_000,
    "update",
    "none",
  );

  const caseResult = database.prepare(
    `INSERT INTO gdpr_cases (
       vendor_id, request_type, recipient_email, sent_message_id, opened_at
     ) VALUES (?, ?, ?, ?, ?)`,
  ).run(
    Number(vendor.lastInsertRowid),
    "access",
    "privacy@mcp-smoke.test",
    "<mcp-case@test>",
    1_700_000_000_000,
  );
  const caseId = Number(caseResult.lastInsertRowid);
  database.prepare(
    `INSERT INTO action_log (
       vendor_id, action_type, actioned_at, case_id, subject, body
     ) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    Number(vendor.lastInsertRowid),
    "gdpr_request_sent",
    1_700_000_000_000,
    caseId,
    "MCP access request",
    "MCP outbound body must-not-be-returned",
  );
  database.prepare(
    `INSERT INTO messages (
       id, vendor_id, sender_email, subject, body_preview, raw_headers,
       date, type, unsubscribe_method
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "mcp-case-reply",
    Number(vendor.lastInsertRowid),
    "privacy@mcp-smoke.test",
    "Re: MCP access request",
    "MCP case reply preview",
    JSON.stringify([["In-Reply-To", "<mcp-case@test>"]]),
    1_710_000_000_000,
    "update",
    "none",
  );
  database.prepare(
    `INSERT INTO action_log (
       vendor_id, action_type, actioned_at, case_id, message_id, subject
     ) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    Number(vendor.lastInsertRowid),
    "reply_received",
    1_710_000_000_000,
    caseId,
    "mcp-case-reply",
    "Re: MCP access request",
  );
  database.prepare(
    `INSERT INTO messages (
       id, vendor_id, sender_email, subject, body_preview, date, type,
       unsubscribe_method
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "mcp-other-reply",
    Number(vendor.lastInsertRowid),
    "support@mcp-smoke.test",
    "MCP unrelated reply",
    "MCP unrelated preview",
    1_711_000_000_000,
    "update",
    "none",
  );
  database.prepare(
    `INSERT INTO messages (
       id, vendor_id, sender_email, subject, body_preview, date, type,
       unsubscribe_url, unsubscribe_method
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "mcp-unsubscribe-message",
    Number(vendor.lastInsertRowid),
    "news@mcp-smoke.test",
    "MCP mailing list",
    "MCP mailing preview",
    1_690_000_000_000,
    "promotion",
    "https://mcp-smoke.test/unsubscribe/secret",
    "rfc8058",
  );
  database.prepare("INSERT INTO whitelist (value) VALUES (?)").run("keep.mcp-smoke.test");
  database.prepare("INSERT INTO whitelist (value) VALUES (?)").run("smoke.person@example.test");
  database.close();
}

function seedCollisionSurface(profile: string): void {
  const secondDatabase = new Database(
    join(profile, `${emailToFileKey(secondMailbox)}.db`),
  );
  const secondVendor = secondDatabase.prepare(
    "SELECT id FROM vendors WHERE name = ?",
  ).get("MCP Second") as { id: number };
  secondDatabase.prepare(
    `INSERT INTO pii_findings (message_id, type, value_normalized)
     VALUES (?, ?, ?), (?, ?, ?)`,
  ).run(
    "mcp-second-message",
    "email",
    "second.person@example.test",
    "mcp-second-message",
    "phone",
    "+31611111111",
  );
  secondDatabase.prepare(
    `INSERT INTO gdpr_cases (
       vendor_id, request_type, recipient_email, sent_message_id, opened_at
     ) VALUES (?, ?, ?, ?, ?)`,
  ).run(
    secondVendor.id,
    "access",
    "privacy@mcp-second.test",
    "<mcp-second-case@test>",
    1_700_000_000_000,
  );
  secondDatabase.close();
}

function commandFor(profile: string): Command {
  const packaged = process.argv.includes("--packaged");
  if (packaged) {
    return {
      executable: join(root, "dist", "linux-unpacked", "resources", "paperweight-mcp"),
      args: ["--no-sandbox"],
      env: {
        ...process.env,
        ELECTRON_DISABLE_SANDBOX: "1",
        PAPERWEIGHT_USER_DATA: profile,
      },
    };
  }
  return {
    executable: join(
      root,
      "build",
      "mcp",
      process.platform === "win32" ? "paperweight-mcp.cmd" : "paperweight-mcp",
    ),
    args: ["--no-sandbox"],
    env: {
      ...process.env,
      ELECTRON_DISABLE_SANDBOX: "1",
      PAPERWEIGHT_USER_DATA: profile,
    },
  };
}

async function waitForExit(child: ReturnType<typeof spawn>): Promise<number | null> {
  return new Promise((resolveExit, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("MCP process did not exit after stdin closed"));
    }, 5_000);
    child.once("close", (code) => {
      clearTimeout(timeout);
      resolveExit(code);
    });
    child.once("error", reject);
  });
}

function openMcp(profile: string): McpConnection {
  const command = commandFor(profile);
  const child = spawn(command.executable, command.args, {
    cwd: root,
    env: command.env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const responses = new Map<number, {
    resolve: (response: JsonRpcResponse) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }>();
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });

  const lines = createInterface({ input: child.stdout });
  lines.on("line", (line) => {
    let response: JsonRpcResponse;
    try {
      response = JSON.parse(line) as JsonRpcResponse;
    } catch {
      child.kill();
      for (const pending of responses.values()) {
        clearTimeout(pending.timeout);
        pending.reject(new Error(`Non-protocol stdout from MCP process: ${line}`));
      }
      responses.clear();
      return;
    }
    if (response.id !== undefined) {
      const pending = responses.get(response.id);
      if (pending) {
        clearTimeout(pending.timeout);
        responses.delete(response.id);
        pending.resolve(response);
      }
    }
  });
  child.once("close", (code) => {
    for (const pending of responses.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(`MCP process exited before responding (${code}): ${stderr}`));
    }
    responses.clear();
  });

  return {
    request(id, method, params) {
      return new Promise<JsonRpcResponse>((resolveResponse, rejectResponse) => {
        const timeout = setTimeout(() => {
          responses.delete(id);
          rejectResponse(new Error(`MCP request timed out: ${method}`));
        }, 5_000);
        responses.set(id, {
          resolve: resolveResponse,
          reject: rejectResponse,
          timeout,
        });
        child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
      });
    },
    notify(method) {
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method })}\n`);
    },
    async close() {
      child.stdin.end();
      const exitCode = await waitForExit(child);
      if (exitCode !== 0) throw new Error(`MCP process exited with ${exitCode}: ${stderr}`);
      if (stderr !== "") throw new Error(`MCP process wrote diagnostics during success: ${stderr}`);
    },
  };
}

async function proveDisabledAccess(): Promise<void> {
  const command = commandFor(prepareProfile(false));
  const child = spawn(command.executable, command.args, {
    cwd: root,
    env: command.env,
    stdio: ["ignore", "pipe", "ignore"],
  });
  let stdout = "";
  child.stdout.on("data", (chunk) => { stdout += String(chunk); });
  const exitCode = await waitForExit(child);
  if (exitCode === 0) throw new Error("Disabled MCP process exited successfully");
  if (stdout !== "") throw new Error("Disabled MCP process wrote to protocol stdout");
}

async function proveOverviewRead(): Promise<void> {
  const profile = prepareProfile(true);
  const readConnection = openMcp(profile);
  let request = readConnection.request;

  const initialize = await request(1, "initialize", {
    protocolVersion: "2026-07-28",
    capabilities: {},
    clientInfo: { name: "paperweight-smoke", version: "1.0.0" },
  });
  if (initialize.error) throw new Error("MCP initialize failed");
  readConnection.notify("notifications/initialized");

  // Seed only after the real MCP startup path has migrated the fixture database.
  seedReadSurface(profile);

  const list = await request(2, "tools/list", {});
  const tools = list.result?.tools;
  if (!Array.isArray(tools) || tools.length !== 12) {
    throw new Error("Read-only MCP did not expose exactly twelve tools");
  }
  const toolNames = tools
    .map((tool) => (tool as { name?: string }).name)
    .sort();
  if (
    toolNames.join(",")
    !== "get_activity,get_case,get_company,get_overview,get_personal_data_companies,get_profile,list_mailboxes,list_whitelist,search_cases,search_companies,search_personal_data,select_mailbox"
  ) {
    throw new Error(`Unexpected MCP tools: ${toolNames.join(",")}`);
  }
  const writeToolNames = new Set([
    "classify_personal_data",
    "report_company_spam",
    "send_case_message",
    "send_privacy_request",
    "set_case_message_link",
    "set_company_account_email",
    "set_company_reviewed",
    "set_whitelist_entry",
    "trash_company_messages",
    "unsubscribe_company",
    "update_case_status",
    "update_profile",
  ]);
  for (const tool of tools as Array<{
    name?: string;
    annotations?: { readOnlyHint?: boolean };
  }>) {
    const shouldBeReadOnly = tool.name !== "select_mailbox"
      && !writeToolNames.has(tool.name ?? "");
    if (tool.annotations?.readOnlyHint !== shouldBeReadOnly) {
      throw new Error(`Incorrect read/write annotation for ${tool.name}`);
    }
  }

  const mailboxes = await request(3, "tools/call", {
    name: "list_mailboxes",
    arguments: {},
  });
  if (mailboxes.error) throw new Error("Mailbox list tool call failed");
  // list_mailboxes initializes the second account schema through its isolated
  // read connection. Add matching integer IDs now to prove namespace checks,
  // rather than missing rows, reject stale references later in the smoke.
  seedCollisionSurface(profile);
  const mailboxContent = mailboxes.result?.structuredContent as {
    selectedMailbox?: string;
    appActiveMailbox?: string;
    mailboxes?: Array<{
      key?: string;
      email?: string;
      isAppActive?: boolean;
      isMcpSelected?: boolean;
      isAvailable?: boolean;
      summary?: {
        totalMessages?: number;
        accountCount?: number;
        highRiskUnreviewedAccountCount?: number;
      };
    }>;
  } | undefined;
  const primaryEntry = mailboxContent?.mailboxes?.find(
    (mailbox) => mailbox.key === primaryMailboxKey,
  );
  const secondEntry = mailboxContent?.mailboxes?.find(
    (mailbox) => mailbox.key === secondMailboxKey,
  );
  if (
    mailboxContent?.selectedMailbox !== primaryMailboxKey
    || mailboxContent.appActiveMailbox !== primaryMailboxKey
    || primaryEntry?.email === primaryMailbox
    || secondEntry?.email === secondMailbox
    || primaryEntry?.isAppActive !== true
    || primaryEntry.isMcpSelected !== true
    || primaryEntry.isAvailable !== true
    || !primaryEntry.summary?.totalMessages
    || !primaryEntry.summary.accountCount
    || "dailyEmailTrend" in primaryEntry.summary
    || secondEntry?.isAppActive !== false
    || secondEntry.isMcpSelected !== false
    || secondEntry.isAvailable !== true
    || !secondEntry.summary?.totalMessages
    || !secondEntry.summary.accountCount
  ) {
    throw new Error(`Mailbox list did not identify selection state: ${JSON.stringify(mailboxContent)}`);
  }

  const call = await request(4, "tools/call", {
    name: "get_overview",
    arguments: {},
  });
  if (call.error) throw new Error("Overview tool call failed");
  const structured = call.result?.structuredContent as Record<string, unknown> | undefined;
  if (
    !structured
    || structured.mailbox !== primaryMailboxKey
    || typeof structured.totalMessages !== "number"
    || structured.totalMessages <= 0
    || typeof structured.accountCount !== "number"
    || structured.accountCount <= 0
    || structured.totalMessages !== primaryEntry.summary.totalMessages
    || structured.accountCount !== primaryEntry.summary.accountCount
    || structured.highRiskUnreviewedAccountCount
      !== primaryEntry.summary.highRiskUnreviewedAccountCount
    || "dailyEmailTrend" in structured
  ) {
    throw new Error("Overview tool did not return the Dashboard data");
  }

  const sameMailbox = await request(5, "tools/call", {
    name: "select_mailbox",
    arguments: { key: primaryMailboxKey },
  });
  const sameMailboxContent = sameMailbox.result?.structuredContent as {
    selectedMailbox?: string;
    changed?: boolean;
  } | undefined;
  if (
    sameMailbox.error
    || sameMailbox.result?.isError === true
    || sameMailboxContent?.selectedMailbox !== primaryMailboxKey
    || sameMailboxContent.changed !== false
  ) {
    throw new Error("Selecting the current mailbox should not require approval");
  }

  const switchedMailbox = await request(6, "tools/call", {
    name: "select_mailbox",
    arguments: { key: secondMailboxKey },
  });
  const switchedMailboxContent = switchedMailbox.result?.structuredContent as {
    selectedMailbox?: string;
    changed?: boolean;
  } | undefined;
  if (
    switchedMailbox.error
    || switchedMailbox.result?.isError === true
    || switchedMailboxContent?.changed !== true
    || switchedMailboxContent.selectedMailbox !== secondMailboxKey
  ) {
    throw new Error(
      `Mailbox switch did not change the selected mailbox: ${JSON.stringify(switchedMailbox)}`,
    );
  }

  const secondOverview = await request(7, "tools/call", {
    name: "get_overview",
    arguments: {},
  });
  const secondOverviewContent = secondOverview.result?.structuredContent as {
    mailbox?: string;
  } | undefined;
  if (secondOverviewContent?.mailbox !== secondMailboxKey) {
    throw new Error("Selecting another mailbox did not change later reads");
  }

  const restoredMailbox = await request(8, "tools/call", {
    name: "select_mailbox",
    arguments: { key: primaryMailboxKey },
  });
  const restoredMailboxContent = restoredMailbox.result?.structuredContent as {
    selectedMailbox?: string;
    changed?: boolean;
  } | undefined;
  if (
    restoredMailbox.error
    || restoredMailbox.result?.isError === true
    || restoredMailboxContent?.changed !== true
    || restoredMailboxContent.selectedMailbox !== primaryMailboxKey
  ) {
    throw new Error("Could not switch back to the original mailbox");
  }

  const search = await request(10, "tools/call", {
    name: "search_companies",
    arguments: { view: "accounts", search: "MCP Smoke" },
  });
  if (search.error) throw new Error("Company search tool call failed");
  const searchContent = search.result?.structuredContent as {
    mailbox?: string;
    total?: number;
    items?: Array<{ key?: string; name?: string }>;
  } | undefined;
  if (
    searchContent?.mailbox !== primaryMailboxKey
    || searchContent.total !== 1
    || searchContent.items?.[0]?.key !== primaryCompanyKey
    || searchContent.items[0]?.name !== "MCP Smoke"
  ) {
    throw new Error("Company search did not return the fixture company");
  }

  const company = await request(11, "tools/call", {
    name: "get_company",
    arguments: { key: primaryCompanyKey },
  });
  if (company.error) throw new Error("Company detail tool call failed");
  if (company.result?.isError === true) {
    throw new Error(`Company detail returned an error: ${JSON.stringify(company.result.content)}`);
  }
  const companyContent = company.result?.structuredContent as {
    mailbox?: string;
    company?: { name?: string };
    accountAddress?: string;
    senders?: Array<{ email?: string }>;
    receivedAddresses?: Array<{ email?: string }>;
    privacyCases?: Array<{ recipientEmail?: string }>;
    availableUnsubscribeMethods?: string[];
    recentMessages?: Array<{ subject?: string; preview?: string }>;
    personalData?: { values?: unknown[] };
  } | undefined;
  if (
    companyContent?.mailbox !== primaryMailboxKey
    || companyContent.company?.name !== "MCP Smoke"
    || !companyContent.availableUnsubscribeMethods?.includes("one_click")
    || !companyContent.recentMessages?.some((message) =>
      message.subject === "MCP smoke subject" && message.preview === "MCP smoke preview"
    )
    || !Array.isArray(companyContent.personalData?.values)
    || companyContent.accountAddress === "smoke.person@example.test"
    || companyContent.receivedAddresses?.some(
      (address) => address.email === "smoke.person@example.test",
    )
    || !companyContent.senders?.some((sender) => sender.email === "hello@mcp-smoke.test")
    || !companyContent.privacyCases?.some(
      (privacyCase) => privacyCase.recipientEmail === "privacy@mcp-smoke.test",
    )
  ) {
    throw new Error(
      `Company detail did not return the visible fixture data: ${JSON.stringify(company.result)}`,
    );
  }
  const serializedCompany = JSON.stringify(companyContent);
  if (
    serializedCompany.includes("raw_headers")
    || serializedCompany.includes("must-not-be-returned")
    || serializedCompany.includes("/unsubscribe/secret")
    || serializedCompany.includes("smoke.person@example.test")
    || serializedCompany.includes("unknown.person@example.test")
    || serializedCompany.includes("+31 6 0000 0000")
    || serializedCompany.includes("+31 6 9999 9999")
    || serializedCompany.includes("1234 AB")
  ) {
    throw new Error("Company detail exposed non-display message or action data");
  }

  const cases = await request(12, "tools/call", {
    name: "search_cases",
    arguments: { search: "MCP Smoke", status: "needs_attention" },
  });
  const casesContent = cases.result?.structuredContent as {
    mailbox?: string;
    total?: number;
    items?: Array<{ id?: string; companyName?: string }>;
  } | undefined;
  const caseId = casesContent?.items?.[0]?.id;
  if (
    casesContent?.mailbox !== primaryMailboxKey
    || casesContent.total !== 1
    || casesContent.items?.[0]?.companyName !== "MCP Smoke"
    || typeof caseId !== "string"
  ) {
    throw new Error(`Case search did not return the fixture case: ${JSON.stringify(casesContent)}`);
  }

  const caseDetail = await request(13, "tools/call", {
    name: "get_case",
    arguments: { id: caseId },
  });
  const caseContent = caseDetail.result?.structuredContent as {
    mailbox?: string;
    events?: Array<{ actionType?: string; subject?: string }>;
    messages?: Array<{ ref?: string; subject?: string; preview?: string; relation?: string }>;
  } | undefined;
  if (
    caseContent?.mailbox !== primaryMailboxKey
    || !caseContent.events?.some((event) => event.subject === "MCP access request")
    || !caseContent.messages?.some((message) =>
      message.subject === "Re: MCP access request"
      && message.preview === "MCP case reply preview"
      && message.relation === "thread"
      && message.ref === mailboxRef(primaryMailboxKey, "mcp-case-reply")
    )
    || caseContent.events.some((event) =>
      event.actionType === "reply_received" || event.actionType === "case_message_linked"
    )
  ) {
    throw new Error(`Case detail did not return the visible timeline: ${JSON.stringify(caseContent)}`);
  }
  const serializedCase = JSON.stringify(caseContent);
  if (
    serializedCase.includes("MCP outbound body must-not-be-returned")
    || serializedCase.includes("In-Reply-To")
  ) {
    throw new Error("Case detail exposed a body or raw header");
  }

  const personalData = await request(14, "tools/call", {
    name: "search_personal_data",
    arguments: { type: "email" },
  });
  const personalDataContent = personalData.result?.structuredContent as {
    mailbox?: string;
    total?: number;
    items?: Array<{ ref?: string; maskedValue?: string; confidence?: string }>;
  } | undefined;
  const piiRef = personalDataContent?.items?.[0]?.ref;
  if (
    personalDataContent?.mailbox !== primaryMailboxKey
    || personalDataContent.total !== 1
    || typeof piiRef !== "string"
    || personalDataContent.items?.[0]?.maskedValue !== "s•••@e••.test"
    || personalDataContent.items[0]?.confidence !== "high"
  ) {
    throw new Error(`Personal data search did not return masked data: ${JSON.stringify(personalDataContent)}`);
  }
  if (JSON.stringify(personalDataContent).includes("smoke.person@example.test")) {
    throw new Error("Personal data search exposed a raw value");
  }

  const piiCompanies = await request(15, "tools/call", {
    name: "get_personal_data_companies",
    arguments: { ref: piiRef },
  });
  const piiCompaniesContent = piiCompanies.result?.structuredContent as {
    companies?: Array<{ key?: string; name?: string }>;
  } | undefined;
  if (
    piiCompaniesContent?.companies?.[0]?.key !== primaryCompanyKey
    || piiCompaniesContent.companies[0]?.name !== "MCP Smoke"
  ) {
    throw new Error("Personal data company expansion did not match the app data");
  }

  const profileCall = await request(16, "tools/call", {
    name: "get_profile",
    arguments: {},
  });
  const profileContent = profileCall.result?.structuredContent as {
    scope?: string;
    country?: string;
    names?: Array<{ ref?: number; maskedValue?: string }>;
    emails?: Array<{ ref?: number; maskedValue?: string }>;
  } | undefined;
  if (
    profileContent?.scope !== "global"
    || profileContent.country !== "NL"
    || profileContent.names?.[0]?.maskedValue !== "S••• P•••"
    || typeof profileContent.names[0]?.ref !== "number"
    || profileContent.emails?.[0]?.maskedValue !== "s•••@e••.test"
    || typeof profileContent.emails[0]?.ref !== "number"
  ) {
    throw new Error(`Profile did not return masked global data: ${JSON.stringify(profileContent)}`);
  }
  if (JSON.stringify(profileContent).includes("smoke.person@example.test")) {
    throw new Error("Profile exposed a raw personal value");
  }
  if (profileContent && "mailbox" in profileContent) {
    throw new Error("Global profile was incorrectly scoped to a mailbox");
  }

  const activity = await request(17, "tools/call", {
    name: "get_activity",
    arguments: {},
  });
  const activityContent = activity.result?.structuredContent as {
    mailbox?: string;
    total?: number;
    items?: Array<{ actionType?: string; companyName?: string }>;
  } | undefined;
  if (
    activityContent?.mailbox !== primaryMailboxKey
    || !activityContent.total
    || !activityContent.items?.some((item) =>
      item.actionType === "gdpr_request_sent" && item.companyName === "MCP Smoke"
    )
  ) {
    throw new Error("Activity did not return the selected mailbox history");
  }

  const whitelist = await request(18, "tools/call", {
    name: "list_whitelist",
    arguments: {},
  });
  const whitelistContent = whitelist.result?.structuredContent as {
    mailbox?: string;
    items?: Array<{ value?: string; kind?: string }>;
  } | undefined;
  if (
    whitelistContent?.mailbox !== primaryMailboxKey
    || !whitelistContent.items?.some((item) =>
      item.value === "keep.mcp-smoke.test" && item.kind === "domain"
    )
    || whitelistContent.items.some((item) => item.value === "smoke.person@example.test")
  ) {
    throw new Error("Whitelist did not return the selected mailbox entries");
  }

  saveGlobalSetting("agentMaskPersonalData", false);
  const unmaskedMailboxes = await request(19, "tools/call", {
    name: "list_mailboxes",
    arguments: {},
  });
  const unmaskedMailboxContent = unmaskedMailboxes.result?.structuredContent as {
    mailboxes?: Array<{ key?: string; email?: string }>;
  } | undefined;
  if (!unmaskedMailboxContent?.mailboxes?.some((mailbox) =>
    mailbox.key === primaryMailboxKey && mailbox.email === primaryMailbox
  )) {
    throw new Error("Mask off did not reveal mailbox display addresses while retaining keys");
  }

  const unmaskedCompany = await request(20, "tools/call", {
    name: "get_company",
    arguments: { key: primaryCompanyKey },
  });
  const serializedUnmaskedCompany = JSON.stringify(unmaskedCompany.result);
  if (
    !serializedUnmaskedCompany.includes("smoke.person@example.test")
    || !serializedUnmaskedCompany.includes("unknown.person@example.test")
    || !serializedUnmaskedCompany.includes("+31 6 9999 9999")
  ) {
    throw new Error("Mask off did not return App-visible company personal data");
  }

  const unmaskedProfile = await request(21, "tools/call", {
    name: "get_profile",
    arguments: {},
  });
  if (!JSON.stringify(unmaskedProfile.result).includes("smoke.person@example.test")) {
    throw new Error("Mask off did not return raw profile values");
  }

  const unmaskedPersonalData = await request(22, "tools/call", {
    name: "search_personal_data",
    arguments: { type: "email" },
  });
  if (!JSON.stringify(unmaskedPersonalData.result).includes("smoke.person@example.test")) {
    throw new Error("Mask off did not return raw personal-data findings");
  }

  const unmaskedWhitelist = await request(23, "tools/call", {
    name: "list_whitelist",
    arguments: {},
  });
  if (!JSON.stringify(unmaskedWhitelist.result).includes("smoke.person@example.test")) {
    throw new Error("Mask off did not return raw whitelist email entries");
  }
  saveGlobalSetting("agentMaskPersonalData", true);

  const writeCalls: Array<{ name: string; arguments: Record<string, unknown> }> = [
    { name: "unsubscribe_company", arguments: { mailbox: primaryMailboxKey, key: primaryCompanyKey } },
    { name: "set_company_reviewed", arguments: { mailbox: primaryMailboxKey, key: primaryCompanyKey, reviewed: true } },
    { name: "set_company_account_email", arguments: { mailbox: primaryMailboxKey, key: primaryCompanyKey, email: "alias@example.test" } },
    { name: "set_whitelist_entry", arguments: { mailbox: primaryMailboxKey, value: "blocked-write.test", whitelisted: true } },
    { name: "trash_company_messages", arguments: { mailbox: primaryMailboxKey, key: primaryCompanyKey, scope: "marketing" } },
    { name: "report_company_spam", arguments: { mailbox: primaryMailboxKey, key: primaryCompanyKey } },
    { name: "send_privacy_request", arguments: { mailbox: primaryMailboxKey, key: primaryCompanyKey, requestType: "access" } },
    { name: "send_case_message", arguments: { mailbox: primaryMailboxKey, id: caseId, action: "reminder" } },
    { name: "update_case_status", arguments: { mailbox: primaryMailboxKey, id: caseId, action: "close" } },
    { name: "set_case_message_link", arguments: { mailbox: primaryMailboxKey, id: caseId, messageRef: mailboxRef(primaryMailboxKey, "mcp-case-reply"), linked: true } },
    { name: "classify_personal_data", arguments: { mailbox: primaryMailboxKey, ref: piiRef, classification: "mine" } },
    { name: "update_profile", arguments: { mailbox: primaryMailboxKey, operation: "set_country", country: "NL" } },
  ];
  let requestId = 24;
  for (const write of writeCalls) {
    const deniedWrite = await request(requestId++, "tools/call", write);
    if (!deniedWrite.error && deniedWrite.result?.isError !== true) {
      throw new Error(`Read-only access allowed the ${write.name} write`);
    }
  }

  await readConnection.close();
  saveGlobalSetting("agentAccess", "actions");

  const actionConnection = openMcp(profile);
  request = actionConnection.request;
  const actionInitialize = await request(requestId++, "initialize", {
    protocolVersion: "2026-07-28",
    capabilities: {},
    clientInfo: { name: "paperweight-smoke", version: "1.0.0" },
  });
  if (actionInitialize.error) throw new Error("Actions MCP initialize failed");
  actionConnection.notify("notifications/initialized");

  const actionList = await request(requestId++, "tools/list", {});
  const actionTools = actionList.result?.tools;
  if (!Array.isArray(actionTools) || actionTools.length !== 24) {
    throw new Error("Read & write MCP did not expose exactly twenty-four tools");
  }
  const actionToolNames = new Set(
    actionTools.map((tool) => (tool as { name?: string }).name),
  );
  for (const writeToolName of writeToolNames) {
    if (!actionToolNames.has(writeToolName)) {
      throw new Error(`Read & write MCP omitted ${writeToolName}`);
    }
  }

  const unclassifiedData = await request(requestId++, "tools/call", {
    name: "search_personal_data",
    arguments: { type: "phone", state: "unclassified" },
  });
  const unclassifiedContent = unclassifiedData.result?.structuredContent as {
    items?: Array<{ ref?: string }>;
  } | undefined;
  const unclassifiedRef = unclassifiedContent?.items?.[0]?.ref;
  if (typeof unclassifiedRef !== "string") {
    throw new Error("Could not resolve the unclassified personal-data fixture");
  }

  saveGlobalSetting("activeAccount", secondMailbox);
  const collisionConnection = openMcp(profile);
  const collisionRequest = collisionConnection.request;
  const collisionInitialize = await collisionRequest(requestId++, "initialize", {
    protocolVersion: "2026-07-28",
    capabilities: {},
    clientInfo: { name: "paperweight-smoke", version: "1.0.0" },
  });
  if (collisionInitialize.error) throw new Error("Collision MCP initialize failed");
  collisionConnection.notify("notifications/initialized");

  const collisionDatabase = new Database(
    join(profile, `${emailToFileKey(secondMailbox)}.db`),
    { readonly: true },
  );
  const staleFindingId = Number(unclassifiedRef.slice(primaryMailboxKey.length + 1));
  const staleCaseId = Number(caseId.slice(primaryMailboxKey.length + 1));
  const findingCollision = collisionDatabase.prepare(
    "SELECT 1 FROM pii_findings WHERE id = ?",
  ).get(staleFindingId);
  const caseCollision = collisionDatabase.prepare(
    "SELECT 1 FROM gdpr_cases WHERE id = ?",
  ).get(staleCaseId);
  const companyCollision = collisionDatabase.prepare(
    "SELECT 1 FROM vendors WHERE root_domain = ?",
  ).get("mcp-smoke.test");
  collisionDatabase.close();
  if (!findingCollision || !caseCollision || !companyCollision) {
    throw new Error("Stale-reference fixture did not create cross-mailbox collisions");
  }
  const staleClassification = await collisionRequest(requestId++, "tools/call", {
    name: "classify_personal_data",
    arguments: {
      mailbox: secondMailboxKey,
      ref: unclassifiedRef,
      classification: "mine",
    },
  });
  if (staleClassification.result?.isError !== true) {
    throw new Error("A stale personal-data ref crossed mailbox boundaries");
  }
  const staleCase = await collisionRequest(requestId++, "tools/call", {
    name: "update_case_status",
    arguments: { mailbox: secondMailboxKey, id: caseId, action: "close" },
  });
  if (staleCase.result?.isError !== true) {
    throw new Error("A stale case ref crossed mailbox boundaries");
  }
  const staleCompany = await collisionRequest(requestId++, "tools/call", {
    name: "set_company_reviewed",
    arguments: { mailbox: secondMailboxKey, key: primaryCompanyKey, reviewed: true },
  });
  if (staleCompany.result?.isError !== true) {
    throw new Error("A stale company ref crossed mailbox boundaries");
  }
  await collisionConnection.close();
  saveGlobalSetting("activeAccount", primaryMailbox);

  const missingPrivacyApproval = await request(requestId++, "tools/call", {
    name: "send_privacy_request",
    arguments: {
      mailbox: primaryMailboxKey,
      key: primaryCompanyKey,
      requestType: "deletion",
      recipientEmail: "privacy@mcp-smoke.test",
    },
  });
  if (missingPrivacyApproval.result?.isError !== true) {
    throw new Error("Privacy request did not fail closed without elicitation");
  }
  if (!toolResultText(missingPrivacyApproval).includes("Send this from the Paperweight app")) {
    throw new Error(
      `Privacy request fail-closed copy missing: ${JSON.stringify(missingPrivacyApproval)}`,
    );
  }

  const manifest = JSON.parse(
    readFileSync(join(profile, "manifest.json"), "utf-8"),
  ) as { fileKey: string };
  const actionDatabase = new Database(join(profile, `${manifest.fileKey}.db`));
  const vendorRow = actionDatabase.prepare(
    "SELECT id FROM vendors WHERE root_domain = ?",
  ).get("mcp-smoke.test") as { id: number };
  const dueCase = actionDatabase.prepare(
    `INSERT INTO gdpr_cases (
       vendor_id, request_type, recipient_email, sent_message_id, opened_at
     ) VALUES (?, ?, ?, ?, ?)`,
  ).run(
    vendorRow.id,
    "deletion",
    "privacy@mcp-smoke.test",
    "<mcp-due-case@test>",
    Date.now() - 15 * 24 * 60 * 60 * 1_000,
  );
  const dueCaseId = Number(dueCase.lastInsertRowid);
  actionDatabase.prepare(
    `INSERT INTO action_log (
       vendor_id, action_type, actioned_at, case_id, subject, body
     ) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    vendorRow.id,
    "gdpr_request_sent",
    Date.now() - 15 * 24 * 60 * 60 * 1_000,
    dueCaseId,
    "MCP deletion request",
    "MCP outbound body",
  );
  actionDatabase.close();

  const missingCaseApproval = await request(requestId++, "tools/call", {
    name: "send_case_message",
    arguments: {
      mailbox: primaryMailboxKey,
      id: mailboxRef(primaryMailboxKey, dueCaseId),
      action: "reminder",
    },
  });
  if (missingCaseApproval.result?.isError !== true) {
    throw new Error("Case message did not fail closed without elicitation");
  }
  if (!toolResultText(missingCaseApproval).includes("Send this from the Paperweight app")) {
    throw new Error(
      `Case message fail-closed copy missing: ${JSON.stringify(missingCaseApproval)}`,
    );
  }

  for (const write of [
    { name: "set_company_reviewed", arguments: { mailbox: primaryMailboxKey, key: primaryCompanyKey, reviewed: true } },
    { name: "set_company_account_email", arguments: { mailbox: primaryMailboxKey, key: primaryCompanyKey, email: "alias@example.test" } },
    { name: "set_whitelist_entry", arguments: { mailbox: primaryMailboxKey, value: "write-enabled.test", whitelisted: true } },
    { name: "update_case_status", arguments: { mailbox: primaryMailboxKey, id: caseId, action: "close" } },
    { name: "update_case_status", arguments: { mailbox: primaryMailboxKey, id: caseId, action: "reopen" } },
    { name: "set_case_message_link", arguments: { mailbox: primaryMailboxKey, id: caseId, messageRef: mailboxRef(primaryMailboxKey, "mcp-other-reply"), linked: true } },
    { name: "classify_personal_data", arguments: { mailbox: primaryMailboxKey, ref: unclassifiedRef, classification: "not_mine" } },
    { name: "update_profile", arguments: { mailbox: primaryMailboxKey, operation: "set_country", country: "BE" } },
  ]) {
    const completedWrite = await request(requestId++, "tools/call", write);
    if (completedWrite.error || completedWrite.result?.isError === true) {
      throw new Error(`Read & write access could not run ${write.name}`);
    }
  }

  const updatedCompany = await request(requestId++, "tools/call", {
    name: "get_company",
    arguments: { key: primaryCompanyKey },
  });
  const updatedCompanyContent = updatedCompany.result?.structuredContent as {
    company?: { isReviewed?: boolean };
    accountAddress?: string;
  } | undefined;
  if (
    updatedCompanyContent?.company?.isReviewed !== true
    || updatedCompanyContent.accountAddress !== "a•••@e••.test"
  ) {
    throw new Error("Company writes did not update the shared App data");
  }

  const updatedWhitelist = await request(requestId++, "tools/call", {
    name: "list_whitelist",
    arguments: {},
  });
  const updatedWhitelistContent = updatedWhitelist.result?.structuredContent as {
    items?: Array<{ value?: string }>;
  } | undefined;
  if (!updatedWhitelistContent?.items?.some((item) => item.value === "write-enabled.test")) {
    throw new Error("Whitelist write did not update the shared App data");
  }

  const updatedCase = await request(requestId++, "tools/call", {
    name: "get_case",
    arguments: { id: caseId },
  });
  const updatedCaseContent = updatedCase.result?.structuredContent as {
    case?: { status?: string };
    messages?: Array<{ ref?: string; relation?: string }>;
  } | undefined;
  if (
    updatedCaseContent?.case?.status !== "active"
    || !updatedCaseContent.messages?.some((message) =>
      message.ref === mailboxRef(primaryMailboxKey, "mcp-other-reply")
      && message.relation === "linked"
    )
  ) {
    throw new Error("Case writes did not update the shared App data");
  }

  const suppressedData = await request(requestId++, "tools/call", {
    name: "search_personal_data",
    arguments: { state: "not_mine" },
  });
  const suppressedContent = suppressedData.result?.structuredContent as {
    total?: number;
  } | undefined;
  if (suppressedContent?.total !== 1) {
    throw new Error("Personal-data classification did not update the shared App data");
  }

  const updatedProfile = await request(requestId++, "tools/call", {
    name: "get_profile",
    arguments: {},
  });
  const updatedProfileContent = updatedProfile.result?.structuredContent as {
    country?: string;
  } | undefined;
  if (updatedProfileContent?.country !== "BE") {
    throw new Error("Profile write did not update the shared App data");
  }

  saveGlobalSetting("agentAccess", "off");

  const revoked = await request(requestId, "tools/call", {
    name: "search_companies",
    arguments: { view: "accounts" },
  });
  if (revoked.result?.isError !== true) {
    throw new Error("Overview tool ignored revoked access");
  }

  const revokedWrite = await request(requestId + 1, "tools/call", {
    name: "set_company_reviewed",
    arguments: {
      mailbox: primaryMailboxKey,
      key: primaryCompanyKey,
      reviewed: false,
    },
  });
  if (revokedWrite.result?.isError !== true) {
    throw new Error("Write tool ignored revoked access");
  }

  await actionConnection.close();
}

async function main(): Promise<void> {
  try {
    await proveDisabledAccess();
    await proveOverviewRead();
    console.info("MCP smoke OK: permissions, stdio, mailboxes, overview, search, detail, shutdown");
  } finally {
    for (const profile of profiles) rmSync(profile, { recursive: true, force: true });
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
