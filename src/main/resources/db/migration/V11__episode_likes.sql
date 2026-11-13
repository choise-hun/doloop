-- CMR-4: 게시물(연습 기록 카드) 좋아요. 카운터 열 없이 행 수로 집계한다.
CREATE TABLE shared_practice_card_likes (
  card_id UUID NOT NULL REFERENCES shared_practice_cards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (card_id, user_id)
);
CREATE INDEX shared_practice_card_likes_user_idx ON shared_practice_card_likes (user_id);
