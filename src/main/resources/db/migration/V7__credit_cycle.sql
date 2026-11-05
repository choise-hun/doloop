-- V7__credit_cycle.sql
-- M1-3d: 월 지급을 "매월 1일"에서 "유료 전환 시점 즉시 지급 + 그 시점부터 30일마다 충전"으로 바꾼다
-- (개발산출물/진행_티어크레딧.md §3-1, 결과/M1-3d_크레딧주기.md).
-- 주기가 계정마다 다르므로 원장 period는 "주기 시작 시각"(KST, 분 단위 'YYYY-MM-DDTHH:MM')을 키로 쓴다.
-- 배포 시점에 이미 유료인 계정은 주기가 없다(NULL) → 다음 cron(매시)이 그 시각에 주기를 시작해 지급한다

ALTER TABLE profiles
  ADD COLUMN credit_cycle_next_at TIMESTAMPTZ,                                              -- 다음 충전 시각. NULL = 주기 없음
  ADD COLUMN credit_cycle_tier    TEXT CHECK (credit_cycle_tier IN ('pro', 'pro_plus')),    -- 이번 주기에 지급한 가장 높은 티어(업그레이드 차액 계산)
  ADD CONSTRAINT profiles_credit_cycle_check CHECK ((credit_cycle_next_at IS NULL) = (credit_cycle_tier IS NULL));

-- period: 옛 'YYYY-MM'(M1-3b, 운영 배포 전) 또는 주기 키 'YYYY-MM-DDTHH:MM'
ALTER TABLE credit_ledger DROP CONSTRAINT credit_ledger_period_check;
ALTER TABLE credit_ledger ADD CONSTRAINT credit_ledger_period_check
  CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9])?$');

-- reason: monthly_topup(Pro → Pro+ 업그레이드 차액) 추가. 주기 사유 셋은 period가 있어야 한다
ALTER TABLE credit_ledger DROP CONSTRAINT credit_ledger_reason_check;
ALTER TABLE credit_ledger ADD CONSTRAINT credit_ledger_reason_check
  CHECK (reason IN ('monthly_grant', 'monthly_expire', 'monthly_topup', 'purchase', 'admin_adjust', 'reserve', 'settle', 'refund'));
ALTER TABLE credit_ledger DROP CONSTRAINT credit_ledger_check;
ALTER TABLE credit_ledger ADD CONSTRAINT credit_ledger_period_reason_check
  CHECK ((reason IN ('monthly_grant', 'monthly_expire', 'monthly_topup')) = (period IS NOT NULL));
