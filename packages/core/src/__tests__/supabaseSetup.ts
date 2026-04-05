import pg from 'pg';

let client: pg.Client | null = null;

export async function connectTestDb(): Promise<pg.Client> {
  if (client) return client;
  client = new pg.Client({
    host: '127.0.0.1',
    port: 54322,
    database: 'postgres',
    user: 'postgres',
    password: 'postgres',
  });
  await client.connect();
  return client;
}

export async function disconnectTestDb(): Promise<void> {
  if (client) {
    await client.end();
    client = null;
  }
}

export function getTestClient(): pg.Client {
  if (!client) throw new Error('Test DB not connected. Call connectTestDb() first.');
  return client;
}

export async function beginTransaction(): Promise<void> {
  const c = getTestClient();
  await c.query('BEGIN');
}

export async function rollbackTransaction(): Promise<void> {
  const c = getTestClient();
  await c.query('ROLLBACK');
}
