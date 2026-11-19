import type { Mock } from "vitest";
import { vi } from "vitest";
import { join } from "node:path";
interface MockWorkerInstance {
  workerData: Record<string, unknown>;
  postMessage: Mock;
  terminate: Mock<() => Promise<number>>;
  emit(event: string, ...args: unknown[]): boolean;
}

interface MockAccount {
  email: string;
  providerType: string;
}

const mockWorkerInstances: MockWorkerInstance[] = vi.hoisted(() => ([]));
const mockSend = vi.hoisted(() => (vi.fn()));
const mockInvalidateAllAnalysisPasses = vi.hoisted(() => (vi.fn()));
const mockInvalidateAnalysisPassAtPath = vi.hoisted(() => (vi.fn()));
const mockNeedsAnalysisPass = vi.hoisted(() => (vi.fn()));
const mockLoadCredentials = vi.hoisted(() => (vi.fn<() => Promise<{ providerType: "gmail" }>>(async () => ({ providerType: "gmail" }))));
const mockSaveCredentials = vi.hoisted(() => (vi.fn(async () => {})));
let mockAccounts: MockAccount[] = vi.hoisted(() => ([
  { email: "person@example.com", providerType: "gmail" },
]));
let mockActiveEmail = vi.hoisted(() => ("person@example.com"));
const mockPendingPaths = vi.hoisted(() => (new Set<string>()));

function dbPath(email: string): string {
  return join("/tmp/paperweight-sync-manager-test", `${email.split("@")[0]}.db`);
}

vi.mock("node:worker_threads", async () => {
  const { EventEmitter } = await vi.importActual("events") as typeof import("events");
  return {
    Worker: class extends EventEmitter {
      workerData: Record<string, unknown>;
      postMessage = vi.fn();
      terminate = vi.fn(async () => 1);

      constructor(_path: string, options: { workerData: Record<string, unknown> }) {
        super();
        this.workerData = options.workerData;
        mockWorkerInstances.push(this);
      }
    },
  };
});

vi.mock("fs", async () => ({
  ...await vi.importActual("fs"),
  existsSync: vi.fn(() => true),
}));

vi.mock("electron", () => ({
  app: {
    getPath: () => "/tmp/paperweight-sync-manager-test",
    getAppPath: () => "/tmp/paperweight-sync-manager-test",
  },
  BrowserWindow: {
    getAllWindows: () => [{
      webContents: { send: mockSend },
    }],
  },
}));

vi.mock("@electron-toolkit/utils", () => ({
  is: { dev: true },
}));

vi.mock("./credentials", () => ({
  accountTag: () => "account",
  emailToFileKey: (email: string) => email.split("@")[0],
  getActiveEmail: () => mockActiveEmail,
  listAccounts: () => mockAccounts,
  loadCredentials: mockLoadCredentials,
  saveCredentials: mockSaveCredentials,
}));

vi.mock("./services/analysis", () => ({
  invalidateAllAnalysisPasses: mockInvalidateAllAnalysisPasses,
  invalidateAnalysisPassAtPath: mockInvalidateAnalysisPassAtPath,
  needsAnalysisPass: mockNeedsAnalysisPass,
}));

vi.mock("./utils/log", () => {
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    verbose: vi.fn(),
  };
  return {
    __esModule: true,
    default: { scope: () => logger },
    syncLog: logger,
  };
});

import {
  getSyncStatus,
  markProfileAnalysisStale,
  startAllSyncs,
  stopAllSyncs,
} from "./sync-manager";

function finishSync(worker: MockWorkerInstance): void {
  worker.emit("message", {
    type: "progress",
    status: {
      running: false,
      progress: 0,
      total: 0,
      message: "Sync complete",
      lastSyncAt: 123,
    },
  });
  worker.emit("message", { type: "done" });
  worker.emit("exit", 0);
}

function finishAnalysis(worker: MockWorkerInstance): void {
  worker.emit("message", { type: "done" });
  worker.emit("exit", 0);
}

