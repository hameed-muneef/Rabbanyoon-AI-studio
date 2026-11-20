import test from 'node:test';
import assert from 'node:assert/strict';
import {applyMigrations, readMigrations} from '../scripts/database-migrations.mjs';

const migrationName = '202611010002_payment_operations.sql';
const historicalChecksum = '388e09c836dae96779b48a24a26c8545f471740afc08194e99a5f83a9e060539';

function ledgerClient(checksum) {
  const statements = [];
  return {
    statements,
    query: async sql => {
      statements.push(sql);
      if (sql === 'select name, checksum from private.schema_migrations') {
        return {rows: [{name: migrationName, checksum}]};
      }
      return {rows: []};
    }
  };
}

test('database migrations: recognizes only the pinned payment migration checksum reconciliation', async () => {
  const migration = (await readMigrations()).find(item => item.name === migrationName);
  assert.ok(migration);

  const client = ledgerClient(historicalChecksum);
  await applyMigrations(client, [migration]);
  assert.equal(client.statements.includes(migration.sql), false);
  assert.equal(client.statements.some(sql => sql.startsWith('insert into private.schema_migrations')), false);

  const changedClient = ledgerClient(historicalChecksum);
  await assert.rejects(
    applyMigrations(changedClient, [{...migration, checksum: '0'.repeat(64)}]),
    /Applied migration changed: 202611010002_payment_operations\.sql/
  );
  assert.equal(changedClient.statements.includes(migration.sql), false);
});
