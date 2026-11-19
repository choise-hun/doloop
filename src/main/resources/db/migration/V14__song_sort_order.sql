-- SL-2 ⑥: 곡마다 순서 1개(D5). 작은 값이 위. 읽기 순서 = sort_order ASC, created_at DESC, id ASC
ALTER TABLE songs ADD COLUMN sort_order INTEGER;

-- 기존 곡: 지금 목록 순서(옛 LIST_ORDER: 상태 → 마지막 연습일 최근 → 수정 최근) 그대로 0,1,2…
-- updated_at을 건드리지 않게 트리거를 잠시 끈다(같은 트랜잭션 안)
ALTER TABLE songs DISABLE TRIGGER songs_updated;
UPDATE songs s SET sort_order = r.rn
FROM (
  SELECT id, (ROW_NUMBER() OVER (
    PARTITION BY user_id
    ORDER BY CASE status WHEN 'practicing' THEN 0 WHEN 'paused' THEN 1 WHEN 'done' THEN 2 ELSE 99 END,
             last_date DESC NULLS LAST, updated_at DESC, id
  ) - 1)::int AS rn
  FROM songs
) r
WHERE s.id = r.id;
ALTER TABLE songs ENABLE TRIGGER songs_updated;

ALTER TABLE songs ALTER COLUMN sort_order SET NOT NULL;
CREATE INDEX songs_user_sort_idx ON songs (user_id, sort_order);

-- 새 곡(E2 맨 위): 값을 안 주면 그 사용자 최솟값 - 1. 삽입 경로 여러 곳을 고치지 않고 한 곳에서 처리
CREATE OR REPLACE FUNCTION songs_default_sort_order() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.sort_order IS NULL THEN
    SELECT COALESCE(MIN(sort_order), 0) - 1 INTO NEW.sort_order FROM songs WHERE user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER songs_sort_order_default BEFORE INSERT ON songs
  FOR EACH ROW EXECUTE FUNCTION songs_default_sort_order();
