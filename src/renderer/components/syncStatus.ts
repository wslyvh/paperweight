export function isOAuthTokenError(error?: string): boolean {
  return !!(
    error &&
    (error.includes("Gmail authorization expired") ||
      error.includes("Failed to refresh access token") ||
      error.includes("Authorization expired. Reconnect your account"))
  );
}
