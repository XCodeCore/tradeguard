import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createBinanceMcpGateway, type BinanceMcpToolName } from "../binance-mcp";
import { BINANCE_MCP_URL } from "./config";

export async function withBinanceGateway<T>(accessToken: string, operation: (gateway: ReturnType<typeof createBinanceMcpGateway>) => Promise<T>): Promise<T> {
  const client = new Client({ name: "tradeguard", version: "0.1.0" }, { versionNegotiation: { mode: "auto" } });
  const transport = new StreamableHTTPClientTransport(new URL(BINANCE_MCP_URL), {
    authProvider: { token: async () => accessToken },
    onInsufficientScope: "throw",
  });
  try {
    await client.connect(transport);
    const gateway = createBinanceMcpGateway(async (name: BinanceMcpToolName, arguments_) => client.callTool({ name, arguments: arguments_ }));
    return await operation(gateway);
  } finally {
    await client.close().catch(() => undefined);
  }
}