describe("Refresh analysis scheduling", () => {
  beforeEach(async () => {
    await stopAllSyncs();
    vi.clearAllMocks();
    mockWorkerInstances.length = 0;
    mockPendingPaths.clear();
    mockAccounts = [
      { email: "person@example.com", providerType: "gmail" },
    ];
    mockActiveEmail = "person@example.com";
    mockNeedsAnalysisPass.mockImplementation((path: string) => (
      mockPendingPaths.has(path)
    ));
    mockInvalidateAnalysisPassAtPath.mockImplementation((path: string) => {
      mockPendingPaths.add(path);
      return true;
    });
    mockInvalidateAllAnalysisPasses.mockImplementation(() => {
      for (const account of mockAccounts) {
        mockPendingPaths.add(dbPath(account.email));
      }
      return 0;
    });
  });

  it("does not start a worker after cancellation during credential decryption", async () => {
    let finish!: (value: { providerType: "gmail" }) => void;
    mockLoadCredentials.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const pending = startAllSyncs();
    await stopAllSyncs();
    finish({ providerType: "gmail" });
    await pending;
    expect(mockWorkerInstances).toHaveLength(0);
  });

  it("acknowledges refreshed tokens only after encrypted persistence for that worker's mailbox", async () => {
    let finish!: () => void;
    mockSaveCredentials.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await startAllSyncs();
    const worker = mockWorkerInstances[0];
    mockActiveEmail = "different@example.com";
    const credentials = { providerType: "gmail", gmail: { accessToken: "synthetic", refreshToken: "synthetic", expiresAt: 1 } };
    worker.emit("message", { type: "credentials", requestId: 1, credentials });
    expect(mockSaveCredentials).toHaveBeenCalledWith(credentials, "person@example.com");
    expect(worker.postMessage).not.toHaveBeenCalled();
    finish();
    await Promise.resolve();
    expect(worker.postMessage).toHaveBeenCalledWith({ type: "credentials-saved", requestId: 1 });
  });

  it("finishes an in-flight credential write before account cleanup can proceed", async () => {
    const write = Promise.withResolvers<void>();
    mockSaveCredentials.mockReturnValueOnce(write.promise);
    await startAllSyncs();
    mockWorkerInstances[0].emit("message", { type: "credentials", requestId: 1, credentials: { providerType: "gmail" } });
    let stopped = false;
    const stopping = stopAllSyncs().then(() => { stopped = true; });
    await Promise.resolve();
    expect(stopped).toBe(false);
    write.resolve();
    await stopping;
    expect(stopped).toBe(true);
  });

  it("syncs every saved mailbox without a license", async () => {
    mockAccounts.push({ email: "second@example.com", providerType: "gmail" });
    await startAllSyncs();
    expect(mockWorkerInstances).toHaveLength(2);
    expect(mockWorkerInstances.map((worker) => worker.workerData.dbPath)).toEqual([
      dbPath("person@example.com"),
      dbPath("second@example.com"),
    ]);
  });

  afterEach(async () => {
    await stopAllSyncs();
  });

  it("marks every account stale without starting analysis", () => {
    markProfileAnalysisStale();

    expect(mockInvalidateAllAnalysisPasses).toHaveBeenCalledTimes(1);
    expect(mockWorkerInstances).toHaveLength(0);
    expect(getSyncStatus().analysisPending).toBe(true);
  });

  it("runs analysis only after Refresh sync finishes", async () => {
    mockPendingPaths.add(dbPath("person@example.com"));
    await startAllSyncs();

    expect(mockWorkerInstances).toHaveLength(1);
    expect(mockWorkerInstances[0].workerData.mode).toBe("sync");

    finishSync(mockWorkerInstances[0]);

    expect(mockWorkerInstances).toHaveLength(2);
    expect(mockWorkerInstances[1].workerData).toMatchObject({
      mode: "profile-analysis",
      credentials: null,
    });
    expect(getSyncStatus().message).toBe("Analyzing messages");

    mockPendingPaths.delete(dbPath("person@example.com"));
    finishAnalysis(mockWorkerInstances[1]);

    expect(getSyncStatus().analysisPending).toBe(false);
    expect(getSyncStatus().message).toBe("Sync complete");
  });

  it("analyzes one account at a time with the active account first", async () => {
    mockAccounts = [
      { email: "person@example.com", providerType: "gmail" },
      { email: "other@example.com", providerType: "imap" },
    ];
    mockPendingPaths.add(dbPath("person@example.com"));
    mockPendingPaths.add(dbPath("other@example.com"));

    await startAllSyncs();

    const personSync = mockWorkerInstances[0];
    const otherSync = mockWorkerInstances[1];
    expect(personSync.workerData.dbPath).toBe(dbPath("person@example.com"));
    expect(otherSync.workerData.dbPath).toBe(dbPath("other@example.com"));

    finishSync(otherSync);
    expect(mockWorkerInstances).toHaveLength(2);

    finishSync(personSync);
    expect(mockWorkerInstances).toHaveLength(3);
    expect(mockWorkerInstances[2].workerData).toMatchObject({
      dbPath: dbPath("person@example.com"),
      mode: "profile-analysis",
    });

    mockPendingPaths.delete(dbPath("person@example.com"));
    finishAnalysis(mockWorkerInstances[2]);

    expect(mockWorkerInstances).toHaveLength(4);
    expect(mockWorkerInstances[3].workerData).toMatchObject({
      dbPath: dbPath("other@example.com"),
      mode: "profile-analysis",
    });
  });

  it("leaves a sync using an old profile stale until the next Refresh", async () => {
    await startAllSyncs();
    const oldProfileSync = mockWorkerInstances[0];

    markProfileAnalysisStale();
    finishSync(oldProfileSync);

    expect(mockInvalidateAnalysisPassAtPath).toHaveBeenCalledWith(
      dbPath("person@example.com"),
    );
    expect(mockWorkerInstances).toHaveLength(1);
    expect(getSyncStatus().analysisPending).toBe(true);

    await startAllSyncs();
    finishSync(mockWorkerInstances[1]);

    expect(mockWorkerInstances).toHaveLength(3);
    expect(mockWorkerInstances[2].workerData.mode).toBe("profile-analysis");
  });

  it("stops superseded analysis and does not restart it automatically", async () => {
    mockPendingPaths.add(dbPath("person@example.com"));
    await startAllSyncs();
    finishSync(mockWorkerInstances[0]);
    const analysis = mockWorkerInstances[1];
    analysis.terminate.mockImplementationOnce(async () => {
      analysis.emit("exit", 1);
      return 1;
    });

    markProfileAnalysisStale();

    expect(analysis.terminate).toHaveBeenCalledTimes(1);
    expect(mockInvalidateAnalysisPassAtPath).toHaveBeenCalledWith(
      dbPath("person@example.com"),
    );
    expect(mockWorkerInstances).toHaveLength(2);
    expect(getSyncStatus().analysisPending).toBe(true);
  });
});
