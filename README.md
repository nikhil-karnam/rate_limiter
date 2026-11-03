# Rate Limiter

A distributed rate limiter built with NestJS and Redis, modeled on Databricks' design.

## How it works

- Each server lets requests through, up to 100, without asking Redis.
- Redis runs a shared token bucket that caps at 100 tokens and gradually refills 100 tokens per second.
- Every 100ms, each server reports its count to Redis. Redis adds tokens for the time passed, subtracts the tokens consumed locally, and saves. If the remaining token count is <= 0, Redis makes the server time out for however long it takes to refill the bucket to 1 token.
- Imagine 3 servers keep receiving requests from the same user and when >= 1 tokens are available, a burst of 300 requests occur for that user. A burst just occurred. But that user's next reports puts the bucket into a token debt of ~300 and applies a timeout of ~3 seconds to that user on each server. A burst of 300 requests every ~3 seconds averages to the desired 100 requests per second limit. Therefore, allowing bursts is the cost of syncing token counts periodically. It's super fast for each user though, because requests don't have to communicate with Redis every time.
- If a burst takes 4ms, there is little difference between reporting every 100ms vs every 700ms. In both cases, a token debt of ~300 will occur. The trace: the first server brings it to -100 and gets told to wait 1 second. The second brings it to -200 and gets told to wait 2 seconds. The third -300 and 3 seconds. After 700ms, all are still waiting. They report again and sync their wait times to the 2.3 seconds. Overall, still a burst of 300 every 3 seconds.
- The point of increase the report frequency is just to have a higher likelihood of blocking a burst mid way. If reports are every 10ms, it may catch the 4ms burst mid way, tokens get consumed, and servers may receive a wait time. The cost of higher report frequency is more load on Redis.
- If Redis is down on a report, the local request counter drains 10 tokens. This acts as a fall-back limiter, allowing 100 tokens per second per server.
- API keys are split across 3 Redis instances by hashing the user.

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
