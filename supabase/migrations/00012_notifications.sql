-- ============================================================
-- Migration 00012: notifications table
-- In-app notification log with Supabase Realtime support.
-- ============================================================

create table notifications (
  id              uuid primary key default gen_random_uuid(),
  recipient_id    uuid not null references profiles(id) on delete cascade,
  type            text not null,
  -- Supported types:
  --   MEETUP_REQUEST, MEETUP_ACCEPTED, FRIEND_REQUEST, FRIEND_ACCEPTED,
  --   POST_REACTION, COMMENT, LOST_PET_NEARBY, ALERT_NEARBY
  payload         jsonb not null default '{}',
  is_read         boolean not null default false,
  created_at      timestamptz not null default now()
);

-- Composite index for efficient "unread notifications" queries
create index notif_recipient_idx on notifications(recipient_id, is_read, created_at desc);

-- ────────────────────────────────────────────────────────────
-- RLS Policies
-- ────────────────────────────────────────────────────────────
alter table notifications enable row level security;

-- Recipients can only see their own notifications
create policy "notif_select" on notifications
  for select using (auth.uid() = recipient_id);

-- Recipients can mark their own as read
create policy "notif_update" on notifications
  for update using (auth.uid() = recipient_id);
