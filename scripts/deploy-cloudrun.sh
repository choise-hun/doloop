#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Google Cloud Run 서비스, Job(analyze), IAM 권한, Cloud Scheduler 1분 크론 배포 스크립트
#
# 필요 환경변수:
#   GCP_PROJECT_ID       : GCP 프로젝트 ID (필수)
#   RUNTIME_SA_EMAIL     : Cloud Run 런타임 서비스 계정 이메일 (필수)
#   CRON_SA_EMAIL        : Cloud Scheduler OIDC 호출용 서비스 계정 이메일 (필수)
#   IMAGE_URI            : 배포할 컨테이너 이미지 URI ($1 인자로도 전달 가능)
#
# 선택 환경변수 (기본값 제공):
#   GCP_REGION           : 배포 리전 (기본: asia-northeast3)
#   CLOUD_RUN_SERVICE    : Cloud Run 서비스 이름 (기본: ulevelp)
#   CLOUD_RUN_JOB        : Cloud Run Job 이름 (기본: analyze)
#   SUPABASE_URL         : Supabase 프로젝트 URL (기본: https://vefrfhafmiiivpgjhqiu.supabase.co)
#   PUBLIC_APP_URL       : 공개 앱 기본 URL (기본: https://choise-hun.github.io/ULevelP/)
#   ALLOWED_ORIGINS      : CORS 허용 오리진 (기본: https://choise-hun.github.io,http://localhost:3000)
#   CRON_AUDIENCE        : OIDC 대상 (기본: 서비스 URL)
# ==============================================================================

IMAGE_URI="${1:-${IMAGE_URI:-}}"

if [ -z "${IMAGE_URI}" ]; then
  echo "ERROR: IMAGE_URI가 지정되지 않았습니다. 인자(\$1) 또는 환경변수 IMAGE_URI를 설정하세요." >&2
  exit 1
fi

if [ -z "${GCP_PROJECT_ID:-}" ]; then
  echo "ERROR: GCP_PROJECT_ID 환경변수가 설정되지 않았습니다." >&2
  exit 1
fi

if [ -z "${RUNTIME_SA_EMAIL:-}" ]; then
  echo "ERROR: RUNTIME_SA_EMAIL 환경변수가 설정되지 않았습니다." >&2
  exit 1
fi

if [ -z "${CRON_SA_EMAIL:-}" ]; then
  echo "ERROR: CRON_SA_EMAIL 환경변수가 설정되지 않았습니다." >&2
  exit 1
fi

GCP_REGION="${GCP_REGION:-asia-northeast3}"
CLOUD_RUN_SERVICE="${CLOUD_RUN_SERVICE:-ulevelp}"
CLOUD_RUN_JOB="${CLOUD_RUN_JOB:-analyze}"
SUPABASE_URL="${SUPABASE_URL:-https://vefrfhafmiiivpgjhqiu.supabase.co}"
PUBLIC_APP_URL="${PUBLIC_APP_URL:-https://choise-hun.github.io/ULevelP/}"
ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-https://choise-hun.github.io,http://localhost:3000}"

echo "=============================================================================="
echo "Google Cloud Run 배포 시작"
echo "  Project  : ${GCP_PROJECT_ID}"
echo "  Region   : ${GCP_REGION}"
echo "  Service  : ${CLOUD_RUN_SERVICE}"
echo "  Job      : ${CLOUD_RUN_JOB}"
echo "  Image    : ${IMAGE_URI}"
echo "  Runtime  : ${RUNTIME_SA_EMAIL}"
echo "  Cron SA  : ${CRON_SA_EMAIL}"
echo "=============================================================================="

# 1. Cloud Run Job 'analyze' 생성/갱신 (KC-D6)
echo "==> [1/4] Cloud Run Job '${CLOUD_RUN_JOB}' 구성"
if gcloud run jobs describe "${CLOUD_RUN_JOB}" --region="${GCP_REGION}" --project="${GCP_PROJECT_ID}" >/dev/null 2>&1; then
  echo "--> 기존 Job '${CLOUD_RUN_JOB}' 갱신"
  gcloud run jobs update "${CLOUD_RUN_JOB}" \
    --project="${GCP_PROJECT_ID}" \
    --region="${GCP_REGION}" \
    --image="${IMAGE_URI}" \
    --service-account="${RUNTIME_SA_EMAIL}" \
    --task-timeout=3600s \
    --max-retries=0 \
    --cpu=1 \
    --memory=1Gi \
    --set-secrets="DATABASE_URL=DATABASE_URL:latest,APP_MASTER_KEY=APP_MASTER_KEY:latest"
else
  echo "--> 신규 Job '${CLOUD_RUN_JOB}' 생성"
  gcloud run jobs create "${CLOUD_RUN_JOB}" \
    --project="${GCP_PROJECT_ID}" \
    --region="${GCP_REGION}" \
    --image="${IMAGE_URI}" \
    --service-account="${RUNTIME_SA_EMAIL}" \
    --task-timeout=3600s \
    --max-retries=0 \
    --cpu=1 \
    --memory=1Gi \
    --set-secrets="DATABASE_URL=DATABASE_URL:latest,APP_MASTER_KEY=APP_MASTER_KEY:latest"
fi

