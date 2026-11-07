import { CanActivate, ExecutionContext, HttpException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import type { RedisClientType } from 'redis';
import { times } from './times.js';

const SYNC_SCRIPT = `
local apiKey = KEYS[1]
local requests = tonumber(ARGV[1])
local waitUntil = tonumber(ARGV[2])
local rawTime = redis.call('TIME')
local currentTime = tonumber(rawTime[1]) * 1000 + math.floor(tonumber(rawTime[2]) / 1000)
local expireThreshold = 60000
local refillRate = 1/10

if redis.call('EXISTS', apiKey) == 0 then
  redis.call('HSET', apiKey, 'tokens', 100, 'lastUpdated', currentTime)
end
local lastUpdated = tonumber(redis.call('HGET', apiKey, 'lastUpdated'))
local tokens = tonumber(redis.call('HGET', apiKey, 'tokens'))

if currentTime - lastUpdated > expireThreshold then
  redis.call('PEXPIRE', apiKey, expireThreshold)
  return -1
end

if requests > 0 then
  -- edge case for when a reshard occurs and the old key doesn't get polled and deleted manually
  -- * 2 avoids race condition with manual delete
  redis.call('PEXPIRE', apiKey, expireThreshold * 2)

  tokens = math.min(100, tokens + (currentTime - lastUpdated) * refillRate)
  tokens = tokens - requests
  redis.call('HSET', apiKey, 'tokens', tokens, 'lastUpdated', currentTime)

  if tokens <= 0 then
    waitUntil = currentTime + math.ceil((1 - tokens) / refillRate)
  end
end

return waitUntil
`;

@Injectable()
export class RateLimiterGuard implements CanActivate {
  counters = new Map<string, { requests: number; waitUntil: number }>();

  constructor(@Inject('REDIS_CLIENTS') private redisClients: RedisClientType[]) {
    setInterval(() => this.sync(), 100);
  }

  async sync() {
    for (const [apiKey, entry] of this.counters) {
      const hash = parseInt(createHash('md5').update(apiKey).digest('hex').slice(0, 8), 16);
      const redis = this.redisClients[hash % this.redisClients.length];
      const currentRequests = entry.requests;

      try {
        entry.waitUntil = Number(await redis.eval(SYNC_SCRIPT, {
          keys: [apiKey],
          arguments: [String(currentRequests), String(entry.waitUntil)],
        }));
        
        if (entry.waitUntil === -1) {
          this.counters.delete(apiKey);
        } else {
          entry.requests -= currentRequests;
        }
      } 
      catch {
        // if Redis is down, make the requests itself the token bucket
        entry.requests = Math.max(0, entry.requests - 10);
      }
    }
  }

  canActivate(context: ExecutionContext): boolean {
    const start = performance.now();
    try {
      const apiKey = context.switchToHttp().getRequest().headers['x-api-key'];

      if (!apiKey) throw new UnauthorizedException();

      if (!this.counters.get(apiKey)) {
        this.counters.set(apiKey, { requests: 0, waitUntil: 0 });
      }

      const entry = this.counters.get(apiKey)!;

      if (entry.requests >= 100 || Date.now() < entry.waitUntil) throw new HttpException('Too Many Requests', 429);

      entry.requests++;
      return true;
    } finally {
      times.push(performance.now() - start);
    }
  }
}