import {
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core'

// ---------- Better Auth tables (camelCase columns are required) ----------

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('emailVerified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expiresAt').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
})

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: timestamp('accessTokenExpiresAt'),
  refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})

export const gmailConnections = pgTable(
  'gmail_connections',
  {
    id: text('id').primaryKey(),
    userId: text('userId').notNull(),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token').notNull(),
    expiryDate: timestamp('expiry_date', { withTimezone: true }),
    scope: text('scope'),
    email: text('email'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.userId)],
)

export const amazonPurchases = pgTable(
  'amazon_purchases',
  {
    id: text('id').primaryKey(),
    userId: text('userId').notNull(),
    gmailMessageId: text('gmail_message_id').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull(),
    sender: text('sender'),
    subject: text('subject'),
    invoiceId: text('invoice_id'),
    items: jsonb('items').notNull().default([]),
    totalAmount: text('total_amount'),
    currency: text('currency'),
    rawContent: text('raw_content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.userId, t.gmailMessageId)],
)

export const amazonImportJobs = pgTable('amazon_import_jobs', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  status: text('status').notNull().default('queued'),
  pageToken: text('page_token'),
  scanned: integer('scanned').notNull().default(0),
  imported: integer('imported').notNull().default(0),
  lastError: text('last_error'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expiresAt').notNull(),
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').defaultNow(),
})

// ---------- dross app tables ----------
// Task model mirrors the user's Notion "Stallions" system:
// Mountains (objectives) -> Boulders (projects) -> Stones & Pebbles (tasks).

// Notion statuses: Not started, Done, "Narrr" (skipped). `doing` is added for the board view.
export type TaskStatus = 'not_started' | 'doing' | 'done' | 'skipped'
// Notion priorities: Urgent (now), Necessary (today), Important (this week), Normal.
export type TaskPriority = 'urgent' | 'necessary' | 'important' | 'normal'
// Notion "Type" is a time-box estimate.
export type TaskType = 'errand' | 'task' | 'focus' | 'deep'
// Task group splits the board into two lives.
export type TaskGroup = 'personal' | 'work'
// Category values are group-scoped (see CATEGORIES_BY_GROUP in lib/tasks).
export type TaskCategory =
  | 'relationships'
  | 'admin'
  | 'finance'
  | 'self'
  | 'followups'
  | 'project'
  | 'oncall'
// Notion "Size" effort tier.
export type TaskSize = 'boulder' | 'stone' | 'pebble'
// Recurrence: two open-ended habits + two bounded repeats.
export type Recurrence = 'none' | 'daily' | 'weekly' | 'days' | 'weeks'
export type TaskUrgency = 'top' | 'today' | 'week' | 'backlog'

export const tasks = pgTable('tasks', {
  id: serial('id').primaryKey(),
  userId: text('userId').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').$type<TaskStatus>().notNull().default('not_started'),
  priority: text('priority').$type<TaskPriority>().notNull().default('normal'),
  type: text('type').$type<TaskType>().notNull().default('task'),
  group: text('task_group').$type<TaskGroup>().notNull().default('work'),
  category: text('category').$type<TaskCategory>().notNull().default('project'),
  size: text('size').$type<TaskSize>().notNull().default('stone'),
  today: boolean('today').notNull().default(false),
  thisWeek: boolean('this_week').notNull().default(false),
  topItem: boolean('top_item').notNull().default(false),
  urgency: text('urgency').$type<TaskUrgency>().notNull().default('backlog'),
  // Recurrence + habit tracking.
  recurrence: text('recurrence').$type<Recurrence>().notNull().default('none'),
  recurrenceCount: integer('recurrence_count'),
  recurrenceRemaining: integer('recurrence_remaining'),
  habitCount: integer('habit_count').notNull().default(0),
  habitTier: integer('habit_tier').notNull().default(0),
  habitGoldShields: integer('habit_gold_shields').notNull().default(0),
  lastPeriodKey: text('last_period_key'),
  lastCompletedPeriodKey: text('last_completed_period_key'),
  boulderId: integer('boulder_id'),
  mountainId: integer('mountain_id'),
  dueAt: timestamp('due_at', { withTimezone: true }),
  tags: text('tags').array().notNull().default([]),
  isResearch: boolean('is_research').notNull().default(false),
  researchPageId: integer('research_page_id'),
  researchRunId: text('research_run_id'),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// Mountains = long-range objectives (Notion "Mountains ⛰️" / 2026 Goals).
export type StructureStatus = 'active' | 'done' | 'someday'
export type MountainArea =
  | 'body'
  | 'career'
  | 'relationships'
  | 'mind'
  | 'finance'
  | 'lifestyle'
  | 'other'

export const mountains = pgTable('mountains', {
  id: serial('id').primaryKey(),
  userId: text('userId').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  area: text('area').$type<MountainArea>().notNull().default('other'),
  status: text('status').$type<StructureStatus>().notNull().default('active'),
  progress: integer('progress').notNull().default(0),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// Boulders = projects that ladder up to a Mountain (Notion "Boulders 🪨").
export const boulders = pgTable('boulders', {
  id: serial('id').primaryKey(),
  userId: text('userId').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  mountainId: integer('mountain_id'),
  status: text('status').$type<StructureStatus>().notNull().default('active'),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type WikiSource = { title: string; url: string; note?: string }
export type WikiStatus = 'draft' | 'published'
export type AuthoredBy = 'user' | 'research-agent' | 'housekeeping-agent'

export const wikiPages = pgTable(
  'wiki_pages',
  {
    id: serial('id').primaryKey(),
    userId: text('userId').notNull(),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    content: text('content').notNull().default(''),
    summary: text('summary'),
    status: text('status').$type<WikiStatus>().notNull().default('published'),
    tags: text('tags').array().notNull().default([]),
    sources: jsonb('sources').$type<WikiSource[]>().notNull().default([]),
    authoredBy: text('authored_by').$type<AuthoredBy>().notNull().default('user'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.userId, t.slug)],
)

export const wikiRevisions = pgTable('wiki_revisions', {
  id: serial('id').primaryKey(),
  userId: text('userId').notNull(),
  pageId: integer('page_id').notNull(),
  content: text('content').notNull(),
  title: text('title').notNull(),
  authoredBy: text('authored_by').$type<AuthoredBy>().notNull().default('user'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const wikiLinks = pgTable(
  'wiki_links',
  {
    id: serial('id').primaryKey(),
    userId: text('userId').notNull(),
    fromPageId: integer('from_page_id').notNull(),
    toSlug: text('to_slug').notNull(),
  },
  (t) => [unique().on(t.fromPageId, t.toSlug)],
)

export const interests = pgTable('interests', {
  id: serial('id').primaryKey(),
  userId: text('userId').notNull(),
  topic: text('topic').notNull(),
  keywords: text('keywords').array().notNull().default([]),
  weight: integer('weight').notNull().default(3),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type AgentName = 'research' | 'housekeeping' | 'newsletter' | 'notify' | 'code'
export type RunStatus = 'queued' | 'running' | 'completed' | 'failed'
export type RunLogEntry = { at: string; level: 'info' | 'warn' | 'error'; message: string }

export const agentRuns = pgTable('agent_runs', {
  id: serial('id').primaryKey(),
  userId: text('userId').notNull(),
  agent: text('agent').$type<AgentName>().notNull(),
  runId: text('run_id'),
  status: text('status').$type<RunStatus>().notNull().default('queued'),
  trigger: text('trigger').notNull().default('manual'),
  input: jsonb('input').$type<Record<string, unknown>>(),
  summary: text('summary'),
  log: jsonb('log').$type<RunLogEntry[]>().notNull().default([]),
  error: text('error'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
})

export type ProposalKind = 'merge_pages' | 'fix_link' | 'archive_task' | 'retag' | 'code_change'
export type ProposalStatus = 'pending' | 'approved' | 'rejected'

export const proposals = pgTable('proposals', {
  id: serial('id').primaryKey(),
  userId: text('userId').notNull(),
  agent: text('agent').$type<AgentName>().notNull(),
  runId: text('run_id'),
  kind: text('kind').$type<ProposalKind>().notNull(),
  title: text('title').notNull(),
  rationale: text('rationale').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  status: text('status').$type<ProposalStatus>().notNull().default('pending'),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const newsletters = pgTable('newsletters', {
  id: serial('id').primaryKey(),
  userId: text('userId').notNull(),
  title: text('title').notNull(),
  contentMd: text('content_md').notNull(),
  contentHtml: text('content_html').notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  emailId: text('email_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type NotificationKind = 'due_soon' | 'overdue' | 'agent' | 'proposal' | 'newsletter' | 'system'

export const apiKeys = pgTable('api_keys', {
  id: serial('id').primaryKey(),
  userId: text('userId').notNull(),
  name: text('name').notNull(),
  keyHash: text('key_hash').notNull().unique(),
  keyPrefix: text('key_prefix').notNull(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
})

export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  userId: text('userId').notNull(),
  kind: text('kind').$type<NotificationKind>().notNull(),
  title: text('title').notNull(),
  body: text('body'),
  href: text('href'),
  readAt: timestamp('read_at', { withTimezone: true }),
  emailedAt: timestamp('emailed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const settings = pgTable('settings', {
  userId: text('userId').primaryKey(),
  timezone: text('timezone').notNull().default('UTC'),
  newsletterDay: integer('newsletter_day').notNull().default(1),
  newsletterHour: integer('newsletter_hour').notNull().default(8),
  notifyEmail: boolean('notify_email').notNull().default(true),
  quietStart: integer('quiet_start').notNull().default(22),
  quietEnd: integer('quiet_end').notNull().default(7),
  housekeepingEnabled: boolean('housekeeping_enabled').notNull().default(true),
  researchAuto: boolean('research_auto').notNull().default(true),
  // Ambient room capture.
  recorderToken: text('recorder_token'),
  ambientEnabled: boolean('ambient_enabled').notNull().default(true),
  ambientEmailApproval: boolean('ambient_email_approval').notNull().default(true),
  ambientLastEmailedAt: timestamp('ambient_last_emailed_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ---------- Ambient room capture ----------
// A recording is one uploaded audio chunk from a room device. It moves through
// uploaded → transcribed → processed (or empty/failed).
export type RecordingStatus = 'uploaded' | 'transcribed' | 'processed' | 'empty' | 'failed'

export const recordings = pgTable('recordings', {
  id: serial('id').primaryKey(),
  userId: text('userId').notNull(),
  room: text('room').notNull().default('room'),
  blobPathname: text('blob_pathname').notNull(),
  durationMs: integer('duration_ms'),
  bytes: integer('bytes'),
  status: text('status').$type<RecordingStatus>().notNull().default('uploaded'),
  transcript: text('transcript'),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
})

export type Recording = typeof recordings.$inferSelect

// A captured task is a proposed create/update extracted from a transcript,
// waiting in the review queue until the user approves or dismisses it.
export type CapturedKind = 'create' | 'update'
export type CapturedStatus = 'pending' | 'approved' | 'dismissed'

export const capturedTasks = pgTable('captured_tasks', {
  id: serial('id').primaryKey(),
  userId: text('userId').notNull(),
  recordingId: integer('recording_id'),
  kind: text('kind').$type<CapturedKind>().notNull().default('create'),
  targetTaskId: integer('target_task_id'),
  title: text('title').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  group: text('task_group').$type<TaskGroup>().notNull().default('personal'),
  excerpt: text('excerpt'),
  status: text('status').$type<CapturedStatus>().notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
})

export type CapturedTask = typeof capturedTasks.$inferSelect

// ---------- Journal ----------
// Two structured reflection formats stored in one table; the shape of `body`
// depends on `type`. Kept as jsonb because both formats are list-heavy and vary.
export type JournalType = 'daily' | 'relationship'

export type DailyJournalBody = {
  feelings: string[]
  wentWell: string[]
  wentPoorly: string[]
  lessonsShort: string[]
  lessonsMedium: string[]
  lessonsLong: string[]
}

export type RelationshipJournalBody = {
  wentWell: string[]
  wentBad: string[]
  canAccept: string[]
  cannotAccept: string[]
  canImprove: string[]
  didWell: string[]
  learned: string[]
  details: string
}

export type JournalBody = DailyJournalBody | RelationshipJournalBody

export const journalEntries = pgTable('journal_entries', {
  id: serial('id').primaryKey(),
  userId: text('userId').notNull(),
  type: text('type').$type<JournalType>().notNull(),
  title: text('title'),
  entryDate: timestamp('entry_date', { withTimezone: true }).notNull().defaultNow(),
  // Daily: the "how did the day go?" short answer. Relationship: unused.
  summary: text('summary'),
  body: jsonb('body').$type<JournalBody>().notNull().default({} as unknown as JournalBody),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type JournalEntry = typeof journalEntries.$inferSelect

export type Task = typeof tasks.$inferSelect
export type Mountain = typeof mountains.$inferSelect
export type Boulder = typeof boulders.$inferSelect
export type WikiPage = typeof wikiPages.$inferSelect
export type WikiRevision = typeof wikiRevisions.$inferSelect
export type Interest = typeof interests.$inferSelect
export type AgentRun = typeof agentRuns.$inferSelect
export type Proposal = typeof proposals.$inferSelect
export type Newsletter = typeof newsletters.$inferSelect
export type Notification = typeof notifications.$inferSelect
export type Settings = typeof settings.$inferSelect
