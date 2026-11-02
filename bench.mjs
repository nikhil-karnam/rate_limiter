import autocannon from 'autocannon';
import { createClient } from 'redis';

async function getTimes() {
  let all = [];
  for (const port of [3000, 3001, 3002]) {
    const response = await fetch(`http://localhost:${port}/stats`, { headers: { 'x-api-key': 'stats' } });
    all = all.concat(await response.json());
  }
  return all;
}

// flush redis before test
for (const port of [6379, 6380, 6381]) {
  const client = createClient({ url: `redis://localhost:${port}` });
  await client.connect();
  await client.flushAll();
  await client.quit();
}

await getTimes();
const result = await autocannon({
  url: ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002'],
  connections: 300,
  overallRate: 25000,
  duration: 30,
  headers: { 'x-api-key': `key-${Date.now()}` },
});

const times = (await getTimes()).sort((a, b) => a - b);

console.log(`check p99: ${times[Math.floor(times.length * 0.99)].toFixed(3)} ms`);
console.log(`allowed: ${result['2xx']} (max should be 3100)`);