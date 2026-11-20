import {readFile, readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const directory = new URL('../supabase/migrations/', import.meta.url);
// These predate migration tracking and share a date; dependencies set the order.
const legacy = ['20261024_user_data.sql', '20261024_admin_curriculum.sql', '20261024_journey_books.sql'];
const knownChecksumReconciliations = new Map([
  ['202611010002_payment_operations.sql', {
    appliedChecksum: '388e09c836dae96779b48a24a26c8545f471740afc08194e99a5f83a9e060539',
    sourceChecksum: 'f219557845abff2ad76fb7564509e21d847df5b95dbb7d25c5725f21a55d4712'
  }]
]);

export async function readMigrations() {
  const names = await readdir(directory);
  const ordered = [...legacy, ...names.filter(name => name.endsWith('.sql') && !legacy.includes(name)).sort()];
  return Promise.all(ordered.map(async name => {
    const sql = await readFile(new URL(name, directory), 'utf8');
    return {name, sql, checksum:createHash('sha256').update(sql).digest('hex')};
  }));
}

// Caller owns the transaction, so schema, ledger and seeding commit together.
export async function applyMigrations(client, migrations) {
  migrations ??= await readMigrations();
  await client.query("select pg_advisory_xact_lock(741025190)");
  await client.query(`create schema if not exists private;
    revoke all on schema private from public, anon, authenticated;
    create table if not exists private.schema_migrations (
      name text primary key, checksum text not null, applied_at timestamptz not null default now()
    );
    revoke all on private.schema_migrations from public, anon, authenticated`);
  const {rows} = await client.query('select name, checksum from private.schema_migrations');
  const applied = new Map(rows.map(row => [row.name, row.checksum]));
  for (const migration of migrations) {
    if (applied.has(migration.name)) {
      if (applied.get(migration.name) !== migration.checksum) {
        const reconciliation = knownChecksumReconciliations.get(migration.name);
        if (reconciliation?.appliedChecksum === applied.get(migration.name)
          && reconciliation.sourceChecksum === migration.checksum) {
          console.warn(`Recognized historical checksum drift for ${migration.name}; preserving the applied ledger checksum.`);
          continue;
        }
        throw new Error(`Applied migration changed: ${migration.name}. Add a new migration instead.`);
      }
      continue;
    }
    await client.query(migration.sql);
    await client.query('insert into private.schema_migrations(name, checksum) values ($1, $2)', [migration.name, migration.checksum]);
  }
}
