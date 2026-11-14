#!/usr/bin/env node
// scripts/redis-store/redis-helper.mjs
// TG-10: sync-friendly Redis moves for the E2E helpers (which are sync by
// contract, like query.mjs). Usage:
//   node redis-helper.mjs reset <bucket>     — drop gft:rl:<bucket>:* keys
//   node redis-helper.mjs fill <bucket> <n>  — learn one live key (fail loud
//     when absent, like fillBucket's prime rule) and ZADD n members at now.
// Fill TTL is uniform 3700s (covers the largest 3600s window); resets clear it.
import { connectRedis } from './redis-ephemeral.mjs';

const [, , cmd, bucket, nRaw] = process.argv;
if (!['reset', 'fill', 'delkey', 'count', 'ping'].includes(cmd) || (cmd !== 'reset' && cmd !== 'ping' && !bucket)) {
  throw new Error('usage: reset [bucket]|fill <bucket> <n>|delkey <key>|count <bucket>|ping');
}
const client = await connectRedis(process.env.E2E_REDIS_URL || 'redis://127.0.0.1:16381');
try {
  if (cmd === 'ping') {
    console.log(JSON.stringify({ ok: true }));
  } else if (cmd === 'delkey') {
    await client.del(`gft:rl:${bucket}`);
    console.log(JSON.stringify({ ok: true }));
  } else if (cmd === 'count') {
    let cursor = '0';
    let total = 0;
    do {
      const res = await client.scan(cursor, { MATCH: `gft:rl:${bucket}*`, COUNT: 200 });
      cursor = String(res.cursor);
      for (const k of res.keys) total += await client.zCard(k);
    } while (cursor !== '0');
    console.log(JSON.stringify({ n: total }));
  } else if (cmd === 'reset') {
    const pattern = bucket ? `gft:rl:${bucket}:*` : 'gft:rl:*';
    let cursor = '0';
    do {
      const res = await client.scan(cursor, { MATCH: pattern, COUNT: 200 });
      cursor = String(res.cursor);
      if (res.keys.length) await client.del(res.keys);
    } while (cursor !== '0');
    console.log(JSON.stringify({ ok: true }));
  } else {
    const n = parseInt(nRaw, 10);
    if (!Number.isSafeInteger(n) || n <= 0) throw new Error('fill needs n > 0');
    let key = null;
    let cursor = '0';
    do {
      const res = await client.scan(cursor, { MATCH: `gft:rl:${bucket}:*`, COUNT: 100 });
      cursor = String(res.cursor);
      if (!key && res.keys.length) key = res.keys.sort()[0];
    } while (cursor !== '0' && !key);
    if (!key) throw new Error(`fill(${bucket}): prime with one real request first`);
    const now = Math.floor(Date.now() / 1000);
    const members = Array.from({ length: n }, (_, i) => ({ score: now, value: `e2e-fill:${i}` }));
    for (let i = 0; i < members.length; i += 200) await client.zAdd(key, members.slice(i, i + 200));
    await client.expire(key, 3700);
    console.log(JSON.stringify({ ok: true, key, n }));
  }
} finally {
  await client.disconnect();
}
