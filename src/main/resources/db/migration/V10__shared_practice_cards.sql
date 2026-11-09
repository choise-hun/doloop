-- CM-BE: explicit consent snapshots; withdrawal preserves moderation history.
CREATE TABLE shared_practice_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL UNIQUE REFERENCES sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '' CHECK (char_length(title) <= 80),
  comment TEXT NOT NULL DEFAULT '' CHECK (char_length(comment) <= 500),
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published','tier_paused','moderation_hidden')),
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  hidden_at TIMESTAMPTZ,
  hidden_reason TEXT CHECK (char_length(hidden_reason) BETWEEN 1 AND 200),
  tier_paused_at TIMESTAMPTZ,
  withdrawn_at TIMESTAMPTZ,
  public_session JSONB NOT NULL CHECK (jsonb_typeof(public_session) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((status = 'moderation_hidden' AND hidden_at IS NOT NULL AND hidden_reason IS NOT NULL)
      OR (status <> 'moderation_hidden' AND hidden_at IS NULL AND hidden_reason IS NULL)),
  CHECK (status <> 'published' OR tier_paused_at IS NULL),
  CHECK (status <> 'tier_paused' OR tier_paused_at IS NOT NULL)
);
CREATE INDEX shared_practice_cards_owner_idx ON shared_practice_cards (user_id,published_at DESC,id DESC);
CREATE INDEX shared_practice_cards_feed_idx ON shared_practice_cards (published_at DESC,id DESC)
  WHERE status = 'published' AND withdrawn_at IS NULL;
CREATE TRIGGER shared_practice_cards_updated BEFORE UPDATE ON shared_practice_cards
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE shared_practice_card_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES shared_practice_cards(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (reason IN ('spam','inappropriate','copyright','other')),
  detail TEXT NOT NULL DEFAULT '' CHECK (char_length(detail) <= 500),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  CHECK ((status = 'open') = (resolved_at IS NULL))
);
CREATE UNIQUE INDEX shared_practice_card_reports_open_uq ON shared_practice_card_reports (card_id,reporter_id) WHERE status = 'open';
CREATE INDEX shared_practice_card_reports_status_idx ON shared_practice_card_reports (status,created_at DESC,id DESC);
