import type { Candle, OrderBookLevel } from "../risk-engine";

export class McpResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpResponseError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function unwrapMcpResponse(response: unknown): unknown {
  if (!isRecord(response)) return response;
  if (response.isError === true) throw new McpResponseError("Binance MCP tool returned an error.");
  if (response.structuredContent !== undefined) return response.structuredContent;
  if (Array.isArray(response.content)) {
    const text = response.content.find((item) => isRecord(item) && item.type === "text" && typeof item.text === "string");
    if (isRecord(text) && typeof text.text === "string") {
      try { return JSON.parse(text.text); } catch { throw new McpResponseError("Binance MCP text content was not valid JSON."); }
    }
  }
  return response;
}

function finitePositive(value: unknown, field: string): number {
  const parsed = typeof value === "string" || typeof value === "number" ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) throw new McpResponseError(`${field} must be a positive number.`);
  return parsed;
}

function finiteNonNegative(value: unknown, field: string): number {
  const parsed = typeof value === "string" || typeof value === "number" ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 0) throw new McpResponseError(`${field} must be a non-negative number.`);
  return parsed;
}

export function parseTicker(response: unknown, expectedSymbol: string): { symbol: string; price: number } {
  const value = unwrapMcpResponse(response);
  if (!isRecord(value) || value.symbol !== expectedSymbol) throw new McpResponseError("Ticker symbol is missing or mismatched.");
  return { symbol: expectedSymbol, price: finitePositive(value.price, "ticker.price") };
}

function parseLevels(value: unknown, name: string): OrderBookLevel[] {
  if (!Array.isArray(value) || value.length === 0) throw new McpResponseError(`${name} must be a non-empty array.`);
  return value.map((level, index) => {
    if (!Array.isArray(level) || level.length < 2) throw new McpResponseError(`${name}[${index}] is malformed.`);
    return { price: finitePositive(level[0], `${name}[${index}].price`), baseQuantity: finitePositive(level[1], `${name}[${index}].quantity`) };
  });
}

export function parseDepth(response: unknown): { lastUpdateId?: number; bids: OrderBookLevel[]; asks: OrderBookLevel[] } {
  const value = unwrapMcpResponse(response);
  if (!isRecord(value)) throw new McpResponseError("Order book response must be an object.");
  const lastUpdateId = value.lastUpdateId === undefined ? undefined : finiteNonNegative(value.lastUpdateId, "lastUpdateId");
  return { lastUpdateId, bids: parseLevels(value.bids, "bids"), asks: parseLevels(value.asks, "asks") };
}

export function parseKlines(response: unknown, expectedCount = 60): Candle[] {
  const value = unwrapMcpResponse(response);
  if (!Array.isArray(value) || value.length !== expectedCount) throw new McpResponseError(`Expected exactly ${expectedCount} klines.`);
  return value.map((row, index) => {
    if (!Array.isArray(row) || row.length < 11) throw new McpResponseError(`kline[${index}] is malformed.`);
    const openTime = finiteNonNegative(row[0], `kline[${index}].openTime`);
    const closeTime = finiteNonNegative(row[6], `kline[${index}].closeTime`);
    if (closeTime <= openTime) throw new McpResponseError(`kline[${index}] time range is invalid.`);
    return {
      openTime,
      open: finitePositive(row[1], `kline[${index}].open`),
      high: finitePositive(row[2], `kline[${index}].high`),
      low: finitePositive(row[3], `kline[${index}].low`),
      close: finitePositive(row[4], `kline[${index}].close`),
      baseVolume: finiteNonNegative(row[5], `kline[${index}].baseVolume`),
      closeTime,
      quoteVolume: finiteNonNegative(row[7], `kline[${index}].quoteVolume`),
      tradeCount: finiteNonNegative(row[8], `kline[${index}].tradeCount`),
      takerBuyBaseVolume: finiteNonNegative(row[9], `kline[${index}].takerBuyBaseVolume`),
      takerBuyQuoteVolume: finiteNonNegative(row[10], `kline[${index}].takerBuyQuoteVolume`),
    };
  });
}

export function parseCompletedKlines(response: unknown, completedThrough: number, expectedCount = 60): Candle[] {
  const value = unwrapMcpResponse(response);
  if (!Array.isArray(value)) throw new McpResponseError("Kline response must be an array.");
  const completed = value.filter((row) => Array.isArray(row) && Number(row[6]) <= completedThrough).slice(-expectedCount);
  return parseKlines(completed, expectedCount);
}

export function parseSymbolValidation(response: unknown, expectedSymbol: string): boolean {
  const value = unwrapMcpResponse(response);
  if (!isRecord(value) || !Array.isArray(value.symbols)) throw new McpResponseError("Exchange-info response is malformed.");
  return value.symbols.some((entry) => isRecord(entry) && entry.symbol === expectedSymbol && entry.status === "TRADING");
}
