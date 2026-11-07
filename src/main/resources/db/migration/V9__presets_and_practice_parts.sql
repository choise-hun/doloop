-- V9__presets_and_practice_parts.sql
-- 구간 프리셋(임의 명칭, 무제한 생성, 분할 연습 구간 누적 병합) 및 세션/테이크 파트 연동
-- 설계: 개발산출물/진행_프론트개선.md (사용자 승인: 2026-11-07)

-- ============================================================
-- 1. song_presets (곡별 구간 프리셋 테이블)
-- ============================================================
CREATE TABLE song_presets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  song_id     UUID NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 50),
  a           NUMERIC(8, 1) NOT NULL CHECK (a >= -10.0 AND a <= 86400.0),
  b           NUMERIC(8, 1) NOT NULL CHECK (b >= 0.0 AND b <= 86400.0),
  rate        NUMERIC(4, 2) NOT NULL DEFAULT 1.00 CHECK (rate >= 0.25 AND rate <= 2.0),
  completed   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_song_presets_song_name UNIQUE (song_id, name),
  CONSTRAINT ck_song_presets_range CHECK (a < b)
);

CREATE INDEX idx_song_presets_user_song ON song_presets (user_id, song_id);

-- ============================================================
-- 2. takes (녹음 당시 활성 파트명 및 완료 여부)
-- ============================================================
ALTER TABLE takes
  ADD COLUMN part_name  TEXT NOT NULL DEFAULT '',
  ADD COLUMN completed  BOOLEAN NOT NULL DEFAULT false;

-- ============================================================
-- 3. sessions (일별 연습 파트 통계 및 영상 대비 진행바 커버리지 %)
-- ============================================================
ALTER TABLE sessions
  ADD COLUMN part_stats     JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN coverage_pct   INTEGER NOT NULL DEFAULT 0 CHECK (coverage_pct BETWEEN 0 AND 100);

-- ============================================================
-- 4. songs (영상 전체 길이 초 캐시)
-- ============================================================
ALTER TABLE songs
  ADD COLUMN duration_sec   INTEGER NOT NULL DEFAULT 0 CHECK (duration_sec >= 0);
