import SMTPConnection from "nodemailer/lib/smtp-connection";
import { friendlyConnectionError } from "../services/sync";
import { syncLog } from "../utils/log";

export async function testSmtpConnection(config: {
  host: string;
  port: number;
  tls: boolean;
  username: string;
  password: string;
  allowSelfSigned?: boolean;
}): Promise<{ success: boolean; error?: string }> {
  syncLog.info(`Testing SMTP connection to ${config.host}:${config.port} (tls=${config.tls})`);

  const conn = new SMTPConnection({
    host: config.host,
    port: config.port,
    secure: config.tls,
    tls: config.allowSelfSigned ? { rejectUnauthorized: false } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    logger: false,
  });

  const safeQuit = (): void => {
    try {
      conn.quit();
    } catch {
      // ignore
    }
  };

  try {
    await new Promise<void>((resolve, reject) => {
      const onError = (err: Error): void => reject(err);
      conn.once("error", onError);
      conn.connect(() => {
        conn.removeListener("error", onError);
        resolve();
      });
    });

    if (!conn.allowsAuth) {
      safeQuit();
      syncLog.error(`SMTP server at ${config.host}:${config.port} does not advertise AUTH — likely not a real SMTP server or wrong port`);
      return {
        success: false,
        error: "SMTP server did not offer authentication. Check the host and port — this may not be a real SMTP server.",
      };
    }

    await new Promise<void>((resolve, reject) => {
      conn.login(
        { user: config.username, pass: config.password },
        (err: Error | null) => {
          if (err) reject(err);
          else resolve();
        },
      );
    });

    safeQuit();
    syncLog.info("SMTP connection test succeeded");
    return { success: true };
  } catch (err) {
    safeQuit();
    const raw = err instanceof Error ? err.message : String(err);
    const response = (err as { response?: string })?.response;
    syncLog.error("SMTP connection error:", raw, response ? `— ${response}` : "");
    return {
      success: false,
      error: friendlyConnectionError(err),
    };
  }
}
