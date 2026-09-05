import { readFile } from "node:fs/promises";
import { createLogger, createServer } from "vite";
const inputPath = process.argv[2];
if (!inputPath) throw new Error("Usage: node scripts/run-tradeguard-assessment.mjs /tmp/tradeguard-market.json");
const logger = createLogger("error");
const logError = logger.error;
logger.error = (message, options) => {
  if (!message.includes("WebSocket server error")) logError(message, options);
};
const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", customLogger: logger });
try {
  const { assessCapturedMarket } = await server.ssrLoadModule("/scripts/captured-assessment.ts");
  const input = JSON.parse(await readFile(inputPath, "utf8"));
  process.stdout.write(`${JSON.stringify(await assessCapturedMarket(input), null, 2)}\n`);
} finally { await server.close(); }
