import { CLIENT_METADATA_URL, OAUTH_CALLBACK_URL, TRADEGUARD_ORIGIN } from "./config";

export const BINANCE_OAUTH_CLIENT_METADATA = {
  client_id: CLIENT_METADATA_URL,
  client_name: "TradeGuard",
  client_uri: TRADEGUARD_ORIGIN,
  redirect_uris: [OAUTH_CALLBACK_URL],
  grant_types: ["authorization_code"],
  response_types: ["code"],
  token_endpoint_auth_method: "none",
} as const;
