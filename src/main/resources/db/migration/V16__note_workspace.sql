-- NT-1: 학습 노트 워크스페이스(기능확장 D4). 첨부는 private 버킷 'takes'의 notes/{userId}/{docId}/{fileId}.{ext}(D7)
-- 명세: 개발산출물/명세/NT-1_구현명세.md §4

-- 1) 노트북(평면, N3). 무료는 행을 만들지 않는다(N2: folder_id NULL = 기본 노트북)
CREATE TABLE note_folders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  color       TEXT CHECK (color IS NULL OR color ~ '^[a-z0-9-]{1,20}$'),  -- 토큰 키만(색 값 아님). 목록은 NT-2 시안에서 정한다
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX note_folders_user_idx ON note_folders (user_id, sort_order, created_at);
CREATE TRIGGER note_folders_updated BEFORE UPDATE ON note_folders FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 2) 기존 AI 영상 노트도 노트북에 넣을 수 있게 칸 하나만 더한다(N1 A). 다른 칸·제약은 그대로
ALTER TABLE notes ADD COLUMN folder_id UUID REFERENCES note_folders(id) ON DELETE SET NULL;

-- 3) 자료 노트(document: PDF/이미지 열람·주석)와 블록 노트(block: 직접 작성)
CREATE TABLE note_docs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  folder_id   UUID REFERENCES note_folders(id) ON DELETE SET NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('document', 'block')),
  title       TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 300),
  body        JSONB NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(body) = 'object'),  -- 블록 문서. 서버는 모양을 해석하지 않는다(NT-3)
  rev         INTEGER NOT NULL DEFAULT 1 CHECK (rev >= 1),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX note_docs_user_folder_idx ON note_docs (user_id, folder_id, updated_at DESC);
CREATE TRIGGER note_docs_updated BEFORE UPDATE ON note_docs FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 4) 첨부 파일. 행이 CASCADE로 지워져도 스토리지 파일은 남으므로 서비스가 먼저 storage_trash에 넣는다(§7)
CREATE TABLE note_files (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  doc_id       UUID NOT NULL REFERENCES note_docs(id) ON DELETE CASCADE,
  storage      TEXT NOT NULL CHECK (storage IN ('supabase', 'drive')),
  storage_key  TEXT NOT NULL CHECK (char_length(storage_key) BETWEEN 5 AND 300),
  file_name    TEXT NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 200),
  mime         TEXT NOT NULL CHECK (mime IN ('application/pdf', 'image/png', 'image/jpeg', 'image/webp')),
  size_bytes   BIGINT NOT NULL CHECK (size_bytes > 0),
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX note_files_doc_idx ON note_files (doc_id, sort_order, created_at);
CREATE INDEX note_files_user_storage_idx ON note_files (user_id, storage);
CREATE UNIQUE INDEX note_files_supabase_key_uq ON note_files (storage_key) WHERE storage = 'supabase';

-- 5) 페이지 주석(D5). 이미지 파일은 page = 1. 좌표 모양은 NT-2가 정하고 서버는 크기·최상위 모양만 본다
CREATE TABLE note_annotations (
  file_id     UUID NOT NULL REFERENCES note_files(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  page        INTEGER NOT NULL CHECK (page BETWEEN 1 AND 2000),
  data        JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  rev         INTEGER NOT NULL DEFAULT 1 CHECK (rev >= 1),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (file_id, page)
);
CREATE TRIGGER note_annotations_updated BEFORE UPDATE ON note_annotations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