# 2. 런타임 서비스 계정(RUNTIME_SA_EMAIL)의 Job 실행 IAM 권한 부여 (docs/03-api-spec.md 7.3절)
echo "==> [2/4] Job '${CLOUD_RUN_JOB}'에 대한 roles/run.developer 권한 부여"
gcloud run jobs add-iam-policy-binding "${CLOUD_RUN_JOB}" \
  --project="${GCP_PROJECT_ID}" \
  --region="${GCP_REGION}" \
  --member="serviceAccount:${RUNTIME_SA_EMAIL}" \
  --role="roles/run.developer" \
  --quiet

# 3. Cloud Run 서비스 'ulevelp' 배포 (KC-D1, KC-D3)
ANALYZE_JOB_URI="https://run.googleapis.com/v2/projects/${GCP_PROJECT_ID}/locations/${GCP_REGION}/jobs/${CLOUD_RUN_JOB}:run"
echo "==> [3/4] Cloud Run 서비스 '${CLOUD_RUN_SERVICE}' 배포 (ANALYZE_JOB_URI=${ANALYZE_JOB_URI})"

# 기존 서비스 URL이 있다면 CRON_AUDIENCE 기본값으로 참조
EXISTING_URL=$(gcloud run services describe "${CLOUD_RUN_SERVICE}" --region="${GCP_REGION}" --project="${GCP_PROJECT_ID}" --format='value(status.url)' 2>/dev/null || true)
INITIAL_CRON_AUDIENCE="${CRON_AUDIENCE:-${EXISTING_URL:-https://${CLOUD_RUN_SERVICE}-${GCP_REGION}.a.run.app}}"

gcloud run deploy "${CLOUD_RUN_SERVICE}" \
  --project="${GCP_PROJECT_ID}" \
  --region="${GCP_REGION}" \
  --image="${IMAGE_URI}" \
  --service-account="${RUNTIME_SA_EMAIL}" \
  --allow-unauthenticated \
  --port=3000 \
  --min-instances=0 \
  --max-instances=1 \
  --cpu-boost \
  --timeout=300s \
  --set-env-vars="SUPABASE_URL=${SUPABASE_URL},PUBLIC_APP_URL=${PUBLIC_APP_URL},ALLOWED_ORIGINS=${ALLOWED_ORIGINS},CRON_AUDIENCE=${INITIAL_CRON_AUDIENCE},CRON_SA_EMAIL=${CRON_SA_EMAIL},CLOUD_RUN_ANALYZE_JOB_URI=${ANALYZE_JOB_URI}" \
  --set-secrets="DATABASE_URL=DATABASE_URL:latest,SUPABASE_SECRET_KEY=SUPABASE_SECRET_KEY:latest,APP_MASTER_KEY=APP_MASTER_KEY:latest"

SERVICE_URL=$(gcloud run services describe "${CLOUD_RUN_SERVICE}" --region="${GCP_REGION}" --project="${GCP_PROJECT_ID}" --format='value(status.url)')
echo "--> 배포된 서비스 URL: ${SERVICE_URL}"

# 만약 초기 CRON_AUDIENCE와 실제 서비스 URL이 다르면 CRON_AUDIENCE 갱신
if [ "${INITIAL_CRON_AUDIENCE}" != "${SERVICE_URL}" ] && [ -z "${CRON_AUDIENCE:-}" ]; then
  echo "--> CRON_AUDIENCE를 배포된 서비스 URL(${SERVICE_URL})로 갱신"
  gcloud run services update "${CLOUD_RUN_SERVICE}" \
    --project="${GCP_PROJECT_ID}" \
    --region="${GCP_REGION}" \
    --update-env-vars="CRON_AUDIENCE=${SERVICE_URL}"
fi

# 4. Cloud Scheduler 1분 크론 'ulevelp-notion-push' 생성/갱신 (KC-D7)
SCHEDULER_JOB_NAME="ulevelp-notion-push"
CRON_URI="${SERVICE_URL}/internal/cron/notion-push"
echo "==> [4/4] Cloud Scheduler 크론 '${SCHEDULER_JOB_NAME}' 구성 (URI: ${CRON_URI})"

if gcloud scheduler jobs describe "${SCHEDULER_JOB_NAME}" --location="${GCP_REGION}" --project="${GCP_PROJECT_ID}" >/dev/null 2>&1; then
  echo "--> 기존 Scheduler Job '${SCHEDULER_JOB_NAME}' 갱신"
  gcloud scheduler jobs update http "${SCHEDULER_JOB_NAME}" \
    --project="${GCP_PROJECT_ID}" \
    --location="${GCP_REGION}" \
    --schedule="* * * * *" \
    --uri="${CRON_URI}" \
    --http-method=POST \
    --oidc-service-account-email="${CRON_SA_EMAIL}" \
    --oidc-token-audience="${SERVICE_URL}"
else
  echo "--> 신규 Scheduler Job '${SCHEDULER_JOB_NAME}' 생성"
  gcloud scheduler jobs create http "${SCHEDULER_JOB_NAME}" \
    --project="${GCP_PROJECT_ID}" \
    --location="${GCP_REGION}" \
    --schedule="* * * * *" \
    --uri="${CRON_URI}" \
    --http-method=POST \
    --oidc-service-account-email="${CRON_SA_EMAIL}" \
    --oidc-token-audience="${SERVICE_URL}"
fi

echo "=============================================================================="
echo "배포 완료!"
echo "  서비스 URL: ${SERVICE_URL}"
echo "  헬스체크 : curl -fsS ${SERVICE_URL}/api/health"
echo "=============================================================================="

