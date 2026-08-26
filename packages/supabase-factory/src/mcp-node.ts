import { createServer, type Server } from "node:http";
import { toNodeHandler } from "@modelcontextprotocol/node";
import type { FactoryMcpHttpHandler } from "./mcp.ts";

/**
 * Runs the Factory MCP endpoint only on loopback. Production exposure belongs
 * behind the already-managed Caddy HTTPS edge; the MCP process itself never
 * opens a public interface.
 */
export async function startFactoryMcpNodeServer(options: {
  handler: FactoryMcpHttpHandler;
  port: number;
  hostname?: "127.0.0.1" | "::1";
}): Promise<Server> {
  if (!Number.isInteger(options.port) || options.port < 1024 || options.port > 65535) {
    throw new Error("Factory MCP port must be an unprivileged TCP port between 1024 and 65535");
  }
  const hostname = options.hostname ?? "127.0.0.1";
  const nodeHandler = toNodeHandler(options.handler);
  const server = createServer((req, res) => { void nodeHandler(req, res); });
  server.on("close", () => { void options.handler.close(); });
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => { server.off("listening", onListening); reject(error); };
    const onListening = () => { server.off("error", onError); resolve(); };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(options.port, hostname);
  });
  return server;
}
