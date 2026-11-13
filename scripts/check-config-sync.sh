#!/usr/bin/env bash
# 이 저장소의 규칙 문서(원본)와 config 저장소 보관본이 같은지 대조한다.
#   bash scripts/check-config-sync.sh          # 차이 보기 (차이가 있으면 종료 코드 1)
#   bash scripts/check-config-sync.sh --copy   # 원본 → 보관본 복사 (커밋·push는 ~/config에서 따로)
# 원본은 항상 이 저장소다. 보관본을 먼저 고치지 않는다.
# docs/rules/frontend-layout.md 는 config 쪽이 여러 프로젝트용 범용판이라 대조하지 않는다.
set -u
CONFIG="${CONFIG_DIR:-$HOME/config}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODE="${1:-check}"

if [ ! -d "$CONFIG/ULevelP/rules" ]; then
  echo "config 저장소가 없음: $CONFIG — 대조를 건너뜀"
  exit 0
fi

# "원본(저장소 기준 경로)|보관본(config 기준 경로)"
PAIRS='CLAUDE.md|ULevelP/rules/CLAUDE.md.template
AGENTS.md|ULevelP/rules/AGENTS.md.template
GEMINI.md|ULevelP/rules/GEMINI.md.template
docs/문서_운영.md|ULevelP/rules/문서_운영.md.template
개발산출물/협업_시니어주니어.md|ULevelP/rules/협업_시니어주니어.md.template
docs/rules/frontend-design.md|ULevelP/rules/frontend-design.md.template
개발산출물/프롬프트_템플릿_4단계.md|ULevelP/prompts/프롬프트_템플릿_4단계.md
docs/rules/backend-kotlin.md|rules/backend-kotlin.md
docs/rules/frontend-state.md|rules/frontend-state.md
docs/rules/testing-security.md|rules/testing-security.md'

diffs=0
while IFS='|' read -r src dst; do
  [ -n "$src" ] || continue
  if [ "$MODE" = "--copy" ]; then
    mkdir -p "$(dirname "$CONFIG/$dst")"
    cp "$ROOT/$src" "$CONFIG/$dst"
    echo "복사  $src → $dst"
  elif [ ! -f "$CONFIG/$dst" ]; then
    echo "없음  $dst"
    diffs=$((diffs + 1))
  elif cmp -s "$ROOT/$src" "$CONFIG/$dst"; then
    echo "같음  $src"
  else
    echo "다름  $src ↔ $dst"
    diffs=$((diffs + 1))
  fi
done <<EOF
$PAIRS
EOF

if [ "$MODE" != "--copy" ]; then
  echo "차이 ${diffs}건"
  [ "$diffs" -eq 0 ]
fi
