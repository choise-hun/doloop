-- V6__remove_byok_gemini.sql
-- M1-3b: Gemini는 서버 키 + 선불 크레딧으로 바뀐다(개발산출물/결과/M1-1_스키마설계.md §0 A11·§7, 결과/M1-3b_크레딧서버.md).
-- 사용자별 Gemini 키(BYOK)를 지우고 integrations.provider는 notion만 받는다

DELETE FROM integrations WHERE provider = 'gemini';

ALTER TABLE integrations DROP CONSTRAINT integrations_provider_check;
ALTER TABLE integrations ADD CONSTRAINT integrations_provider_check CHECK (provider IN ('notion'));
