import { type AnyPgColumn, pgTable, uuid, text, timestamp, integer, smallint, boolean, date, uniqueIndex, index, pgEnum } from 'drizzle-orm/pg-core';

export const reminderStage = pgEnum('reminder_stage', ['gift', 'ideas', 'draft', 'day']);
export const reminderStatus = pgEnum('reminder_status', ['pending', 'delivered', 'dismissed']);
export const sendChannel = pgEnum('send_channel', ['email', 'sms', 'whatsapp', 'telegram', 'link']);
export const sendStatus = pgEnum('send_status', ['scheduled', 'sent', 'notified', 'failed', 'cancelled']);
export const familyRole = pgEnum('family_role', ['owner', 'admin', 'member', 'viewer']);
export const rsvpStatus = pgEnum('rsvp_status', ['going', 'maybe', 'no']);
export const taskStatus = pgEnum('task_status', ['todo', 'doing', 'done']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  /** Null for accounts that only sign in with Google, Apple or a phone code. */
  passwordHash: text('password_hash'),
  /** E.164, verified by a text-message code; lets the person sign in with a code. */
  phone: text('phone'),
  phoneVerifiedAt: timestamp('phone_verified_at', { withTimezone: true }),
  /** Authenticator-app two-step verification (secret encrypted at rest). */
  totpSecret: text('totp_secret'),
  totpEnabledAt: timestamp('totp_enabled_at', { withTimezone: true }),
  totpLastStep: integer('totp_last_step'),
  /** SHA-256 hashes of unused one-time recovery codes (JSON array). */
  recoveryCodes: text('recovery_codes'),
  name: text('name').notNull(),
  language: text('language').notNull().default('en'),
  country: text('country').notNull().default('IN'),
  timezone: text('timezone').notNull().default('Asia/Kolkata'),
  /** user | admin. Admins are granted from the command line (npm run admin:grant). */
  role: text('role').notNull().default('user'),
  /** Suspended accounts can't log in and all their sessions are ended. */
  suspendedAt: timestamp('suspended_at', { withTimezone: true }),
  suspendedReason: text('suspended_reason'),
  /** Updated at most every 10 minutes while the person uses the app. */
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => [uniqueIndex('users_email_idx').on(t.email), uniqueIndex('users_phone_idx').on(t.phone), index('users_created_idx').on(t.createdAt)]);

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(), // sha256 of the cookie token
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  /** Set for an admin's read-only support view of this user. */
  impersonatorId: uuid('impersonator_id').references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => [index('sessions_user_idx').on(t.userId)]);

export const people = pgTable('people', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  relationship: text('relationship').notNull(),
  phone: text('phone'),
  email: text('email'),
  language: text('language').notNull().default('en'),
  notes: text('notes'),
  /** When set, everyone in this family sees the person and gets their reminders. Null = private. */
  familyId: uuid('family_id').references(() => families.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => [index('people_user_idx').on(t.userId), index('people_family_idx').on(t.familyId)]);

export const occasions = pgTable('occasions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  personId: uuid('person_id').notNull().references(() => people.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(), // birthday | anniversary | work_anniversary | custom
  label: text('label'),
  month: smallint('month').notNull(),
  day: smallint('day').notNull(),
  year: integer('year'),
  remindGift: boolean('remind_gift').notNull().default(true),
  remindIdeas: boolean('remind_ideas').notNull().default(true),
  remindDraft: boolean('remind_draft').notNull().default(true),
  remindDay: boolean('remind_day').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => [index('occasions_user_idx').on(t.userId), index('occasions_person_idx').on(t.personId)]);

export const reminders = pgTable('reminders', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  occasionId: uuid('occasion_id').notNull().references(() => occasions.id, { onDelete: 'cascade' }),
  stage: reminderStage('stage').notNull(),
  eventDate: date('event_date').notNull(),
  dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
  status: reminderStatus('status').notNull().default('pending'),
  deliveredAt: timestamp('delivered_at', { withTimezone: true })
}, (t) => [
  uniqueIndex('reminders_unique_idx').on(t.occasionId, t.userId, t.stage, t.eventDate),
  index('reminders_due_idx').on(t.status, t.dueAt)
]);

