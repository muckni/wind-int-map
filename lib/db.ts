import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

// Reuse a single Pool across hot reloads in dev to avoid exhausting connections.
// In production, Next.js workers are long-lived, so a singleton per process is fine.
export function getPool() {
  if (!global.__pgPool) {
    global.__pgPool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }
  return global.__pgPool;
}

export const pool = getPool();
