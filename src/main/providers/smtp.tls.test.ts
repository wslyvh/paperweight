import { createServer } from "node:net";
import type { AddressInfo } from "node:net";
import { expect, it, vi } from "vitest";

vi.mock("../utils/log", () => ({ syncLog: { info: vi.fn(), error: vi.fn() } }));
import { testSmtpConnection } from "./smtp";

it("never authenticates when the server refuses STARTTLS", async () => {
  const commands: string[] = [];
  const server = createServer((socket) => {
    socket.write("220 synthetic.example ESMTP\r\n");
    let pending = "";
    socket.on("data", (chunk) => {
      pending += chunk.toString();
      let end: number;
      while ((end = pending.indexOf("\r\n")) !== -1) {
        const command = pending.slice(0, end).split(" ")[0].toUpperCase();
        pending = pending.slice(end + 2);
        commands.push(command);
        if (command === "EHLO") socket.write("250-synthetic.example\r\n250 AUTH PLAIN LOGIN\r\n");
        else if (command === "STARTTLS") socket.write("502 TLS unavailable\r\n");
        else if (command === "AUTH") socket.write("235 Authentication accepted\r\n");
        else if (command === "QUIT") socket.end("221 Bye\r\n");
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const result = await testSmtpConnection({
      host: "127.0.0.1", port: (server.address() as AddressInfo).port,
      tls: false, username: "synthetic", password: "synthetic",
    });
    expect(result.success).toBe(false);
    expect(commands).toContain("STARTTLS");
    expect(commands).not.toContain("AUTH");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
