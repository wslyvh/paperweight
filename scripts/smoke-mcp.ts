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

const root = resolve(__dirname, "..");
const fixture = join(root, "test", "fixtures", "smoke-account");
const profiles: string[] = [];
const primaryMailbox = "smoke-test@paperweight.test";
const secondMailbox = "second@paperweight.test";

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
      "mcp-second.test",
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
  const finding = database.prepare(
    `INSERT INTO pii_findings (message_id, type, value_normalized)
     VALUES (?, ?, ?)`,
  ).run("mcp-smoke-message", "email", "smoke.person@example.test");
  if (Number(finding.lastInsertRowid) <= 0) throw new Error("Could not seed PII finding");

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
  database.close();
}

function commandFor(profile: string): Command {
  const packaged = process.argv.includes("--packaged");
  if (packaged) {
    return {
      executable: join(root, "dist", "linux-unpacked", "resources", "paperweight-mcp"),
      args: [],
      env: {
        ...process.env,
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
    args: [],
    env: {
      ...process.env,
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
  const command = commandFor(profile);
  const child = spawn(command.executable, command.args, {
    cwd: root,
    env: command.env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const responses = new Map<number, (response: JsonRpcResponse) => void>();
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });

  const lines = createInterface({ input: child.stdout });
  lines.on("line", (line) => {
    let response: JsonRpcResponse;
    try {
      response = JSON.parse(line) as JsonRpcResponse;
    } catch {
      child.kill();
      throw new Error(`Non-protocol stdout from MCP process: ${line}`);
    }
    if (response.id !== undefined) responses.get(response.id)?.(response);
  });

  function request(id: number, method: string, params: Record<string, unknown>) {
    return new Promise<JsonRpcResponse>((resolveResponse) => {
      responses.set(id, resolveResponse);
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
  }

  const initialize = await request(1, "initialize", {
    protocolVersion: "2026-07-28",
    capabilities: {},
    clientInfo: { name: "paperweight-smoke", version: "1.0.0" },
  });
  if (initialize.error) throw new Error("MCP initialize failed");
  child.stdin.write(`${JSON.stringify({
    jsonrpc: "2.0",
    method: "notifications/initialized",
  })}\n`);

  const list = await request(2, "tools/list", {});
  const tools = list.result?.tools;
  if (!Array.isArray(tools) || tools.length !== 12) {
    throw new Error("MCP did not expose exactly twelve tools");
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

  const mailboxes = await request(3, "tools/call", {
    name: "list_mailboxes",
    arguments: {},
  });
  if (mailboxes.error) throw new Error("Mailbox list tool call failed");
  const mailboxContent = mailboxes.result?.structuredContent as {
    selectedMailbox?: string;
    appActiveMailbox?: string;
    mailboxes?: Array<{
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
    (mailbox) => mailbox.email === primaryMailbox,
  );
  const secondEntry = mailboxContent?.mailboxes?.find(
    (mailbox) => mailbox.email === secondMailbox,
  );
  if (
    mailboxContent?.selectedMailbox !== primaryMailbox
    || mailboxContent.appActiveMailbox !== primaryMailbox
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
    || structured.mailbox !== primaryMailbox
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

  // Seed only after the real MCP startup path has migrated the fixture database.
  seedReadSurface(profile);

  const selected = await request(5, "tools/call", {
    name: "select_mailbox",
    arguments: { email: secondMailbox },
  });
  if (selected.error || selected.result?.isError === true) {
    throw new Error("Mailbox selection tool call failed");
  }
  const selectedContent = selected.result?.structuredContent as {
    selectedMailbox?: string;
    appActiveMailbox?: string;
    changed?: boolean;
  } | undefined;
  if (
    selectedContent?.selectedMailbox !== secondMailbox
    || selectedContent.appActiveMailbox !== primaryMailbox
    || selectedContent.changed !== true
  ) {
    throw new Error(`Mailbox selection changed the wrong state: ${JSON.stringify(selectedContent)}`);
  }

  const secondOverview = await request(6, "tools/call", {
    name: "get_overview",
    arguments: {},
  });
  const secondOverviewContent = secondOverview.result?.structuredContent as {
    mailbox?: string;
  } | undefined;
  if (secondOverviewContent?.mailbox !== secondMailbox) {
    throw new Error("Overview did not identify the selected MCP mailbox");
  }

  const secondSearch = await request(7, "tools/call", {
    name: "search_companies",
    arguments: { view: "accounts", search: "MCP Second" },
  });
  const secondSearchContent = secondSearch.result?.structuredContent as {
    mailbox?: string;
    total?: number;
    items?: Array<{ key?: string; name?: string }>;
  } | undefined;
  if (
    secondSearchContent?.mailbox !== secondMailbox
    || secondSearchContent.total !== 1
    || secondSearchContent.items?.[0]?.key !== "mcp-second.test"
  ) {
    throw new Error("Company search did not use the selected MCP mailbox");
  }

  const switchedMailboxes = await request(8, "tools/call", {
    name: "list_mailboxes",
    arguments: {},
  });
  const switchedContent = switchedMailboxes.result?.structuredContent as {
    selectedMailbox?: string;
    appActiveMailbox?: string;
  } | undefined;
  if (
    switchedContent?.selectedMailbox !== secondMailbox
    || switchedContent.appActiveMailbox !== primaryMailbox
  ) {
    throw new Error("MCP mailbox selection changed the app-active mailbox");
  }

  const selectedPrimary = await request(9, "tools/call", {
    name: "select_mailbox",
    arguments: { email: primaryMailbox },
  });
  if (selectedPrimary.error || selectedPrimary.result?.isError === true) {
    throw new Error("Could not return to the primary mailbox");
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
    searchContent?.mailbox !== primaryMailbox
    || searchContent.total !== 1
    || searchContent.items?.[0]?.key !== "mcp-smoke.test"
    || searchContent.items[0]?.name !== "MCP Smoke"
  ) {
    throw new Error("Company search did not return the fixture company");
  }

  const company = await request(11, "tools/call", {
    name: "get_company",
    arguments: { key: "mcp-smoke.test" },
  });
  if (company.error) throw new Error("Company detail tool call failed");
  if (company.result?.isError === true) {
    throw new Error(`Company detail returned an error: ${JSON.stringify(company.result.content)}`);
  }
  const companyContent = company.result?.structuredContent as {
    mailbox?: string;
    company?: { name?: string };
    availableUnsubscribeMethods?: string[];
    recentMessages?: Array<{ subject?: string; preview?: string }>;
    personalData?: { values?: unknown[] };
  } | undefined;
  if (
    companyContent?.mailbox !== primaryMailbox
    || companyContent.company?.name !== "MCP Smoke"
    || !companyContent.availableUnsubscribeMethods?.includes("one_click")
    || !companyContent.recentMessages?.some((message) =>
      message.subject === "MCP smoke subject" && message.preview === "MCP smoke preview"
    )
    || !Array.isArray(companyContent.personalData?.values)
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
    items?: Array<{ id?: number; companyName?: string }>;
  } | undefined;
  const caseId = casesContent?.items?.[0]?.id;
  if (
    casesContent?.mailbox !== primaryMailbox
    || casesContent.total !== 1
    || casesContent.items?.[0]?.companyName !== "MCP Smoke"
    || typeof caseId !== "number"
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
    messages?: Array<{ subject?: string; preview?: string; relation?: string }>;
  } | undefined;
  if (
    caseContent?.mailbox !== primaryMailbox
    || !caseContent.events?.some((event) => event.subject === "MCP access request")
    || !caseContent.messages?.some((message) =>
      message.subject === "Re: MCP access request"
      && message.preview === "MCP case reply preview"
      && message.relation === "thread"
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
    items?: Array<{ ref?: number; maskedValue?: string; confidence?: string }>;
  } | undefined;
  const piiRef = personalDataContent?.items?.[0]?.ref;
  if (
    personalDataContent?.mailbox !== primaryMailbox
    || personalDataContent.total !== 1
    || typeof piiRef !== "number"
    || personalDataContent.items?.[0]?.maskedValue !== "s•••@•••.test"
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
    piiCompaniesContent?.companies?.[0]?.key !== "mcp-smoke.test"
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
    names?: string[];
    emails?: string[];
  } | undefined;
  if (
    profileContent?.scope !== "global"
    || profileContent.country !== "NL"
    || profileContent.names?.[0] !== "S••• P•••"
    || profileContent.emails?.[0] !== "s•••@•••.test"
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
    activityContent?.mailbox !== primaryMailbox
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
    whitelistContent?.mailbox !== primaryMailbox
    || !whitelistContent.items?.some((item) =>
      item.value === "keep.mcp-smoke.test" && item.kind === "domain"
    )
  ) {
    throw new Error("Whitelist did not return the selected mailbox entries");
  }

  saveGlobalSetting("agentAccess", "off");

  const revoked = await request(19, "tools/call", {
    name: "search_companies",
    arguments: { view: "accounts" },
  });
  if (revoked.result?.isError !== true) {
    throw new Error("Overview tool ignored revoked access");
  }

  child.stdin.end();
  const exitCode = await waitForExit(child);
  if (exitCode !== 0) throw new Error(`MCP process exited with ${exitCode}: ${stderr}`);
  if (stderr !== "") throw new Error(`MCP process wrote diagnostics during success: ${stderr}`);
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

void main();
