// One-shot: dump sqlite_master DDL bytes (no shell re-encoding).
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const args = [
  'wrangler', 'd1', 'execute', 'ota_local', '--local', '-c', 'wrangler.local.jsonc',
  '--persist-to', 'C:\\tmp\\migcheck', '--json', '--command',
  "SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name != 'd1_migrations' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END, name;",
];
const opts = { encoding: 'buffer', stdio: ['ignore', 'pipe', 'pipe'] };
const out = process.platform === 'win32'
  ? execFileSync('cmd.exe', ['/c', 'npx', ...args], opts)
  : execFileSync('npx', args, opts);
writeFileSync('C:\\tmp\\pg-schema-dump.json', out);
console.log('wrote', out.length, 'bytes');
