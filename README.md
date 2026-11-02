# Rate Limiter

A distributed rate limiter built with NestJS and Redis, modeled on Databricks' design.

## How it works

- Each server lets requests through, up to 100, without asking Redis.
- Redis runs a shared token bucket that caps at 100 tokens and gradually refills 100 tokens per second.
- Every 100ms, each server reports its count to Redis. Redis adds tokens for the time passed, subtracts the tokens consumed locally, and saves. If the remaining token count is <= 0, Redis makes the server time out for however long it takes to refill the bucket to 1 token.
- Imagine 3 servers keep receiving requests from the same user and when >= 1 tokens are available, a burst of 300 requests occur for that user. A burst just occurred. But that user's next report puts the bucket into a token debt of ~300 and applies a timeout of ~3 seconds to that user for each server. A burst of 300 requests every ~3 seconds averages to the desired 100 requests per second limit. Therefore, allowing bursts is the cost of syncing token counts periodically. It's super fast though, because requests don't have to communicate with Redis every time.
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
