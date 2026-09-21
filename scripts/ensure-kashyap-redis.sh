#!/bin/bash
# ==============================================================================
# Kashyap Adhikari Family Tree Platform
# Script: ensure-kashyap-redis.sh
# Purpose: Ensures reproducible D: drive Redis cache/session storage & service readiness.
# Authority: Jyphra Technology Pvt. Ltd.
# ==============================================================================
set -euo pipefail

IMAGE_PATH="${KASHYAP_PG_IMAGE:-/mnt/d/Jyphra/pg_data/kashyap_pg.img}"
MOUNT_POINT="${KASHYAP_PG_MOUNT:-/mnt/kashyap_pg}"
REDIS_PORT="${REDIS_PORT:-6379}"
REDIS_CONF="${REDIS_CONF:-/etc/redis/redis.conf}"

echo "[ensure-kashyap-redis] Checking Redis storage prerequisites..."

# ------------------------------------------------------------------------------
# 1. Backing Image Existence & Canonical Resolution
# ------------------------------------------------------------------------------
if [ ! -e "$IMAGE_PATH" ]; then
    echo "FATAL: Storage backing image does not exist at: $IMAGE_PATH" >&2
    echo "Refusing to start. Storage image must exist on D: drive." >&2
    exit 1
fi

REAL_IMAGE_PATH=$(realpath -e "$IMAGE_PATH" 2>/dev/null || true)
if [ -z "$REAL_IMAGE_PATH" ] || [ ! -f "$REAL_IMAGE_PATH" ]; then
    echo "FATAL: Unable to resolve canonical path for backing image: $IMAGE_PATH" >&2
    exit 1
fi

# ------------------------------------------------------------------------------
# 2. Strict D: Mount Verification
# ------------------------------------------------------------------------------
IMAGE_FS_TARGET=$(findmnt -n -o TARGET -T "$REAL_IMAGE_PATH" 2>/dev/null || true)
IMAGE_FS_SOURCE=$(findmnt -n -o SOURCE -T "$REAL_IMAGE_PATH" 2>/dev/null || true)

IS_D_DRIVE=false
if [[ "$REAL_IMAGE_PATH" == "/mnt/d/"* ]] || [[ "$IMAGE_FS_TARGET" == "/mnt/d" ]] || [[ "$IMAGE_FS_SOURCE" =~ ^[Dd]: ]]; then
    if [[ "$IMAGE_FS_SOURCE" =~ ^[Dd]: ]] || [[ "$IMAGE_FS_TARGET" == "/mnt/d" ]]; then
        IS_D_DRIVE=true
    fi
fi

if [ "$IS_D_DRIVE" != "true" ]; then
    echo "FATAL: Backing image canonical path '$REAL_IMAGE_PATH' does not resolve under the D: drive mount." >&2
    echo "Detected mount target: '$IMAGE_FS_TARGET', source: '$IMAGE_FS_SOURCE'." >&2
    echo "Storage outside D: is strictly rejected." >&2
    exit 1
fi

echo "[ensure-kashyap-redis] Canonical backing image verified on D: drive: $REAL_IMAGE_PATH"

# ------------------------------------------------------------------------------
# 3. Mount Point Directory & Loop Mount Execution
# ------------------------------------------------------------------------------
mkdir -p "$MOUNT_POINT"

if ! mountpoint -q "$MOUNT_POINT"; then
    echo "[ensure-kashyap-redis] Mounting $REAL_IMAGE_PATH to $MOUNT_POINT..."
    mount -o loop "$REAL_IMAGE_PATH" "$MOUNT_POINT"
fi

REAL_MOUNT_POINT=$(realpath -e "$MOUNT_POINT")

# ------------------------------------------------------------------------------
# 4. Exact Canonical Backing-Path Verification
# ------------------------------------------------------------------------------
MOUNT_SOURCE=$(findmnt -n -o SOURCE "$REAL_MOUNT_POINT" 2>/dev/null || true)
if [ -z "$MOUNT_SOURCE" ]; then
    echo "FATAL: Could not determine mount source device for $REAL_MOUNT_POINT." >&2
    exit 1
fi

