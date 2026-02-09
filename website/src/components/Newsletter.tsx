"use client";

import { useState } from "react";
import { Alert } from "@/components/Alert";
import { isValidEmail } from "@/utils/validation";

export function Newsletter() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "">("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setMessage("");
    setMessageType("");

    if (!isValidEmail(email)) {
      setMessageType("error");
      setMessage("Please enter a valid email address");
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/newsletter", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessageType("error");
        setMessage(data.message || "Failed to subscribe. Please try again.");
      } else {
        setMessageType("success");
        setMessage(data.message || "Successfully subscribed!");
        setEmail("");
      }
    } catch (_error) {
      setMessageType("error");
      setMessage("An error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      {message && (
        <Alert
          tone={messageType === "success" ? "success" : "error"}
          message={message}
        />
      )}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="email"
          placeholder="your@email.com"
          className="input input-bordered flex-1"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={isLoading}
        />
        <button type="submit" className="btn btn-primary" disabled={isLoading}>
          {isLoading ? (
            <>
              <span className="loading loading-spinner"></span>
              Subscribing...
            </>
          ) : (
            "Subscribe"
          )}
        </button>
      </form>
    </>
  );
}