export const wishes = pgTable('wishes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  personId: uuid('person_id').references(() => people.id, { onDelete: 'set null' }),
  occasion: text('occasion').notNull(),
  language: text('language').notNull(),
  tone: text('tone').notNull(),
  text: text('text').notNull(),
  designIndex: smallint('design_index').notNull().default(0),
  recipientName: text('recipient_name').notNull(),
  senderName: text('sender_name').notNull(),
  /** A card designed in the editor (shown instead of the numbered design). */
  cardDraftId: uuid('card_draft_id').references((): AnyPgColumn => cardDrafts.id, { onDelete: 'set null' }),
  /** A recorded voice or video message that plays on the wish page. */
  messageFileId: uuid('message_file_id').references((): AnyPgColumn => files.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => [index('wishes_user_idx').on(t.userId)]);

export const wishPages = pgTable('wish_pages', {
  id: uuid('id').primaryKey().defaultRandom(),
  wishId: uuid('wish_id').notNull().references(() => wishes.id, { onDelete: 'cascade' }),
  slug: text('slug').notNull(),
  allowSignatures: boolean('allow_signatures').notNull().default(true),
  views: integer('views').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => [uniqueIndex('wish_pages_slug_idx').on(t.slug), uniqueIndex('wish_pages_wish_idx').on(t.wishId)]);

export const signatures = pgTable('signatures', {
  id: uuid('id').primaryKey().defaultRandom(),
  wishPageId: uuid('wish_page_id').notNull().references(() => wishPages.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  message: text('message').notNull(),
  /** Set when a logged-in Blessly user signed, so family progress can be shown. */
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => [index('signatures_page_idx').on(t.wishPageId)]);

export const scheduledSends = pgTable('scheduled_sends', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  wishId: uuid('wish_id').notNull().references(() => wishes.id, { onDelete: 'cascade' }),
  channel: sendChannel('channel').notNull(),
  recipient: text('recipient').notNull(),
  sendAt: timestamp('send_at', { withTimezone: true }).notNull(),
  status: sendStatus('status').notNull().default('scheduled'),
  attempts: smallint('attempts').notNull().default(0),
  lastError: text('last_error'),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => [index('sends_due_idx').on(t.status, t.sendAt)]);

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  body: text('body').notNull(),
  link: text('link'),
  readAt: timestamp('read_at', { withTimezone: true }),
  /** Null until the job runner has handled push delivery for this notification. */
  pushedAt: timestamp('pushed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => [index('notifications_user_idx').on(t.userId, t.createdAt), index('notifications_push_idx').on(t.pushedAt, t.createdAt)]);

/** Every outbound email/SMS is recorded here; in development nothing leaves the server. */
export const outbox = pgTable('outbox', {
  id: uuid('id').primaryKey().defaultRandom(),
  channel: sendChannel('channel').notNull(),
  recipient: text('recipient').notNull(),
  subject: text('subject'),
  body: text('body').notNull(),
  provider: text('provider').notNull(),
  providerId: text('provider_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

/* ---------- Phase 2: Family Circle ---------- */

export const families = pgTable('families', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const familyMembers = pgTable('family_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  familyId: uuid('family_id').notNull().references(() => families.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: familyRole('role').notNull().default('member'),
  /** Receive reminders for people shared with this family. */
  notify: boolean('notify').notNull().default(true),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => [uniqueIndex('family_members_unique_idx').on(t.familyId, t.userId), index('family_members_user_idx').on(t.userId)]);

export const familyInvites = pgTable('family_invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  familyId: uuid('family_id').notNull().references(() => families.id, { onDelete: 'cascade' }),
  token: text('token').notNull(),
  role: familyRole('role').notNull().default('member'),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  uses: integer('uses').notNull().default(0),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => [uniqueIndex('family_invites_token_idx').on(t.token), index('family_invites_family_idx').on(t.familyId)]);

export const familyEvents = pgTable('family_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  familyId: uuid('family_id').notNull().references(() => families.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  occasion: text('occasion').notNull().default('birthday'),
  eventDate: date('event_date').notNull(),
  eventTime: text('event_time'),
  place: text('place'),
  notes: text('notes'),
  personId: uuid('person_id').references(() => people.id, { onDelete: 'set null' }),
  /** Group card everyone in the family signs. */
  wishId: uuid('wish_id').references(() => wishes.id, { onDelete: 'set null' }),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => [index('family_events_family_idx').on(t.familyId, t.eventDate)]);

export const eventRsvps = pgTable('event_rsvps', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id').notNull().references(() => familyEvents.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: rsvpStatus('status').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => [uniqueIndex('event_rsvps_unique_idx').on(t.eventId, t.userId)]);

export const familyTasks = pgTable('family_tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  familyId: uuid('family_id').notNull().references(() => families.id, { onDelete: 'cascade' }),
  eventId: uuid('event_id').references(() => familyEvents.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  assigneeId: uuid('assignee_id').references(() => users.id, { onDelete: 'set null' }),
  status: taskStatus('status').notNull().default('todo'),
  dueDate: date('due_date'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => [index('family_tasks_family_idx').on(t.familyId), index('family_tasks_event_idx').on(t.eventId)]);

/** One alert per member per event stage, so event reminders are never sent twice. */
export const eventAlerts = pgTable('event_alerts', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id').notNull().references(() => familyEvents.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  stage: text('stage').notNull(), // eve | day
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => [uniqueIndex('event_alerts_unique_idx').on(t.eventId, t.userId, t.stage)]);

/* ---------- Phase 2: Web Push ---------- */

export const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  userAgent: text('user_agent'),
  failures: smallint('failures').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => [uniqueIndex('push_endpoint_idx').on(t.endpoint), index('push_user_idx').on(t.userId)]);

/* ---------- Phase 3: Business ---------- */

export const bizChannel = pgEnum('biz_channel', ['whatsapp', 'email']);
export const bizMessageStatus = pgEnum('biz_message_status', ['queued', 'sent', 'delivered', 'read', 'failed', 'skipped']);
export const campaignStatus = pgEnum('campaign_status', ['scheduled', 'sending', 'done', 'cancelled']);

export const businesses = pgTable('businesses', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  timezone: text('timezone').notNull().default('Asia/Kolkata'),
  country: text('country').notNull().default('IN'),
  /** Admin override of the monthly allowance. Null = whatever the owner's plan includes. */
  monthlyQuota: integer('monthly_quota'),
  /** Free trial: 14 days and 100 messages, then a Business plan is needed. */
  trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
  waPhoneNumberId: text('wa_phone_number_id'),
  waBusinessAccountId: text('wa_business_account_id'),
  /** Access token, AES-256-GCM encrypted with ENCRYPTION_KEY. Never sent to the browser. */
  waTokenEnc: text('wa_token_enc'),
  waDisplayNumber: text('wa_display_number'),
  waVerifiedName: text('wa_verified_name'),
  waConnectedAt: timestamp('wa_connected_at', { withTimezone: true }),
  /** Set by platform admins: nothing is sent while paused. */
  pausedAt: timestamp('paused_at', { withTimezone: true }),
  pausedReason: text('paused_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => [uniqueIndex('businesses_owner_idx').on(t.ownerId), uniqueIndex('businesses_wa_phone_idx').on(t.waPhoneNumberId)]);

export const customers = pgTable('customers', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  /** E.164 digits without '+'. */
  phone: text('phone'),
  email: text('email'),
  language: text('language').notNull().default('en'),
  birthdayMonth: smallint('birthday_month'),
  birthdayDay: smallint('birthday_day'),
  anniversaryMonth: smallint('anniversary_month'),
  anniversaryDay: smallint('anniversary_day'),
  tags: text('tags').notNull().default(''),
  /** When and how the customer agreed to receive messages. Null = no consent, nothing is sent. */
  consentAt: timestamp('consent_at', { withTimezone: true }),
  consentSource: text('consent_source'),
  waOptOutAt: timestamp('wa_opt_out_at', { withTimezone: true }),
  emailOptOutAt: timestamp('email_opt_out_at', { withTimezone: true }),
  unsubscribeToken: text('unsubscribe_token').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => [
  index('customers_business_idx').on(t.businessId),
  uniqueIndex('customers_phone_idx').on(t.businessId, t.phone),
  uniqueIndex('customers_email_idx').on(t.businessId, t.email),
  uniqueIndex('customers_unsub_idx').on(t.unsubscribeToken),
  index('customers_birthday_idx').on(t.birthdayMonth, t.birthdayDay),
  index('customers_anniv_idx').on(t.anniversaryMonth, t.anniversaryDay)
]);

export const waTemplates = pgTable('wa_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  language: text('language').notNull(),
  category: text('category').notNull(),
  status: text('status').notNull(),
  body: text('body').notNull().default(''),
  paramCount: smallint('param_count').notNull().default(0),
  syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => [uniqueIndex('wa_templates_unique_idx').on(t.businessId, t.name, t.language)]);

export const automations = pgTable('automations', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(), // birthday | anniversary
  enabled: boolean('enabled').notNull().default(false),
  /** whatsapp: WhatsApp only. email: email only. both: WhatsApp, falling back to email when WhatsApp isn't possible. */
  channel: text('channel').notNull().default('both'),
  templateId: uuid('template_id').references(() => waTemplates.id, { onDelete: 'set null' }),
  emailSubject: text('email_subject').notNull(),
  emailBody: text('email_body').notNull(),
  sendHour: smallint('send_hour').notNull().default(9),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => [uniqueIndex('automations_unique_idx').on(t.businessId, t.kind)]);

export const campaigns = pgTable('campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  channel: text('channel').notNull().default('both'),
  templateId: uuid('template_id').references(() => waTemplates.id, { onDelete: 'set null' }),
  emailSubject: text('email_subject').notNull().default(''),
  emailBody: text('email_body').notNull().default(''),
  /** Only customers with this tag; empty = everyone who has agreed to messages. */
  tag: text('tag').notNull().default(''),
  sendAt: timestamp('send_at', { withTimezone: true }).notNull(),
  status: campaignStatus('status').notNull().default('scheduled'),
  audience: integer('audience').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => [index('campaigns_due_idx').on(t.status, t.sendAt)]);

export const bizMessages = pgTable('biz_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  /** birthday:<customer>:<date> | anniversary:<customer>:<date> | campaign:<campaign>:<customer> — one message per occasion. */
  dedupeKey: text('dedupe_key').notNull(),
  source: text('source').notNull(), // birthday | anniversary | campaign
  campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),
  channel: bizChannel('channel').notNull(),
  recipient: text('recipient').notNull(),
  preview: text('preview').notNull().default(''),
  status: bizMessageStatus('status').notNull().default('queued'),
  providerId: text('provider_id'),
  error: text('error'),
  attempts: smallint('attempts').notNull().default(0),
  sendAt: timestamp('send_at', { withTimezone: true }).notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => [
  uniqueIndex('biz_messages_dedupe_idx').on(t.dedupeKey),
  index('biz_messages_queue_idx').on(t.status, t.sendAt),
  index('biz_messages_business_idx').on(t.businessId, t.createdAt),
  index('biz_messages_provider_idx').on(t.providerId)
]);

/* ---------- Phase 4: Platform admin and accounts ---------- */

/** Every action a platform admin takes. Never deleted from the app. */
export const adminAudit = pgTable('admin_audit', {
  id: uuid('id').primaryKey().defaultRandom(),
  adminId: uuid('admin_id').references(() => users.id, { onDelete: 'set null' }),
  adminEmail: text('admin_email').notNull(),
  action: text('action').notNull(),
  targetType: text('target_type').notNull(),
  targetId: text('target_id'),
  targetLabel: text('target_label'),
  details: text('details'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => [index('admin_audit_created_idx').on(t.createdAt)]);

export const passwordResets = pgTable('password_resets', {
  id: text('id').primaryKey(), // sha256 of the emailed token
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => [index('password_resets_user_idx').on(t.userId)]);

/** One row per job-runner run, for the admin health page. Old rows are pruned. */
export const jobRuns = pgTable('job_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  ok: boolean('ok').notNull().default(true),
  result: text('result'),
  error: text('error')
}, (t) => [index('job_runs_started_idx').on(t.startedAt)]);

/* ---------- Phase 5: Albums ---------- */

export const albums = pgTable('albums', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** Shared with a family circle: members can see it and add photos. */
  familyId: uuid('family_id').references(() => families.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  occasion: text('occasion').notNull().default('birthday'),
  designIndex: smallint('design_index').notNull().default(0),
  /** Public link (null = private). */
  slug: text('slug'),
  /** Anyone with the public link may add photos (owner can remove them). */
  guestUploads: boolean('guest_uploads').notNull().default(false),
  coverPhotoId: uuid('cover_photo_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => [index('albums_user_idx').on(t.userId), index('albums_family_idx').on(t.familyId), uniqueIndex('albums_slug_idx').on(t.slug)]);

export const albumPhotos = pgTable('album_photos', {
  id: uuid('id').primaryKey().defaultRandom(),
  albumId: uuid('album_id').notNull().references(() => albums.id, { onDelete: 'cascade' }),
  uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
  guestName: text('guest_name'),
  /** Storage keys for the resized copies (location data removed). */
  fullKey: text('full_key').notNull(),
  thumbKey: text('thumb_key').notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  bytes: integer('bytes').notNull(),
  caption: text('caption'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => [index('album_photos_album_idx').on(t.albumId, t.sortOrder)]);

/* ---------- Phase 5: Billing ---------- */

export const plans = pgTable('plans', {
  id: text('id').primaryKey(), // free | family | business
  name: text('name').notNull(),
  /** Prices in the smallest unit: paise for INR, cents for USD. */
  inrMonthly: integer('inr_monthly').notNull().default(0),
  inrYearly: integer('inr_yearly').notNull().default(0),
  usdMonthly: integer('usd_monthly').notNull().default(0),
  usdYearly: integer('usd_yearly').notNull().default(0),
  maxFamilyMembers: smallint('max_family_members').notNull(),
  maxAlbums: integer('max_albums').notNull(),
  maxPhotosPerAlbum: integer('max_photos_per_album').notNull(),
  /** Business messages a month included (0 = no business features). */
  businessMessages: integer('business_messages').notNull().default(0),
  businessSeats: smallint('business_seats').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  planId: text('plan_id').notNull().references(() => plans.id),
  interval: text('interval').notNull(), // month | year
  currency: text('currency').notNull(), // INR | USD
  amount: integer('amount').notNull(),
  provider: text('provider').notNull(), // razorpay | stripe | test | manual
  providerSubscriptionId: text('provider_subscription_id'),
  providerCustomerId: text('provider_customer_id'),
  /** pending → active → (past_due) → cancelled/expired */
  status: text('status').notNull().default('pending'),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => [index('subscriptions_user_idx').on(t.userId), uniqueIndex('subscriptions_provider_idx').on(t.provider, t.providerSubscriptionId)]);

/** Provider-side price objects (e.g. Razorpay plan ids), created on demand for the current price. */
export const providerPrices = pgTable('provider_prices', {
  id: uuid('id').primaryKey().defaultRandom(),
  provider: text('provider').notNull(),
  planId: text('plan_id').notNull(),
  interval: text('interval').notNull(),
  currency: text('currency').notNull(),
  amount: integer('amount').notNull(),
  providerPriceId: text('provider_price_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => [uniqueIndex('provider_prices_unique_idx').on(t.provider, t.planId, t.interval, t.currency, t.amount)]);

/** Every payment webhook, stored once (idempotency) for support and audits. */
export const billingEvents = pgTable('billing_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  provider: text('provider').notNull(),
  eventId: text('event_id').notNull(),
  type: text('type').notNull(),
  payload: text('payload').notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => [uniqueIndex('billing_events_unique_idx').on(t.provider, t.eventId)]);

/* ---------- Phase 5: Business teams ---------- */

export const businessMembers = pgTable('business_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => [uniqueIndex('business_members_unique_idx').on(t.businessId, t.userId), index('business_members_user_idx').on(t.userId)]);

export const businessInvites = pgTable('business_invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  token: text('token').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => [uniqueIndex('business_invites_token_idx').on(t.token), index('business_invites_business_idx').on(t.businessId)]);

/* ---------- Phase 5: Admin content ---------- */

/** Festival dates managed by admins: add future years, correct a date, or add a new festival. */
export const festivalDates = pgTable('festival_dates', {
  id: uuid('id').primaryKey().defaultRandom(),
  festivalId: text('festival_id').notNull(),
  name: text('name').notNull(),
  occasion: text('occasion'),
  regions: text('regions').notNull().default('GLOBAL'),
  date: date('date').notNull(),
  approximate: boolean('approximate').notNull().default(false),
  hidden: boolean('hidden').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => [uniqueIndex('festival_dates_unique_idx').on(t.festivalId, t.date)]);

export const cardOverrides = pgTable('card_overrides', {
  id: uuid('id').primaryKey().defaultRandom(),
  occasion: text('occasion').notNull(),
  designIndex: smallint('design_index').notNull(),
  hidden: boolean('hidden').notNull().default(false),
  featured: boolean('featured').notNull().default(false)
}, (t) => [uniqueIndex('card_overrides_unique_idx').on(t.occasion, t.designIndex)]);

export const announcements = pgTable('announcements', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  link: text('link'),
  audience: text('audience').notNull(), // all | business | country:XX
  recipients: integer('recipients').notNull().default(0),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

/** Shared rate-limit counters, so limits hold when several app servers run (RATE_LIMIT_STORE=postgres). */
export const rateLimits = pgTable('rate_limits', {
  key: text('key').primaryKey(),
  count: integer('count').notNull(),
  resetAt: timestamp('reset_at', { withTimezone: true }).notNull()
}, (t) => [index('rate_limits_reset_idx').on(t.resetAt)]);

/* ---------- Card editor and media messages ---------- */

/** Uploaded or generated files (card photos, rendered cards, voice/video messages). Served by signed link. */
export const files = pgTable('files', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(), // card-photo | card-render | message-audio | message-video
  key: text('key').notNull(),
  mime: text('mime').notNull(),
  bytes: integer('bytes').notNull(),
  width: integer('width'),
  height: integer('height'),
  durationSec: integer('duration_sec'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => [index('files_owner_idx').on(t.ownerId)]);

/** A card made in the editor: front and inside pages of layers on top of a design, colour or photo. */
export const cardDrafts = pgTable('card_drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  occasion: text('occasion').notNull(),
  doc: text('doc').notNull(),
  favourite: boolean('favourite').notNull().default(false),
  frontFileId: uuid('front_file_id').references(() => files.id, { onDelete: 'set null' }),
  insideFileId: uuid('inside_file_id').references(() => files.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => [index('card_drafts_user_idx').on(t.userId, t.updatedAt)]);

/* ---------- Celebrations, invitations and wishlists ---------- */

/** A celebration page: the event, its invitations and RSVPs, guest messages and memories. */
export const celebrations = pgTable('celebrations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  slug: text('slug').notNull(),
  title: text('title').notNull(),
  occasion: text('occasion').notNull(),
  honoree: text('honoree'),
  description: text('description'),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }),
  timezone: text('timezone').notNull(),
  place: text('place'),
  address: text('address'),
  onlineUrl: text('online_url'),
  designIndex: smallint('design_index').notNull().default(0),
  /** public: anyone can find and view · link: anyone with the link · invite: only invited guests. */
  visibility: text('visibility').notNull().default('link'),
  rsvpEnabled: boolean('rsvp_enabled').notNull().default(true),
  rsvpDeadline: timestamp('rsvp_deadline', { withTimezone: true }),
  askDiet: boolean('ask_diet').notNull().default(false),
  askAccess: boolean('ask_access').notNull().default(false),
  maxPartySize: smallint('max_party_size').notNull().default(1),
  guestPosts: boolean('guest_posts').notNull().default(true),
  moderatePosts: boolean('moderate_posts').notNull().default(false),
  showGuestList: boolean('show_guest_list').notNull().default(false),
  wishlistId: uuid('wishlist_id').references((): AnyPgColumn => wishlists.id, { onDelete: 'set null' }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => [uniqueIndex('celebrations_slug_idx').on(t.slug), index('celebrations_user_idx').on(t.userId, t.startsAt)]);

export const celebrationGuests = pgTable('celebration_guests', {
  id: uuid('id').primaryKey().defaultRandom(),
  celebrationId: uuid('celebration_id').notNull().references(() => celebrations.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  email: text('email'),
  phone: text('phone'),
  /** Personal link token (invite-only pages and changing an answer later). */
  token: text('token').notNull(),
  /** invited · yes · no · maybe */
  status: text('status').notNull().default('invited'),
  partySize: smallint('party_size').notNull().default(1),
  diet: text('diet'),
  access: text('access'),
  note: text('note'),
  selfAdded: boolean('self_added').notNull().default(false),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  invitedAt: timestamp('invited_at', { withTimezone: true }),
  respondedAt: timestamp('responded_at', { withTimezone: true }),
  remindedAt: timestamp('reminded_at', { withTimezone: true }),
  dayBeforeAt: timestamp('day_before_at', { withTimezone: true }),
  thankedAt: timestamp('thanked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => [uniqueIndex('celebration_guests_token_idx').on(t.token), index('celebration_guests_cel_idx').on(t.celebrationId)]);

/** Messages, photos and videos from guests (the group card before, memories after). */
export const celebrationPosts = pgTable('celebration_posts', {
  id: uuid('id').primaryKey().defaultRandom(),
  celebrationId: uuid('celebration_id').notNull().references(() => celebrations.id, { onDelete: 'cascade' }),
  guestId: uuid('guest_id').references(() => celebrationGuests.id, { onDelete: 'set null' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  message: text('message').notNull().default(''),
  fileId: uuid('file_id').references(() => files.id, { onDelete: 'set null' }),
  /** wish (before the day) · memory (after) */
  kind: text('kind').notNull().default('wish'),
  approved: boolean('approved').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => [index('celebration_posts_cel_idx').on(t.celebrationId, t.createdAt)]);

/** Updates from the host (shown on the page and emailed to guests who are coming or haven't answered). */
export const celebrationUpdates = pgTable('celebration_updates', {
  id: uuid('id').primaryKey().defaultRandom(),
  celebrationId: uuid('celebration_id').notNull().references(() => celebrations.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  emailed: integer('emailed').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => [index('celebration_updates_cel_idx').on(t.celebrationId)]);

export const wishlists = pgTable('wishlists', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  slug: text('slug').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  occasion: text('occasion').notNull().default('birthday'),
  eventDate: date('event_date'),
  /** Keep it a surprise: the owner sees which items are taken only after revealing. */
  surprise: boolean('surprise').notNull().default(true),
  revealedAt: timestamp('revealed_at', { withTimezone: true }),
  shippingNote: text('shipping_note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => [uniqueIndex('wishlists_slug_idx').on(t.slug), index('wishlists_user_idx').on(t.userId)]);

export const wishlistItems = pgTable('wishlist_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  wishlistId: uuid('wishlist_id').notNull().references(() => wishlists.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  url: text('url'),
  price: integer('price'), // minor units
  currency: text('currency'),
  notes: text('notes'),
  /** 1 = must have, 2 = would love, 3 = nice to have */
  priority: smallint('priority').notNull().default(2),
  quantity: smallint('quantity').notNull().default(1),
  fileId: uuid('file_id').references(() => files.id, { onDelete: 'set null' }),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => [index('wishlist_items_list_idx').on(t.wishlistId, t.sortOrder)]);

export const wishlistReservations = pgTable('wishlist_reservations', {
  id: uuid('id').primaryKey().defaultRandom(),
  itemId: uuid('item_id').notNull().references(() => wishlistItems.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  email: text('email'),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  quantity: smallint('quantity').notNull().default(1),
  /** Lets the person who reserved cancel or mark as bought without an account. */
  token: text('token').notNull(),
  purchased: boolean('purchased').notNull().default(false),
  thankedAt: timestamp('thanked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => [uniqueIndex('wishlist_res_token_idx').on(t.token), index('wishlist_res_item_idx').on(t.itemId)]);

/* ---------- Sign-in options ---------- */

/** Google / Apple accounts linked to a Blessly account. */
export const userIdentities = pgTable('user_identities', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  subject: text('subject').notNull(),
  email: text('email'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => [uniqueIndex('user_identities_sub_idx').on(t.provider, t.subject), index('user_identities_user_idx').on(t.userId)]);

/** Short-lived sign-in steps: a phone code sent, or a password accepted and waiting for the two-step code. */
export const authChallenges = pgTable('auth_challenges', {
  id: text('id').primaryKey(), // sha256 of the token given to the browser
  kind: text('kind').notNull(), // phone-login | phone-verify | mfa
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  phone: text('phone'),
  codeHash: text('code_hash'),
  attempts: smallint('attempts').notNull().default(0),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => [index('auth_challenges_exp_idx').on(t.expiresAt)]);

/* ---------- Money (test mode): payments, ledger, pots, partners, shop, gift cards, print ---------- */

/** One payment for anything: a contribution, a gift card, a shop order, a printed card. */
export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  /** contribution | giftcard | shop | print */
  purpose: text('purpose').notNull(),
  refId: uuid('ref_id').notNull(),
  amount: integer('amount').notNull(),
  currency: text('currency').notNull(),
  /** pending | paid | failed | refunded */
  status: text('status').notNull().default('pending'),
  provider: text('provider').notNull(),
  providerRef: text('provider_ref'),
  email: text('email'),
  description: text('description').notNull(),
  returnUrl: text('return_url').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  refundedAt: timestamp('refunded_at', { withTimezone: true })
}, (t) => [index('payments_ref_idx').on(t.purpose, t.refId), index('payments_user_idx').on(t.userId)]);

/** Double-entry style ledger: who is owed what. Accounts: collection:<id>, partner:<id>, platform. */
export const ledgerEntries = pgTable('ledger_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  account: text('account').notNull(),
  paymentId: uuid('payment_id').references(() => payments.id, { onDelete: 'set null' }),
  payoutId: uuid('payout_id'),
  amount: integer('amount').notNull(), // signed, minor units
  currency: text('currency').notNull(),
  /** credit | fee | payout | refund */
  kind: text('kind').notNull(),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => [index('ledger_account_idx').on(t.account, t.currency)]);

export const payouts = pgTable('payouts', {
  id: uuid('id').primaryKey().defaultRandom(),
  account: text('account').notNull(),
  requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'set null' }),
  amount: integer('amount').notNull(),
  currency: text('currency').notNull(),
  /** requested | paid | rejected */
  status: text('status').notNull().default('requested'),
  reference: text('reference'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  decidedAt: timestamp('decided_at', { withTimezone: true })
}, (t) => [index('payouts_account_idx').on(t.account)]);

/** Sellers, card designers and charities. Approved by a platform admin. */
export const partners = pgTable('partners', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(), // seller | designer | charity
  name: text('name').notNull(),
  country: text('country').notNull(),
  website: text('website'),
  regNumber: text('reg_number'),
  description: text('description'),
  /** pending | approved | rejected | suspended */
  status: text('status').notNull().default('pending'),
  reviewNote: text('review_note'),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => [uniqueIndex('partners_user_kind_idx').on(t.userId, t.kind), index('partners_status_idx').on(t.kind, t.status)]);

/** Group gift pots ("chip in") and fundraisers. */
export const collections = pgTable('collections', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  slug: text('slug').notNull(),
  kind: text('kind').notNull(), // gift | fundraiser
  title: text('title').notNull(),
  story: text('story'),
  recipientName: text('recipient_name'),
  currency: text('currency').notNull(),
  target: integer('target'),
  deadline: timestamp('deadline', { withTimezone: true }),
  charityId: uuid('charity_id').references(() => partners.id, { onDelete: 'set null' }),
  celebrationId: uuid('celebration_id').references(() => celebrations.id, { onDelete: 'set null' }),
  wishlistItemId: uuid('wishlist_item_id').references(() => wishlistItems.id, { onDelete: 'set null' }),
  showAmounts: boolean('show_amounts').notNull().default(true),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => [uniqueIndex('collections_slug_idx').on(t.slug), index('collections_user_idx').on(t.userId)]);

export const contributions = pgTable('contributions', {
  id: uuid('id').primaryKey().defaultRandom(),
  collectionId: uuid('collection_id').notNull().references(() => collections.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  email: text('email'),
  message: text('message'),
  anonymous: boolean('anonymous').notNull().default(false),
  amount: integer('amount').notNull(),
  currency: text('currency').notNull(),
  /** pending | paid | refunded */
  status: text('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp('paid_at', { withTimezone: true })
}, (t) => [index('contributions_col_idx').on(t.collectionId, t.status)]);

/** Products listed by approved sellers (reviewed before they appear in the shop). */
export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  partnerId: uuid('partner_id').notNull().references(() => partners.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  price: integer('price').notNull(),
  currency: text('currency').notNull(),
  fileId: uuid('file_id').references(() => files.id, { onDelete: 'set null' }),
  stock: integer('stock').notNull().default(0),
  countries: text('countries').notNull().default('IN'),
  /** pending | approved | rejected */
  status: text('status').notNull().default('pending'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => [index('products_partner_idx').on(t.partnerId), index('products_status_idx').on(t.status, t.active)]);

/** Card designs submitted by designers; approved ones appear in the card editor. */
export const communityDesigns = pgTable('community_designs', {
  id: uuid('id').primaryKey().defaultRandom(),
  partnerId: uuid('partner_id').notNull().references(() => partners.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  occasion: text('occasion').notNull(),
  fileId: uuid('file_id').notNull().references(() => files.id, { onDelete: 'cascade' }),
  /** pending | approved | rejected */
  status: text('status').notNull().default('pending'),
  uses: integer('uses').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => [index('community_designs_status_idx').on(t.status, t.occasion)]);

/** Shop orders, gift cards and printed cards. */
export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  kind: text('kind').notNull(), // shop | giftcard | print
  /** pending_payment | paid | in_production | shipped | delivered | cancelled | refunded | failed */
  status: text('status').notNull().default('pending_payment'),
  amount: integer('amount').notNull(),
  currency: text('currency').notNull(),
  partnerId: uuid('partner_id').references(() => partners.id, { onDelete: 'set null' }),
  /** JSON: what was bought and where it goes. */
  details: text('details').notNull(),
  providerRef: text('provider_ref'),
  tracking: text('tracking'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => [index('orders_user_idx').on(t.userId, t.createdAt), index('orders_partner_idx').on(t.partnerId), index('orders_status_idx').on(t.kind, t.status)]);

export const giftCards = pgTable('gift_cards', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  brand: text('brand').notNull(),
  value: integer('value').notNull(),
  currency: text('currency').notNull(),
  recipientName: text('recipient_name').notNull(),
  recipientEmail: text('recipient_email').notNull(),
  message: text('message'),
  deliverAt: timestamp('deliver_at', { withTimezone: true }).notNull(),
  /** Encrypted at rest. */
  codeEnc: text('code_enc'),
  pinEnc: text('pin_enc'),
  expiresOn: date('expires_on'),
  token: text('token').notNull(),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => [uniqueIndex('gift_cards_token_idx').on(t.token), index('gift_cards_deliver_idx').on(t.deliverAt)]);

/** Integration keys and feature switches set from the Platform admin screen. Values are encrypted with ENCRYPTION_KEY. */
export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text('updated_by')
});

/* ---------------- Promotions and affiliates (test mode, like the rest of the money features) ---------------- */

/** A discount a customer can enter at checkout. Affiliates' own codes are promo codes too (affiliateId set). */
export const promoCodes = pgTable('promo_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Stored upper-case. */
  code: text('code').notNull(),
  label: text('label').notNull(),
  /** percent (1–100) or fixed (minor units, in `currency`). */
  kind: text('kind').notNull(),
  value: integer('value').notNull(),
  currency: text('currency'),
  /** Comma list of purposes: shop, print, giftcard. */
  appliesTo: text('applies_to').notNull().default('shop,print,giftcard'),
  minAmount: integer('min_amount').notNull().default(0),
  maxRedemptions: integer('max_redemptions'),
  perUserLimit: integer('per_user_limit').notNull().default(1),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull().defaultNow(),
  endsAt: timestamp('ends_at', { withTimezone: true }),
  active: boolean('active').notNull().default(true),
  affiliateId: uuid('affiliate_id').references((): AnyPgColumn => affiliates.id, { onDelete: 'set null' }),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => [uniqueIndex('promo_codes_code_key').on(t.code)]);

/** One row per order that used a code. Counts toward limits unless the order failed, was cancelled or refunded. */
export const promoRedemptions = pgTable('promo_redemptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  promoId: uuid('promo_id').notNull().references(() => promoCodes.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  baseAmount: integer('base_amount').notNull(),
  discount: integer('discount').notNull(),
  currency: text('currency').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => [uniqueIndex('promo_redemptions_order_key').on(t.orderId), index('promo_redemptions_promo_idx').on(t.promoId), index('promo_redemptions_user_idx').on(t.userId)]);

/** Affiliate programme member. Joining creates a pending application; the admin approves it. */
export const affiliates = pgTable('affiliates', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** Referral code (also their promo code). Upper-case. */
  code: text('code').notNull(),
  /** pending | approved | paused | rejected */
  status: text('status').notNull().default('pending'),
  commissionPercent: integer('commission_percent').notNull().default(10),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  approvedAt: timestamp('approved_at', { withTimezone: true })
}, (t) => [uniqueIndex('affiliates_user_key').on(t.userId), uniqueIndex('affiliates_code_key').on(t.code)]);

/** Customers who arrived through an affiliate link before they signed up. */
export const affiliateReferrals = pgTable('affiliate_referrals', {
  id: uuid('id').primaryKey().defaultRandom(),
  affiliateId: uuid('affiliate_id').notNull().references(() => affiliates.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => [uniqueIndex('affiliate_referrals_user_key').on(t.userId), index('affiliate_referrals_aff_idx').on(t.affiliateId)]);

/** Earned when a referred or code-based order is paid. One commission per order. */
export const affiliateCommissions = pgTable('affiliate_commissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  affiliateId: uuid('affiliate_id').notNull().references(() => affiliates.id, { onDelete: 'cascade' }),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  saleAmount: integer('sale_amount').notNull(),
  percent: integer('percent').notNull(),
  amount: integer('amount').notNull(),
  currency: text('currency').notNull(),
  /** pending | paid | void */
  status: text('status').notNull().default('pending'),
  reference: text('reference'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp('paid_at', { withTimezone: true })
}, (t) => [uniqueIndex('affiliate_commissions_order_key').on(t.orderId), index('affiliate_commissions_aff_idx').on(t.affiliateId)]);
