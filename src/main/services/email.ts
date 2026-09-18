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
  const recipientDomain = to.split("@")[1] || "unknown";
  try {
    const provider = getProvider();
    actionLog.info(`Sending email via ${provider.type} to <${recipientDomain}>`);
    const messageId = await provider.sendEmail(to, subject, body, inReplyTo);
    return { success: true, messageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    actionLog.error(`Send email via <${recipientDomain}> failed: ${message}`);
    return { success: false, error: message };
  }
}
