## Distributed API Gateway

Distributed rate limiters for 3 servers built with NestJS and Redis, comparing Databricks design and Stripe/GitHub's design. Added a load balancer (Envoy Proxy) with server health checks, rerouting traffic from slow servers, and shedding load.

---

### How Databricks's limiter works

- Each server lets requests through, without asking Redis.
- Redis runs a shared token bucket that caps at 100 tokens and gradually refills 100 tokens per second.
- Every 100ms, each server reports its count to Redis, called "batch-reporting". Redis adds tokens for the time passed, subtracts the tokens consumed locally, and saves. If the remaining token count is <= 0, Redis makes the server time out for however long it takes to refill the bucket to 1 token.
- local server tokens are capped at 100, enforcing a local limit.
- If Redis is down on a report, the local request counter drains 10 tokens. This acts as a fall-back limiter, allowing 100 tokens per second per server.
- API keys are routed across 3 Redis instances by hash.

Why does it cause bursts?\
Imagine 3 servers keep receiving requests from the same user and they are blocked because all are on timeout. When >= 1 tokens are available, a burst of 300 requests occur for that user. A burst just occurred.

How does it still maintain an average limit of 100 tokens per second per user across all servers?\
Following the burst, 3 reports go through. The first puts the token bucket into a debt of -100 tokens and receives a 1 second timeout. The second report puts it into a debt of -200 with a 2 second timeout. The third: -300 and a 3 second timeout. After 100ms, the servers are still in timeout, poll again, and sync their timeouts to 2.9 seconds. This results in a burst leading to a 3 second timeout across all servers. 300 tokens spent across all servers every 3 seconds leads to a 100 tokens per second average. Therefore, if you wanna make some database queries, allowing bursts on it is the cost of syncing token counts periodically. But it will timeout for a good while and the other users can make queries fine for that duration. The benefit is that limiter is super fast because requests don't have to communicate with Redis every time.

How much burst?\
If the number of tokens in the bucket is 1, one burst results in 200 extra concurrent requests every 3 seconds. If the number of tokens is sitting at 100, the first server's report will bring it down to 0 tokens, receive a 10ms wait time to fill 1 token, and do an extra burst of 100 requests following the first 300, so long as the 100 go through before the first server reports again.

What if you change the report frequency?\
If a burst takes 4ms, there is practically no difference between reporting every 100ms vs every 700ms. In both cases, a token debt of ~300 will likely occur because the bursts will likely happen right away before the report can stop it. If reports are every 10ms, it may catch the 4ms burst mid way, tokens get consumed, and servers may receive a wait time. The point of increasing the report frequency is therefore to increase the likelihood that a burst is stopped mid-way. The cost is wasted computer power, assuming Redis can scan all keys that frequently.

### How Stripe/GitHub's limiter works

Communicates with Redis and consumes tokens on every request instead of periodically. The benefit is that no extra request slips through because every request checks the token bucket, and the cost is that communicating with Redis every request is slower.

---

### Results

25,000 requests per second across 3 app instances, 3 ms simulated Redis RTT.

| | Check p99 | Overshoot |
|---|---|---|
| Periodic Consumption | 0.04 ms | 6.7% |
| Per-Request Consumption | 8.74 ms | ~0% |

---

### Run

Requires Node.js, Redis, and Envoy installed on Linux or WSL.

From the project folder, run `npm install && npm run build`, then `bash start.sh` to start Redis, the 3 servers, and Envoy, and `bash stop.sh` to shut everything down.
