interface MockWorkerInstance {
  workerData: Record<string, unknown>;
  terminate: jest.Mock<Promise<number>, []>;
  emit(event: string, ...args: unknown[]): boolean;
}

interface MockAccount {
  email: string;
  providerType: string;
}

const mockWorkerInstances: MockWorkerInstance[] = [];
const mockSend = jest.fn();
const mockInvalidateAllAnalysisPasses = jest.fn();
const mockInvalidateAnalysisPassAtPath = jest.fn();
const mockNeedsAnalysisPass = jest.fn();
const mockLoadCredentials = jest.fn(() => ({ providerType: "gmail" }));
let mockAccounts: MockAccount[] = [
  { email: "person@example.com", providerType: "gmail" },
];
let mockActiveEmail = "person@example.com";
const mockPendingPaths = new Set<string>();

function dbPath(email: string): string {
  return `/tmp/paperweight-sync-manager-test/${email.split("@")[0]}.db`;
}

jest.mock("node:worker_threads", () => {
  const { EventEmitter } = jest.requireActual("events") as typeof import("events");
  return {
    Worker: class extends EventEmitter {
      workerData: Record<string, unknown>;
      terminate = jest.fn(async () => 1);

      constructor(_path: string, options: { workerData: Record<string, unknown> }) {
        super();
        this.workerData = options.workerData;
        mockWorkerInstances.push(this);
      }
    },
  };
});

jest.mock("fs", () => ({
  ...jest.requireActual("fs"),
  existsSync: jest.fn(() => true),
}));

jest.mock("electron", () => ({
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

jest.mock("@electron-toolkit/utils", () => ({
  is: { dev: true },
}));

jest.mock("./credentials", () => ({
  accountTag: () => "account",
  emailToFileKey: (email: string) => email.split("@")[0],
  getActiveEmail: () => mockActiveEmail,
  listAccounts: () => mockAccounts,
  loadCredentials: mockLoadCredentials,
}));

jest.mock("./services/analysis", () => ({
  invalidateAllAnalysisPasses: mockInvalidateAllAnalysisPasses,
  invalidateAnalysisPassAtPath: mockInvalidateAnalysisPassAtPath,
  needsAnalysisPass: mockNeedsAnalysisPass,
}));

jest.mock("./services/settings", () => ({
  getLicenseStatus: () => ({ active: true }),
}));

jest.mock("./utils/log", () => {
  const logger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    verbose: jest.fn(),
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
    jest.clearAllMocks();
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

  afterEach(async () => {
    await stopAllSyncs();
  });

  it("marks every account stale without starting analysis", () => {
    markProfileAnalysisStale();

    expect(mockInvalidateAllAnalysisPasses).toHaveBeenCalledTimes(1);
    expect(mockWorkerInstances).toHaveLength(0);
    expect(getSyncStatus().analysisPending).toBe(true);
  });

  it("runs analysis only after Refresh sync finishes", () => {
    mockPendingPaths.add(dbPath("person@example.com"));
    startAllSyncs();

    expect(mockWorkerInstances).toHaveLength(1);
    expect(mockWorkerInstances[0].workerData.mode).toBe("sync");

    finishSync(mockWorkerInstances[0]);

    expect(mockWorkerInstances).toHaveLength(2);
    expect(mockWorkerInstances[1].workerData).toMatchObject({
      mode: "profile-analysis",
      credentials: null,
      licensed: false,
    });
    expect(getSyncStatus().message).toBe("Analyzing messages");

    mockPendingPaths.delete(dbPath("person@example.com"));
    finishAnalysis(mockWorkerInstances[1]);

    expect(getSyncStatus().analysisPending).toBe(false);
    expect(getSyncStatus().message).toBe("Sync complete");
  });

  it("analyzes one account at a time with the active account first", () => {
    mockAccounts = [
      { email: "person@example.com", providerType: "gmail" },
      { email: "other@example.com", providerType: "imap" },
    ];
    mockPendingPaths.add(dbPath("person@example.com"));
    mockPendingPaths.add(dbPath("other@example.com"));

    startAllSyncs();

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

  it("leaves a sync using an old profile stale until the next Refresh", () => {
    startAllSyncs();
    const oldProfileSync = mockWorkerInstances[0];

    markProfileAnalysisStale();
    finishSync(oldProfileSync);

    expect(mockInvalidateAnalysisPassAtPath).toHaveBeenCalledWith(
      dbPath("person@example.com"),
    );
    expect(mockWorkerInstances).toHaveLength(1);
    expect(getSyncStatus().analysisPending).toBe(true);

    startAllSyncs();
    finishSync(mockWorkerInstances[1]);

    expect(mockWorkerInstances).toHaveLength(3);
    expect(mockWorkerInstances[2].workerData.mode).toBe("profile-analysis");
  });

  it("stops superseded analysis and does not restart it automatically", () => {
    mockPendingPaths.add(dbPath("person@example.com"));
    startAllSyncs();
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
