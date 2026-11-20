import { requirePro } from "./settings";
import { getProvider } from "../providers/ProviderFactory";
import { actionLog } from "../utils/log";

export interface SendEmailResult {
  success: boolean;
  error?: string;
  messageId?: string;
}

export async function sendEmail(
  to: string,
  subject: string,
  body: string,
  inReplyTo?: string,
): Promise<SendEmailResult> {
  await requirePro();
  const recipientDomain = to.split("@")[1] || "unknown";
  try {
    const provider = await getProvider();
    actionLog.info(`Sending email via ${provider.type} to <${recipientDomain}>`);
    const messageId = await provider.sendEmail(to, subject, body, inReplyTo);
    return { success: true, messageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const details = error instanceof Error ? error.stack || message : message;
    // SMTP rejection replies can echo the recipient supplied to sendEmail.
    actionLog.error(`Send email via <${recipientDomain}> failed: ${details.split(to).join("[recipient]")}`);
    return { success: false, error: message };
  }
}
