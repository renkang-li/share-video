#!/usr/bin/env bash
set -euo pipefail

APP_NAME="share-video"
IMAGE_NAME="share-video:latest"
PORT="8078"
HEALTH_URL="http://127.0.0.1:8078/"
FORCE="false"

if [[ "${1:-}" == "--force" ]]; then
  FORCE="true"
fi

cd "$(dirname "$0")"
mkdir -p shared-videos

echo "==> Fetching latest code"
git pull --ff-only

echo "==> Checking active connections"
if ss -tnp | rg ":${PORT}\\b" >/tmp/${APP_NAME}-connections.txt; then
  cat /tmp/${APP_NAME}-connections.txt
  if [[ "$FORCE" != "true" ]]; then
    echo "Active connections found. Re-run with ./deploy.sh --force to deploy anyway."
    exit 1
  fi
fi

echo "==> Building image"
docker build -t "$IMAGE_NAME" .

if docker ps -a --format '{{.Names}}' | rg "^${APP_NAME}$" >/dev/null; then
  echo "==> Replacing container"
  docker stop "$APP_NAME"
  docker rm "$APP_NAME"
else
  echo "==> Starting new container"
fi

docker run -d --name "$APP_NAME" --restart unless-stopped \
  -p "127.0.0.1:${PORT}:${PORT}" \
  -v "$(pwd)/shared-videos:/app/shared-videos" \
  -e "VIDEO_DIR=/app/shared-videos" \
  "$IMAGE_NAME"

echo "==> Container status"
docker ps --filter "name=${APP_NAME}" --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}'

echo "==> Health check"
for attempt in $(seq 1 10); do
  if curl -fsSI --max-time 20 "$HEALTH_URL" >/tmp/${APP_NAME}-health.txt; then
    sed -n '1,8p' /tmp/${APP_NAME}-health.txt
    break
  fi

  if [[ "$attempt" == "10" ]]; then
    cat /tmp/${APP_NAME}-health.txt 2>/dev/null || true
    echo "Health check failed after ${attempt} attempts."
    exit 1
  fi

  echo "Health check failed, retrying (${attempt}/10)..."
  sleep 2
done

echo "==> Recent logs"
docker logs --tail 30 "$APP_NAME"

echo "==> Deployed successfully"
