import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? process.env.POSTGRES_PRISMA_URL

if (!connectionString) {
  throw new Error('Database connection is not configured. Set DATABASE_URL or POSTGRES_URL.')
}

export const pool = new Pool({ connectionString, max: 5, connectionTimeoutMillis: 10000 })
export const db = drizzle(pool, { schema })

export async function ensureApiKeysTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id serial PRIMARY KEY,
      "userId" text NOT NULL,
      name text NOT NULL,
      key_hash text NOT NULL UNIQUE,
      key_prefix text NOT NULL,
      last_used_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      revoked_at timestamptz
    )
  `)
}

export async function ensureTaskColumns() {
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS top_item boolean NOT NULL DEFAULT false`)
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS urgency text NOT NULL DEFAULT 'backlog'`)
  await pool.query(`
    UPDATE tasks
    SET urgency = CASE
      WHEN top_item THEN 'top'
      WHEN recurrence = 'daily' OR today THEN 'today'
      WHEN this_week OR recurrence IN ('weekly', 'days', 'weeks') THEN 'week'
      ELSE 'backlog'
    END
    WHERE urgency = 'backlog'
      AND (top_item OR today OR this_week OR recurrence <> 'none')
  `)
}

export async function ensureAmazonImportJobsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS amazon_import_jobs (
      id text PRIMARY KEY,
      "userId" text NOT NULL,
      status text NOT NULL DEFAULT 'queued',
      page_token text,
      scanned integer NOT NULL DEFAULT 0,
      imported integer NOT NULL DEFAULT 0,
      last_error text,
      started_at timestamptz,
      completed_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `)
}
