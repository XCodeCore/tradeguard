import { Redis } from "@upstash/redis";
import { requireServerEnv } from "./config";

let redis: Redis | undefined;

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis({
      url: requireServerEnv("UPSTASH_REDIS_REST_KV_REST_API_URL"),
      token: requireServerEnv("UPSTASH_REDIS_REST_KV_REST_API_TOKEN"),
    });
  }
  return redis;
}
