import { CanActivate, ExecutionContext, HttpException, Inject, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import type { RedisClientType } from 'redis';
import { times } from './times.js';

const CHECK_SCRIPT = `
local apiKey = KEYS[1]
local refillRate = 1/10

local time = redis.call('TIME')
local currentTime = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)

if redis.call('EXISTS', apiKey) == 0 then
  redis.call('HSET', apiKey, 'tokens', 100, 'lastUpdated', currentTime)
end

local lastUpdated = tonumber(redis.call('HGET', apiKey, 'lastUpdated'))
local tokens = tonumber(redis.call('HGET', apiKey, 'tokens'))

tokens = math.min(100, tokens + (currentTime - lastUpdated) * refillRate)

if tokens < 1 then
  return 0
end

redis.call('HSET', apiKey, 'tokens', tokens - 1, 'lastUpdated', currentTime)
return 1
`;

@Injectable()
export class DumpsterfireGuard implements CanActivate {
  constructor(@Inject('REDIS_CLIENTS') private redisClients: RedisClientType[]) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const start = performance.now();
    try {
      const apiKey = context.switchToHttp().getRequest().headers['x-api-key'];

      const hash = parseInt(createHash('md5').update(apiKey).digest('hex').slice(0, 8), 16);
      const redis = this.redisClients[hash % this.redisClients.length];

      const allowed = await redis.eval(CHECK_SCRIPT, { keys: [apiKey] });

      if (!allowed) throw new HttpException('Too Many Requests', 429);

      return true;
    } finally {
      times.push(performance.now() - start);
    }
  }
}