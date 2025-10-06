#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

# Load env
if [ ! -f kube-env ]; then
  echo "Missing kube-env. Copy kube-env.example to kube-env and fill values." >&2
  exit 1
fi
set -o allexport; source kube-env; set +o allexport

REGISTRY="${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REPO}"
KNS="${NAMESPACE:-dtp}"

need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing: $1" >&2; exit 1; }; }
need gcloud; need kubectl; need docker
ENV_SUB="envsubst" # GNU envsubst (gettext). On mac: brew install gettext && export PATH="/usr/local/opt/gettext/bin:$PATH"

usage() {
  cat <<EOF
Usage: $(basename "$0") <bootstrap|build-push|deploy|migrate|update-images|status|backup-now|delete>

Commands:
  bootstrap     Create APIs, Artifact Registry, 1-node GKE, label node
  build-push    Build & push backend/ui images to Artifact Registry
  deploy        Apply StorageClass, namespace, secrets, all services, ingress/LB, backups
  migrate       Run Django migrations and optional createsuperuser
  update-images Roll backend/ui to new IMAGE_TAG
  status        Show pods/services/ingress + handy endpoints
  backup-now    Trigger immediate DB backups (requires GCS_BUCKET)
  delete        Delete namespace; optionally delete cluster
EOF
}

bootstrap() {
  gcloud config set project "$PROJECT_ID"
  gcloud services enable container.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com

  if ! gcloud artifacts repositories describe "$ARTIFACT_REPO" --location "$REGION" >/dev/null 2>&1; then
    gcloud artifacts repositories create "$ARTIFACT_REPO" --repository-format=docker --location "$REGION"
  fi
  gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

  if ! gcloud container clusters describe "$CLUSTER_NAME" --region "$REGION" >/dev/null 2>&1; then
    gcloud container clusters create "$CLUSTER_NAME" \
      --region "$REGION" --num-nodes 1 \
      --machine-type "$NODE_MACHINE_TYPE" \
      --disk-type "$NODE_DISK_TYPE" \
      --disk-size "$NODE_DISK_SIZE_GB" \
      --enable-autorepair --no-enable-autoupgrade
  fi
  gcloud container clusters get-credentials "$CLUSTER_NAME" --region "$REGION"

  # label single node
  NODE="$(kubectl get nodes -o name | head -n1 | cut -d/ -f2)"
  kubectl label node "$NODE" role=dtp-core --overwrite
}

build_push() {
  gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

  # pick git sha if available
  if [ "${IMAGE_TAG}" = "local-dev" ] && command -v git >/dev/null 2>&1 && [ -d "${REPO_DIR}/.git" ]; then
    IMAGE_TAG="$(git -C "${REPO_DIR}" rev-parse --short HEAD)"
  fi

  echo "[Build] backend: ${REGISTRY}/dtp-backend:${IMAGE_TAG}"
  docker build -t "${REGISTRY}/dtp-backend:${IMAGE_TAG}" "${BACKEND_PATH}"
  docker push "${REGISTRY}/dtp-backend:${IMAGE_TAG}"

  echo "[Build] ui: ${REGISTRY}/dtp-ui:${IMAGE_TAG}"
  docker build -t "${REGISTRY}/dtp-ui:${IMAGE_TAG}" "${UI_PATH}"
  docker push "${REGISTRY}/dtp-ui:${IMAGE_TAG}"
}

apply_file() {
  local tpl="$1"
  # shellcheck disable=SC2016
  ${ENV_SUB} <"$tpl" | kubectl apply -f -
}

deploy_all() {
  kubectl get ns "$KNS" >/dev/null 2>&1 || kubectl create ns "$KNS"

  apply_file k8s/storageclass-pd-ssd.yaml
  apply_file k8s/secrets.yaml
  apply_file k8s/postgres.yaml
  apply_file k8s/influxdb.yaml
  apply_file k8s/neo4j.yaml
  apply_file k8s/minio.yaml
  apply_file k8s/mosquitto.yaml
  apply_file k8s/backend.yaml
  apply_file k8s/ui.yaml

  if [ -n "${DOMAIN}" ]; then
    apply_file k8s/ingress.yaml
  else
    apply_file k8s/lb-fallback.yaml
  fi

  if [ -n "${GCS_BUCKET:-}" ]; then
    apply_file k8s/cron-backups.yaml
  fi
}

migrate() {
  kubectl -n "$KNS" rollout status deploy/dtp-backend
  kubectl -n "$KNS" exec deploy/dtp-backend -- python manage.py migrate
  echo "Create superuser now? (y/N)"
  read -r ans
  if [[ "$ans" =~ ^[Yy]$ ]]; then
    kubectl -n "$KNS" exec -it deploy/dtp-backend -- python manage.py createsuperuser || true
  fi
}

update_images() {
  kubectl -n "$KNS" set image deploy/dtp-backend backend="${REGISTRY}/dtp-backend:${IMAGE_TAG}"
  kubectl -n "$KNS" set image deploy/dtp-ui ui="${REGISTRY}/dtp-ui:${IMAGE_TAG}"
  kubectl -n "$KNS" rollout status deploy/dtp-backend
  kubectl -n "$KNS" rollout status deploy/dtp-ui
}

status() {
  echo "== Pods =="
  kubectl -n "$KNS" get pods -o wide
  echo
  echo "== Services =="
  kubectl -n "$KNS" get svc
  echo
  echo "== Ingress =="
  kubectl -n "$KNS" get ingress || true
  echo
  if [ -z "${DOMAIN}" ]; then
    echo "UI/API exposed via LoadBalancers (see External-IP above). MQTT on 'mqtt' Service."
  else
    echo "Point A record for ${DOMAIN} to the Ingress IP once allocated."
  fi
}

backup_now() {
  if [ -z "${GCS_BUCKET:-}" ]; then
    echo "Set GCS_BUCKET=gs://bucket to trigger backups." >&2
    exit 1
  fi
  kubectl -n "$KNS" create job --from=cronjob/pg-backup "pg-backup-now-$(date +%s)" || true
  echo "Influx/Neo4j jobs are placeholders—customize as needed."
}

delete_all() {
  read -r -p "Delete namespace ${KNS}? [y/N] " a
  if [[ "$a" =~ ^[Yy]$ ]]; then
    kubectl delete ns "$KNS" --ignore-not-found
  fi
  read -r -p "Also delete cluster ${CLUSTER_NAME}? [y/N] " b
  if [[ "$b" =~ ^[Yy]$ ]]; then
    gcloud container clusters delete "$CLUSTER_NAME" --region "$REGION" --quiet || true
  fi
}

cmd="${1:-}"; case "$cmd" in
  bootstrap) bootstrap ;;
  build-push) build_push ;;
  deploy) deploy_all ;;
  migrate) migrate ;;
  update-images) update_images ;;
  status) status ;;
  backup-now) backup_now ;;
  delete) delete_all ;;
  *) usage; exit 1 ;;
esac
