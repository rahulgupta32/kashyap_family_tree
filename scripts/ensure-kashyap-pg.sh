#!/bin/bash
# ==============================================================================
# Kashyap Adhikari Family Tree Platform
# Script: ensure-kashyap-pg.sh
# Purpose: Ensures reproducible D: drive PostgreSQL storage mount & cluster readiness.
# Authority: Jyphra Technology Pvt. Ltd.
# ==============================================================================
set -euo pipefail

IMAGE_PATH="${KASHYAP_PG_IMAGE:-/mnt/d/Jyphra/pg_data/kashyap_pg.img}"
MOUNT_POINT="${KASHYAP_PG_MOUNT:-/mnt/kashyap_pg}"
PG_VERSION="16"
PG_CLUSTER="kashyap"
PG_PORT="5433"

echo "[ensure-kashyap-pg] Checking PostgreSQL storage prerequisites..."

# 1. Verify that the image file exists on D: drive
if [ ! -f "$IMAGE_PATH" ]; then
    echo "FATAL: PostgreSQL backing image not found on D: drive at: $IMAGE_PATH" >&2
    echo "Refusing to start. Storage image must exist on D: drive." >&2
    exit 1
fi

# 2. Ensure mount point directory exists
mkdir -p "$MOUNT_POINT"

# 3. Mount if not currently mounted
if ! mountpoint -q "$MOUNT_POINT"; then
    echo "[ensure-kashyap-pg] Mounting $IMAGE_PATH to $MOUNT_POINT..."
    mount -o loop "$IMAGE_PATH" "$MOUNT_POINT"
fi

# 4. Strict backing verification: Ensure mount is backed by the expected D: drive image file
MOUNT_SOURCE=$(findmnt -n -o SOURCE "$MOUNT_POINT" 2>/dev/null || true)
if [ -z "$MOUNT_SOURCE" ]; then
    echo "FATAL: Could not determine mount source device for $MOUNT_POINT." >&2
    exit 1
fi

BACKING_FILE=$(losetup -O BACK-FILE -n "$MOUNT_SOURCE" 2>/dev/null || true)
if [ -z "$BACKING_FILE" ]; then
    BACKING_FILE=$(losetup "$MOUNT_SOURCE" 2>/dev/null || true)
fi

if [[ "$BACKING_FILE" != *"kashyap_pg.img"* ]]; then
    echo "FATAL: Mount point $MOUNT_POINT is NOT backed by $IMAGE_PATH!" >&2
    echo "Detected backing: $BACKING_FILE" >&2
    echo "Refusing to start. Preventing accidental writes to C:-backed filesystem." >&2
    exit 1
fi

echo "[ensure-kashyap-pg] Verified mount $MOUNT_POINT backed by: $BACKING_FILE"

# 5. Verify PostgreSQL cluster data directory exists on the mounted filesystem
DATA_DIR="$MOUNT_POINT/pgdata"
if [ ! -d "$DATA_DIR" ] || [ ! -f "$DATA_DIR/PG_VERSION" ]; then
    echo "FATAL: PostgreSQL data directory not found or uninitialized at: $DATA_DIR" >&2
    echo "Never auto-initializing in missing mount directory to prevent data loss." >&2
    exit 1
fi

# 6. Ensure logs directory exists on D: storage
LOG_DIR="$MOUNT_POINT/logs"
mkdir -p "$LOG_DIR"
chown -R postgres:postgres "$LOG_DIR"
chmod 750 "$LOG_DIR"

# Ensure log symlink redirects legacy /var/log/postgresql path to D: storage
LOG_FILE_TARGET="$LOG_DIR/postgresql-${PG_VERSION}-${PG_CLUSTER}.log"
touch "$LOG_FILE_TARGET"
chown postgres:postgres "$LOG_FILE_TARGET"
if [ -L "/var/log/postgresql/postgresql-${PG_VERSION}-${PG_CLUSTER}.log" ] || [ ! -e "/var/log/postgresql/postgresql-${PG_VERSION}-${PG_CLUSTER}.log" ]; then
    rm -f "/var/log/postgresql/postgresql-${PG_VERSION}-${PG_CLUSTER}.log"
    ln -sf "$LOG_FILE_TARGET" "/var/log/postgresql/postgresql-${PG_VERSION}-${PG_CLUSTER}.log"
fi

# 7. Start PostgreSQL cluster if not online
if ! pg_lsclusters | grep -q "${PG_VERSION}\s\+${PG_CLUSTER}\s\+${PG_PORT}\s\+online"; then
    echo "[ensure-kashyap-pg] Starting PostgreSQL cluster ${PG_VERSION}/${PG_CLUSTER}..."
    pg_ctlcluster "$PG_VERSION" "$PG_CLUSTER" start
fi

# 8. Verify cluster is ready and online
if ! pg_lsclusters | grep -q "${PG_VERSION}\s\+${PG_CLUSTER}\s\+${PG_PORT}\s\+online"; then
    echo "FATAL: PostgreSQL cluster ${PG_VERSION}/${PG_CLUSTER} failed to come online." >&2
    exit 1
fi

echo "[ensure-kashyap-pg] SUCCESS: PostgreSQL cluster ${PG_VERSION}/${PG_CLUSTER} online on port ${PG_PORT} backed by D: drive storage."
