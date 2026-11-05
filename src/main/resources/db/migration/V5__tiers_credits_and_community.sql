-- V5__tiers_credits_and_community.sql
-- 티어·크레딧·관리 감사 + 커뮤니티용 profiles 열 (개발산출물/결과/M1-1_스키마설계.md).
-- 커뮤니티 테이블은 M1-4 마이그레이션, BYOK 키 삭제는 M1-3 마이그레이션

-- ============================================================
-- 1. profiles 확장
-- ============================================================
ALTER TABLE profiles
  ADD COLUMN billing_tier        TEXT NOT NULL DEFAULT 'free' CHECK (billing_tier IN ('free', 'pro', 'pro_plus')), -- 결제가 정하는 티어(M4-2 전까지 free)
  ADD COLUMN tier_override       TEXT CHECK (tier_override IN ('free', 'pro', 'pro_plus')),                     -- owner 관리 API 전용
  ADD COLUMN tier_override_until TIMESTAMPTZ,                                                                     -- NULL = 기한 없음
  ADD COLUMN monthly_credits     INTEGER NOT NULL DEFAULT 0 CHECK (monthly_credits >= 0),                        -- 월 지급분(다음 지급 때 소멸)
  ADD COLUMN purchased_credits   INTEGER NOT NULL DEFAULT 0 CHECK (purchased_credits >= 0),                      -- 구매·보상분(소멸 없음)
  ADD COLUMN locale              TEXT CHECK (locale IN ('ko', 'en', 'ja')),                                       -- NULL = 아직 고르지 않음(화면 자동)
  ADD COLUMN is_creator          BOOLEAN NOT NULL DEFAULT false,                                                  -- owner 지정
  ADD COLUMN creator_badge       TEXT CHECK (char_length(btrim(creator_badge)) BETWEEN 1 AND 20),
  ADD COLUMN creator_bio         TEXT NOT NULL DEFAULT '' CHECK (char_length(creator_bio) <= 200),
  ADD COLUMN share_autosync      BOOLEAN NOT NULL DEFAULT false,                                                  -- 설정 "연습 리스트 공유 자동 연동"
  ADD COLUMN share_practice_log  BOOLEAN NOT NULL DEFAULT false,                                                  -- 학습 기록 공유 동의
  ADD CONSTRAINT profiles_override_until_chk CHECK (tier_override_until IS NULL OR tier_override IS NOT NULL);
CREATE INDEX profiles_override_until_idx ON profiles (tier_override_until) WHERE tier_override IS NOT NULL;
CREATE INDEX profiles_creator_idx ON profiles (id) WHERE is_creator;

-- ============================================================
-- 2. analysis_jobs 과금 열 (M1-3이 채운다. 기존 행은 0/NULL = 과금 없음)
-- ============================================================
ALTER TABLE analysis_jobs
  ADD COLUMN reserved_monthly   INTEGER NOT NULL DEFAULT 0 CHECK (reserved_monthly >= 0),
  ADD COLUMN reserved_purchased INTEGER NOT NULL DEFAULT 0 CHECK (reserved_purchased >= 0),
  ADD COLUMN charged_credits    INTEGER CHECK (charged_credits >= 0),            -- 정산 확정액. NULL = 미정산
  ADD COLUMN prompt_tokens      INTEGER CHECK (prompt_tokens >= 0),              -- usageMetadata.promptTokenCount
  ADD COLUMN output_tokens      INTEGER CHECK (output_tokens >= 0),              -- candidatesTokenCount
  ADD COLUMN thoughts_tokens    INTEGER CHECK (thoughts_tokens >= 0),            -- thoughtsTokenCount
  ADD COLUMN model_version      TEXT CHECK (char_length(model_version) <= 100);  -- 응답 modelVersion

-- ============================================================
-- 3. credit_ledger (크레딧 원장). 버킷별 delta 합계 = profiles의 그 버킷 잔액
-- ============================================================
CREATE TABLE credit_ledger (
  id             BIGSERIAL PRIMARY KEY,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bucket         TEXT NOT NULL CHECK (bucket IN ('monthly', 'purchased')),
  delta          INTEGER NOT NULL CHECK (delta <> 0),
  balance_after  INTEGER NOT NULL CHECK (balance_after >= 0),                   -- 이 행 반영 뒤 그 버킷 잔액
  reason         TEXT NOT NULL CHECK (reason IN ('monthly_grant', 'monthly_expire', 'purchase', 'admin_adjust', 'reserve', 'settle', 'refund')),
  period         TEXT CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),            -- 월 지급·소멸의 대상 달(KST) 'YYYY-MM'
  job_id         UUID REFERENCES analysis_jobs(id) ON DELETE SET NULL,          -- reserve·settle·refund
  audit_id       BIGINT,                                                         -- admin_adjust → admin_audit.id (FK 없음)
  memo           TEXT NOT NULL DEFAULT '' CHECK (char_length(memo) <= 200),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((reason IN ('monthly_grant', 'monthly_expire')) = (period IS NOT NULL))
);
CREATE INDEX credit_ledger_user_idx ON credit_ledger (user_id, id DESC);
CREATE UNIQUE INDEX credit_ledger_period_uq ON credit_ledger (user_id, bucket, reason, period) WHERE period IS NOT NULL; -- 월 지급 중복 방지(cron 재시도)
CREATE UNIQUE INDEX credit_ledger_job_uq ON credit_ledger (job_id, bucket, reason) WHERE job_id IS NOT NULL;          -- 작업당 예약·정산·반환 한 번

-- ============================================================
-- 4. admin_audit (owner 관리 작업 기록). 계정 삭제 뒤에도 남아야 하므로 FK 없음
-- ============================================================
CREATE TABLE admin_audit (
  id              BIGSERIAL PRIMARY KEY,
  actor_id        UUID NOT NULL,                                  -- owner
  action          TEXT NOT NULL CHECK (action ~ '^[a-z_]{1,40}$'), -- tier_override, credit_adjust, creator_update, folder_*, report_resolve
  target_user_id  UUID,
  target_id       TEXT,                                           -- 폴더·신고 id 등
  before          JSONB,
  after           JSONB,
  reason          TEXT NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 200),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX admin_audit_created_idx ON admin_audit (created_at DESC);
CREATE INDEX admin_audit_target_idx ON admin_audit (target_user_id, created_at DESC) WHERE target_user_id IS NOT NULL;
