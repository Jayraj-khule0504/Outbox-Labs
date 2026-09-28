import { config } from "./config.js";
import { redis } from "./queue.js";

const script = `
local globalLimit = tonumber(ARGV[1]); local senderLimit = tonumber(ARGV[2]); local ttl = tonumber(ARGV[3]);
if tonumber(redis.call('GET', KEYS[1]) or '0') >= globalLimit then return 0 end
if tonumber(redis.call('GET', KEYS[2]) or '0') >= senderLimit then return 0 end
for i, key in ipairs(KEYS) do local count = redis.call('INCR', key); if count == 1 then redis.call('PEXPIRE', key, ttl) end end
return 1`;

export async function reserveDeliverySlot(senderId: string, requestedSenderLimit?: number | null) {
  const now = Date.now();
  const nextHour = Math.floor(now / 3_600_000 + 1) * 3_600_000;
  const window = Math.floor(now / 3_600_000);
  const senderLimit = Math.min(config.MAX_EMAILS_PER_HOUR_PER_SENDER, requestedSenderLimit ?? config.MAX_EMAILS_PER_HOUR_PER_SENDER);
  const allowed = await redis.eval(
    script, 2, `rate:global:${window}`, `rate:sender:${senderId}:${window}`,
    config.MAX_EMAILS_PER_HOUR, senderLimit, nextHour - now
  ) as number;
  return { allowed: allowed === 1, nextWindowAt: new Date(nextHour) };
}
