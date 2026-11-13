CREATE TABLE shared_attachment_copy_log (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX shared_attachment_copy_log_user_created_idx ON shared_attachment_copy_log (user_id, created_at DESC);
