export interface EmailMessage {
  id: string;
  date: number;
  subject: string;
  snippet: string;
  /** First 150 chars for preview/classification */
  bodyPreview: string;
  senderEmail: string;
  senderName: string;
  unsubscribeUrl?: string;
  unsubscribeMethod?: "rfc8058" | "list-unsubscribe" | "footer" | "none";
  headersJson: string;
  sizeBytes?: number;
}

export interface EmailConnection {
  type: "gmail-oauth" | "imap" | "microsoft-oauth";
  email: string;
}

export interface EmailProvider {
  type: string;

  // Connection
  connect(): Promise<EmailConnection>;
  disconnect(): Promise<void>;
  isAuthenticated(): boolean;

  // Read operations
  getMessageCount(since: Date, until?: Date): Promise<number | undefined>;
  listMessages(
    since: Date,
    until?: Date,
    pageToken?: string,
    onProgress?: (fetched: number, estimatedTotal?: number) => void,
    headersOnly?: boolean
  ): Promise<{ messages: EmailMessage[]; nextPageToken?: string }>;
  getMessage(messageId: string): Promise<EmailMessage>;

  // Checkpoint-based incremental sync (optional — Gmail History API, future IMAP UID/CONDSTORE)
  // Returns null from listChanges when the checkpoint is expired → caller falls back to date-based.
  getCurrentSyncCheckpoint?(): Promise<string | undefined>;
  listChanges?(checkpoint: string): Promise<{
    addedIds: string[];
    deletedIds: string[];
    nextCheckpoint: string;
  } | null>;

  // Write operations
  trashMessage(messageId: string): Promise<void>;
  markAsSpam(messageId: string): Promise<void>;
  markAsRead(messageId: string, isRead: boolean): Promise<void>;
}
