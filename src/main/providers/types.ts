export interface EmailMessage {
  id: string;
  date: number;
  subject: string;
  snippet: string;
  /** First 150 chars for preview/classification */
  bodyPreview: string;
  senderEmail: string;
  senderName: string;
  /** Raw To/Cc header value(s), comma-separated. Used to flag which connected
   * address actually received the message (a mailbox can have multiple). */
  to?: string;
  cc?: string;
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

  // Removal tracking (optional). Adds always come from date-range listMessages();
  // this is a removal-only delta layer (Gmail History API, Microsoft inbox delta).
  // listRemovals returns null when the cursor has expired → caller re-baselines via
  // getRemovalCursor() and skips that gap's removals.
  getRemovalCursor?(): Promise<string | undefined>;
  listRemovals?(cursor: string): Promise<{
    removedIds: string[];
    nextCursor: string;
  } | null>;

  // Write operations
  trashMessage(messageId: string): Promise<void>;
  markAsSpam(messageId: string): Promise<void>;
  markAsRead(messageId: string, isRead: boolean): Promise<void>;

  // Send a plain-text email from the connected account. Resolves with the
  // sent mail's RFC Message-ID when the provider can determine it (used to
  // thread-match replies to GDPR cases), else undefined. When inReplyTo is
  // given (the Message-ID of an earlier sent mail), the new mail is threaded
  // to it via In-Reply-To/References headers where the provider supports it.
  sendEmail(to: string, subject: string, body: string, inReplyTo?: string): Promise<string | undefined>;
}
