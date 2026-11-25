-- TB-1: 곡 종류(유튜브 | TAB 파일). TAB 파일은 private 버킷 'takes'의 tabs/{userId}/{songId}.{ext}에 둔다(기능확장 D7)
-- 명세: 개발산출물/명세/TB-1_구현명세.md §4
ALTER TABLE songs
  ADD COLUMN media_type      TEXT NOT NULL DEFAULT 'youtube' CHECK (media_type IN ('youtube', 'tab')),
  ADD COLUMN tab_storage_key TEXT,
  ADD COLUMN tab_file_name   TEXT CHECK (tab_file_name IS NULL OR char_length(tab_file_name) BETWEEN 1 AND 200),
  ADD COLUMN tab_file_size   BIGINT CHECK (tab_file_size IS NULL OR tab_file_size > 0),
  ADD COLUMN tab_format      TEXT CHECK (tab_format IS NULL OR tab_format IN ('gp', 'xml', 'mxl'));

-- 형식 CHECK(11자 영상 id)는 그대로 둔다. NULL이면 통과한다
ALTER TABLE songs ALTER COLUMN video_id DROP NOT NULL;

-- 유튜브 곡은 video_id가 있고 tab_* 칸이 비어 있다. TAB 곡은 그 반대다
ALTER TABLE songs ADD CONSTRAINT songs_media_shape_check CHECK (
  (media_type = 'youtube' AND video_id IS NOT NULL
     AND tab_storage_key IS NULL AND tab_file_name IS NULL AND tab_file_size IS NULL AND tab_format IS NULL)
  OR
  (media_type = 'tab' AND video_id IS NULL
     AND tab_storage_key IS NOT NULL AND tab_file_name IS NOT NULL AND tab_file_size IS NOT NULL AND tab_format IS NOT NULL)
);

-- (user_id, video_id) 유일성은 유튜브 곡에만 건다. 기존 제약 이름은 V1 UNIQUE의 자동 이름이다
-- 이름이 다르면 일부러 실패시킨다(유일성이 두 개 남는 것보다 안전하다)
ALTER TABLE songs DROP CONSTRAINT songs_user_id_video_id_key;
CREATE UNIQUE INDEX songs_user_video_uq ON songs (user_id, video_id) WHERE video_id IS NOT NULL;

CREATE UNIQUE INDEX songs_tab_storage_key_uq ON songs (tab_storage_key) WHERE tab_storage_key IS NOT NULL;
