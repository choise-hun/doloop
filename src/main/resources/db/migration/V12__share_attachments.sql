CREATE TABLE community_share_consents (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('agree','withdraw_recording')),
  notice_version INTEGER NOT NULL CHECK (notice_version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX community_share_consents_user_idx ON community_share_consents (user_id, id DESC);
CREATE TABLE shared_card_attachments (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('audio_copy')),
  source_take_id UUID NOT NULL REFERENCES takes(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL UNIQUE CHECK (storage_key ~ '^shared/[0-9a-f-]{36}\.(m4a|weba|ogg|mp3|wav|aac)$'),
  mime TEXT NOT NULL CHECK (mime IN ('audio/mp4','audio/webm','audio/ogg','audio/mpeg','audio/wav','audio/aac')),
  size_bytes BIGINT NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
  duration_sec INTEGER NOT NULL CHECK (duration_sec BETWEEN 0 AND 300),
  status TEXT NOT NULL CHECK (status IN ('copying','uploaded','ready')),
  original_confirmed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ready_at TIMESTAMPTZ,
  CHECK ((status = 'ready') = (ready_at IS NOT NULL))
);
CREATE UNIQUE INDEX shared_card_attachments_ready_idx ON shared_card_attachments(session_id) WHERE status = 'ready';
CREATE UNIQUE INDEX shared_card_attachments_pending_idx ON shared_card_attachments(user_id) WHERE status IN ('copying','uploaded');
CREATE INDEX shared_card_attachments_user_idx ON shared_card_attachments(user_id, status);
ALTER TABLE storage_trash ADD COLUMN next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX storage_trash_next_attempt_idx ON storage_trash(next_attempt_at);
