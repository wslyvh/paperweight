interface ReconnectResult {
  success: boolean;
  error?: string;
}

export function reconnectError(result: ReconnectResult): string | undefined {
  return result.success ? undefined : result.error || "Reconnect failed";
}
