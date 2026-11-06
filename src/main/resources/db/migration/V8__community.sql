-- V8__community.sql
-- M1-4a: 커뮤니티 테이블 (개발산출물/결과/M1-1_스키마설계.md §2-2 초안 + N1~N3 결정, 진행_티어크레딧.md §2·§3-2).
-- 원칙: 사용자가 쓴 글자는 금칙어 검사를 거친 공개 제목(N1)·공개 이름(N2)만 공개한다.
--  N1: shared_folders.title = 게시·다시 게시 때 입력(기본 분류 이름), 금칙어 검사. 분류 이름을 바꿔도 따라가지 않는다
--  N2: profiles.public_name = 처음 게시 때 display_name을 금칙어 검사 뒤 복사, 본인은 못 바꿈(owner만 NULL로 초기화)
--  N3: 공개본 곡 제목·아티스트는 YouTube 원래 값 → 항목에 title·artist 열이 없고 전역 캐시 video_titles를 조인한다

-- ============================================================
-- profiles.public_name (N2)
-- ============================================================
ALTER TABLE profiles
  ADD COLUMN public_name TEXT CHECK (public_name IS NULL OR char_length(btrim(public_name)) BETWEEN 1 AND 100);

-- ============================================================
-- video_titles (N3 — YouTube가 준 제목·채널명 캐시. 사용자 입력이 아니다)
-- ============================================================
CREATE TABLE video_titles (
  video_id    TEXT PRIMARY KEY CHECK (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  title       TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 300),
  author      TEXT NOT NULL DEFAULT '' CHECK (char_length(author) <= 200),
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- shared_folders & shared_folder_items (공개용 사본, §3-3 B)
-- ============================================================
CREATE TABLE shared_folders (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind                TEXT NOT NULL CHECK (kind IN ('user', 'curated', 'monthly_pick')),
  owner_id            UUID REFERENCES users(id) ON DELETE CASCADE,  -- user 폴더만. 운영자 폴더는 NULL(작성자는 admin_audit)
  source_category_id  UUID UNIQUE,                                   -- user 폴더의 원본 분류(분류당 공개본 하나)
  title               TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 100), -- user: 게시 때 입력(N1), 운영자: ko 제목
  title_i18n          JSONB NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(title_i18n) = 'object'),       -- 운영자 작성 {"ko":…,"en":…}
  description_i18n    JSONB NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(description_i18n) = 'object'),     -- 운영자 폴더만(A19·A20)
  month               DATE CHECK (month IS NULL OR extract(day FROM month) = 1),                       -- monthly_pick의 달(1일)
  is_public           BOOLEAN NOT NULL DEFAULT false,
  auto_sync           BOOLEAN NOT NULL DEFAULT false,
  sort_order          INTEGER NOT NULL DEFAULT 0,                    -- 운영자 큐레이션 순서
  clone_count         INTEGER NOT NULL DEFAULT 0 CHECK (clone_count >= 0),
  like_count          INTEGER NOT NULL DEFAULT 0 CHECK (like_count >= 0),     -- folder_likes 행 수(A18)
  published_at        TIMESTAMPTZ,                                   -- 마지막 복사(게시·다시 게시·자동 연동) 시각
  hidden_at           TIMESTAMPTZ,                                   -- owner 숨김
  hidden_reason       TEXT CHECK (char_length(hidden_reason) <= 200),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((kind = 'user') = (owner_id IS NOT NULL)),
  CHECK ((kind = 'user') = (source_category_id IS NOT NULL)),
  CHECK ((kind = 'monthly_pick') = (month IS NOT NULL)),
  CHECK (NOT auto_sync OR (kind = 'user' AND is_public)),            -- 자동 연동은 공개 user 폴더만
  FOREIGN KEY (owner_id, source_category_id) REFERENCES categories (user_id, id) ON DELETE CASCADE -- 원본 분류 삭제 = 공개본 삭제(A9)
);
CREATE UNIQUE INDEX shared_folders_month_uq ON shared_folders (month) WHERE kind = 'monthly_pick';
CREATE INDEX shared_folders_public_idx ON shared_folders (kind, published_at DESC) WHERE is_public AND hidden_at IS NULL;
CREATE INDEX shared_folders_owner_idx ON shared_folders (owner_id) WHERE owner_id IS NOT NULL;
CREATE TRIGGER shared_folders_updated BEFORE UPDATE ON shared_folders FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 복사하는 열: video_id·a·b·rate·순서. 제목·아티스트는 video_titles(N3), 메모·상태·pos는 복사하지 않는다
CREATE TABLE shared_folder_items (
  folder_id     UUID NOT NULL REFERENCES shared_folders(id) ON DELETE CASCADE,
  video_id      TEXT NOT NULL CHECK (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  position      INTEGER NOT NULL CHECK (position >= 0),
  a             NUMERIC(8,1),
  b             NUMERIC(8,1),
  rate          NUMERIC(4,2) NOT NULL DEFAULT 1.00,
  note_i18n     JSONB NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(note_i18n) = 'object'),          -- 운영자 폴더 곡 설명(A20). 사용자 코멘트는 없음(A5)
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (folder_id, video_id),
  CHECK (a IS NULL OR b IS NULL OR a < b)
);
CREATE INDEX shared_folder_items_order_idx ON shared_folder_items (folder_id, position);
CREATE TRIGGER shared_folder_items_updated BEFORE UPDATE ON shared_folder_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- follows
-- ============================================================
CREATE TABLE follows (
  follower_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followee_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followee_id),
  CHECK (follower_id <> followee_id)
);
CREATE INDEX follows_followee_idx ON follows (followee_id);

-- ============================================================
-- folder_likes (좋아요, A18 — 무료 포함, 누가 눌렀는지는 공개하지 않음)
-- ============================================================
CREATE TABLE folder_likes (
  folder_id   UUID NOT NULL REFERENCES shared_folders(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (folder_id, user_id)
);
CREATE INDEX folder_likes_user_idx ON folder_likes (user_id);

-- ============================================================
-- folder_reports (공개 폴더 신고. detail은 owner만 본다)
-- ============================================================
CREATE TABLE folder_reports (
  id           BIGSERIAL PRIMARY KEY,
  folder_id    UUID NOT NULL REFERENCES shared_folders(id) ON DELETE CASCADE,
  reporter_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason       TEXT NOT NULL CHECK (reason IN ('spam', 'inappropriate', 'copyright', 'other')),
  detail       TEXT NOT NULL DEFAULT '' CHECK (char_length(detail) <= 500),
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at  TIMESTAMPTZ
);
CREATE UNIQUE INDEX folder_reports_open_uq ON folder_reports (folder_id, reporter_id) WHERE status = 'open';
CREATE INDEX folder_reports_status_idx ON folder_reports (status, created_at DESC);