LOOP_BACKING=$(losetup -O BACK-FILE -n "$MOUNT_SOURCE" 2>/dev/null || true)
if [ -z "$LOOP_BACKING" ]; then
    LOOP_BACKING=$(losetup "$MOUNT_SOURCE" 2>/dev/null | sed -E 's/.*\((.*)\).*/\1/' || true)
fi

REAL_BACKING_FILE=$(realpath -e "$LOOP_BACKING" 2>/dev/null || true)

if [ "$REAL_BACKING_FILE" != "$REAL_IMAGE_PATH" ]; then
    echo "FATAL: Mount point $REAL_MOUNT_POINT loop backing mismatch!" >&2
    echo "Expected canonical image: $REAL_IMAGE_PATH" >&2
    echo "Actual device backing:   $REAL_BACKING_FILE" >&2
    exit 1
fi

echo "[ensure-kashyap-redis] Verified exact canonical backing: $REAL_BACKING_FILE -> $REAL_MOUNT_POINT"

# ------------------------------------------------------------------------------
# 5. Redis Data Directory Setup & Permissions
# ------------------------------------------------------------------------------
REDIS_DATA_DIR="$REAL_MOUNT_POINT/redis"
mkdir -p "$REDIS_DATA_DIR"
chown -R redis:redis "$REDIS_DATA_DIR" 2>/dev/null || chown -R 1000:1000 "$REDIS_DATA_DIR" 2>/dev/null || true
chmod 770 "$REDIS_DATA_DIR"

# ------------------------------------------------------------------------------
# 6. Verify Configured Redis Working Directory
# ------------------------------------------------------------------------------
if [ -f "$REDIS_CONF" ]; then
    CONFIGURED_DIR=$(grep -E '^\s*dir\s+' "$REDIS_CONF" | awk '{print $2}' | tr -d '"' | tr -d "'" || true)
    if [ -n "$CONFIGURED_DIR" ]; then
        REAL_CONFIG_DIR=$(realpath -m "$CONFIGURED_DIR")
        if [[ "$REAL_CONFIG_DIR" != "$REDIS_DATA_DIR"* ]]; then
            echo "FATAL: Configured Redis dir '$CONFIGURED_DIR' does not resolve inside D: mount '$REDIS_DATA_DIR'" >&2
            exit 1
        fi
        echo "[ensure-kashyap-redis] Verified configured Redis working directory inside D: mount: $REAL_CONFIG_DIR"
    fi
fi

# ------------------------------------------------------------------------------
# 7. Start / Ensure Redis Service is Running
# ------------------------------------------------------------------------------
if ! pgrep -f "redis-server" > /dev/null; then
    echo "[ensure-kashyap-redis] Starting Redis service..."
    if command -v systemctl > /dev/null && systemctl is-system-running > /dev/null 2>&1; then
        systemctl start redis-server || systemctl start redis || true
    elif [ -x /etc/init.d/redis-server ]; then
        /etc/init.d/redis-server start || true
    else
        su -s /bin/sh redis -c "/usr/bin/redis-server $REDIS_CONF" || /usr/bin/redis-server "$REDIS_CONF" &
    fi
    sleep 2
fi

# ------------------------------------------------------------------------------
# 8. Verify Active Running Redis Instance & Storage Directory
# ------------------------------------------------------------------------------
REDIS_PING=$(redis-cli -p "$REDIS_PORT" ping 2>/dev/null || true)
if [ "$REDIS_PING" != "PONG" ]; then
    echo "FATAL: Redis service ping failed on port $REDIS_PORT (Response: '$REDIS_PING')." >&2
    exit 1
fi

RUNNING_DIR=$(redis-cli -p "$REDIS_PORT" config get dir 2>/dev/null | tail -n 1 || true)
REAL_RUNNING_DIR=$(realpath -e "$RUNNING_DIR" 2>/dev/null || true)

if [[ "$REAL_RUNNING_DIR" != "$REAL_MOUNT_POINT"* ]]; then
    echo "FATAL: Active running Redis data directory '$RUNNING_DIR' does not resolve inside D: mount '$REAL_MOUNT_POINT'!" >&2
    exit 1
fi

echo "[ensure-kashyap-redis] Verified active running Redis data directory inside D: mount: $REAL_RUNNING_DIR"
echo "[ensure-kashyap-redis] SUCCESS: Redis server online on port $REDIS_PORT backed by D: drive storage."
exit 0
