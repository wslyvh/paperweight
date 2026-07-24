import type { Analysis } from "@paperweight/analysis";

export interface EmailMessage {
  id: string;
  date: number;
  subject: string;
  /** Provider-supplied teaser. Only used as the preview fallback for a message
   *  whose body text came out empty. */
  snippet: string;
  senderEmail: string;
  senderName: string;
  headersJson: string;
  sizeBytes?: number;
  /**
   * The engine's verdict for this message: type, unsubscribe target/method,
   * findings, and `text` — the body those were derived from, which is what
   * gets stored (finding offsets index into it). One analyzeMessage call per
   * message, made where the message is parsed, so the raw HTML never outlives
   * a single message.
   */
  analysis: Analysis;
  /**
   * True when analyzed text hit Paperweight's storage cap, or the fetched body
   * may be incomplete (IMAP conservatively marks a capped raw source).
   * Persisted as body_state 'truncated' as provenance. The message still counts
   * as scanned, and finding offsets remain valid within the stored text.
   */
  bodyTruncated?: boolean;
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
    onProgress?: (fetched: number, estimatedTotal?: number) => void
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
