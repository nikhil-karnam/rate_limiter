# Rate Limiter

A distributed rate limiter built with NestJS and Redis, modeled on Databricks' design.

## How it works

- Each server counts requests per API key in its own memory, so checks never wait on Redis.
- Every 100 ms, each server reports its request count to Redis.
- Redis runs a token bucket that refills 100 per second at a gradual rate and caps at 100 tokens across all servers in the region.
- Upon reception, Redis fills the bucket based on the time since the last refill. It then subtracts the number of tokens a server consumed since its last report.
- If the remaining token count is <= 0, Redis makes the server time out for however long it takes to refill the bucket to 1 token.
- Because a server can wait until 1 token is present and then spam 100 more requests, the request count can overshoot.
- However, the next report will bring the token count down to ~-90 and makes the server wait ~1 second.
- API keys are split across 3 Redis instances by hash.
- If Redis is down, each server falls back to a local limit.

## Results

25,000 requests per second, 3 app instances, 2 ms simulated Redis latency.

| | Check p99 | Overshoot |
|---|---|---|
| This design | 0.04 ms | 6.7% |
| Redis on every request | 8.74 ms | ~0% |

## Run

```bash
npm install
npm run build
PORT=3000 node dist/main.js
```

To benchmark, run 3 instances on ports 3000–3002 with Redis on 6379–6381, then `node bench.mjs`. Start with `MODE=dumpsterfire` to run the version that communicates with Redis on every request.
