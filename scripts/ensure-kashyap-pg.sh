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

# ------------------------------------------------------------------------------
# 1. Backing Image Existence & Canonical Resolution
# ------------------------------------------------------------------------------
if [ ! -e "$IMAGE_PATH" ]; then
    echo "FATAL: PostgreSQL backing image does not exist at: $IMAGE_PATH" >&2
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
# Confirm the expected image actually resolves under the D: mount.
# Reject a same-named image elsewhere or a symlink resolving outside D:.
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
    echo "Storage outside D: is strictly rejected. Same-named images on C: or symlinks pointing outside D: are prohibited." >&2
    exit 1
fi

echo "[ensure-kashyap-pg] Canonical backing image verified on D: drive: $REAL_IMAGE_PATH"

# ------------------------------------------------------------------------------
# 3. Mount Point Directory & Loop Mount Execution
# ------------------------------------------------------------------------------
mkdir -p "$MOUNT_POINT"

if ! mountpoint -q "$MOUNT_POINT"; then
    echo "[ensure-kashyap-pg] Mounting $REAL_IMAGE_PATH to $MOUNT_POINT..."
    mount -o loop "$REAL_IMAGE_PATH" "$MOUNT_POINT"
fi

REAL_MOUNT_POINT=$(realpath -e "$MOUNT_POINT")

# ------------------------------------------------------------------------------
# 4. Exact Canonical Backing-Path Verification (No Substring Matching)
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

# EXACT string equality check against canonical expected image
if [ "$REAL_BACKING_FILE" != "$REAL_IMAGE_PATH" ]; then
    echo "FATAL: Mount point $REAL_MOUNT_POINT loop backing mismatch!" >&2
    echo "Expected canonical image: $REAL_IMAGE_PATH" >&2
    echo "Actual device backing:   $REAL_BACKING_FILE" >&2
    echo "Refusing to start. Substring match disabled; exact canonical path match required." >&2
    exit 1
fi

echo "[ensure-kashyap-pg] Verified exact canonical backing: $REAL_BACKING_FILE -> $REAL_MOUNT_POINT"

# ------------------------------------------------------------------------------
# 5. Mandatory Configured Data Directory Verification (Pre-Cluster Start)
# ------------------------------------------------------------------------------
DATA_DIR="$REAL_MOUNT_POINT/pgdata"
if [ ! -d "$DATA_DIR" ] || [ ! -f "$DATA_DIR/PG_VERSION" ]; then
    echo "FATAL: PostgreSQL data directory not found or uninitialized at: $DATA_DIR" >&2
    echo "Never auto-initializing in missing mount directory to prevent data loss." >&2
    exit 1
fi

# Verify configured data_directory in PostgreSQL cluster configuration before starting cluster
RAW_CONF_OUTPUT=""
if [ -n "${PG_CONFTOOL_CMD:-}" ]; then
    if ! RAW_CONF_OUTPUT=$($PG_CONFTOOL_CMD 2>&1); then
        echo "FATAL: pg_conftool command failed to retrieve data_directory for cluster ${PG_VERSION}/${PG_CLUSTER}:" >&2
        echo "$RAW_CONF_OUTPUT" >&2
        exit 1
    fi
else
    if ! RAW_CONF_OUTPUT=$(pg_conftool "$PG_VERSION" "$PG_CLUSTER" show data_directory 2>&1); then
        echo "FATAL: pg_conftool command failed to retrieve data_directory for cluster ${PG_VERSION}/${PG_CLUSTER}:" >&2
        echo "$RAW_CONF_OUTPUT" >&2
        exit 1
    fi
fi

if [ -z "$RAW_CONF_OUTPUT" ]; then
    echo "FATAL: pg_conftool returned empty output when querying data_directory for cluster ${PG_VERSION}/${PG_CLUSTER}." >&2
    exit 1
fi

CONFIGURED_DATA_DIR=$(echo "$RAW_CONF_OUTPUT" | sed -nE "s/^[[:space:]]*data_directory[[:space:]]*=[[:space:]]*['\"]?([^'\"]+)['\"]?.*$/\1/p")
if [ -z "$CONFIGURED_DATA_DIR" ]; then
    CONFIGURED_DATA_DIR=$(echo "$RAW_CONF_OUTPUT" | awk -F"'" '{print $2}')
fi
if [ -z "$CONFIGURED_DATA_DIR" ]; then
    CONFIGURED_DATA_DIR=$(echo "$RAW_CONF_OUTPUT" | tr -d '[:space:]')
fi

if [ -z "$CONFIGURED_DATA_DIR" ]; then
    echo "FATAL: Failed to parse configured data_directory from pg_conftool output: '$RAW_CONF_OUTPUT'" >&2
    exit 1
fi

REAL_CONFIGURED_DATA_DIR=$(realpath -e "$CONFIGURED_DATA_DIR" 2>/dev/null || true)
if [ -z "$REAL_CONFIGURED_DATA_DIR" ]; then
    echo "FATAL: Configured data_directory path '$CONFIGURED_DATA_DIR' does not exist or cannot be resolved." >&2
    exit 1
fi

if [[ "$REAL_CONFIGURED_DATA_DIR" != "$REAL_MOUNT_POINT/"* && "$REAL_CONFIGURED_DATA_DIR" != "$REAL_MOUNT_POINT" ]]; then
    echo "FATAL: Configured cluster data_directory '$CONFIGURED_DATA_DIR' (canonical: '$REAL_CONFIGURED_DATA_DIR') does NOT resolve inside verified D: storage mount '$REAL_MOUNT_POINT'." >&2
    echo "Refusing to start cluster. Data directory must reside strictly within D: mount." >&2
    exit 1
fi

echo "[ensure-kashyap-pg] Verified configured data_directory inside D: mount: $REAL_CONFIGURED_DATA_DIR"

# ------------------------------------------------------------------------------
# 6. Effective Project Log Destination Verification
# Verify log destination resolves to D: storage; do NOT silently accept regular file on C:
# ------------------------------------------------------------------------------
LOG_DIR="$REAL_MOUNT_POINT/logs"
mkdir -p "$LOG_DIR"
chown -R postgres:postgres "$LOG_DIR"
chmod 750 "$LOG_DIR"

EXPECTED_LOG_TARGET="$LOG_DIR/postgresql-${PG_VERSION}-${PG_CLUSTER}.log"
touch "$EXPECTED_LOG_TARGET"
chown postgres:postgres "$EXPECTED_LOG_TARGET"

SYSTEM_LOG_PATH="/var/log/postgresql/postgresql-${PG_VERSION}-${PG_CLUSTER}.log"

# Check if an existing regular file exists on C:
if [ -e "$SYSTEM_LOG_PATH" ] && [ ! -L "$SYSTEM_LOG_PATH" ]; then
    echo "FATAL: Effective log destination '$SYSTEM_LOG_PATH' is an existing regular file on C: root filesystem." >&2
    echo "Project logs must reside on D: storage. Silently accepting or writing to regular log files on C: is strictly prohibited." >&2
    echo "Remediation: Remove or migrate the regular file on C: and establish a symlink pointing to '$EXPECTED_LOG_TARGET'." >&2
    exit 1
fi

# If symlink does not exist, create it
if [ ! -L "$SYSTEM_LOG_PATH" ]; then
    echo "[ensure-kashyap-pg] Establishing log symlink $SYSTEM_LOG_PATH -> $EXPECTED_LOG_TARGET..."
    ln -sf "$EXPECTED_LOG_TARGET" "$SYSTEM_LOG_PATH"
fi

# Verify the symlink resolves to verified D: storage mount
CANONICAL_LOG_PATH=$(realpath -e "$SYSTEM_LOG_PATH" 2>/dev/null || true)
if [ -z "$CANONICAL_LOG_PATH" ] || [[ "$CANONICAL_LOG_PATH" != "$REAL_MOUNT_POINT/"* ]]; then
    echo "FATAL: Log symlink '$SYSTEM_LOG_PATH' does not resolve inside verified D: storage mount '$REAL_MOUNT_POINT'." >&2
    echo "Resolved canonical path: '$CANONICAL_LOG_PATH'." >&2
    echo "Refusing to start. Effective log destination must be on D: storage." >&2
    exit 1
fi

echo "[ensure-kashyap-pg] Verified effective log destination on D: storage: $CANONICAL_LOG_PATH"

# ------------------------------------------------------------------------------
# 7. Cluster Online State & Mandatory Runtime Data Directory Verification
# ------------------------------------------------------------------------------
if ! pg_lsclusters | grep -q "${PG_VERSION}\s\+${PG_CLUSTER}\s\+${PG_PORT}\s\+online"; then
    echo "[ensure-kashyap-pg] Starting PostgreSQL cluster ${PG_VERSION}/${PG_CLUSTER}..."
    pg_ctlcluster "$PG_VERSION" "$PG_CLUSTER" start
fi

# Wait up to 10 seconds for cluster to accept connections
CLUSTER_READY=false
for i in {1..10}; do
    if pg_isready -p "$PG_PORT" -q 2>/dev/null; then
        CLUSTER_READY=true
        break
    fi
    sleep 1
done

if [ "$CLUSTER_READY" != "true" ]; then
    echo "FATAL: PostgreSQL cluster ${PG_VERSION}/${PG_CLUSTER} failed to accept connections on port ${PG_PORT}." >&2
    exit 1
fi

# Mandatory runtime data_directory check via SQL
SQL_OUTPUT=""
if [ -n "${PSQL_QUERY_CMD:-}" ]; then
    if ! SQL_OUTPUT=$($PSQL_QUERY_CMD 2>&1); then
        echo "FATAL: SQL query 'SHOW data_directory;' failed on cluster port $PG_PORT:" >&2
        echo "$SQL_OUTPUT" >&2
        exit 1
    fi
else
    if ! SQL_OUTPUT=$(su - postgres -c "psql -p $PG_PORT -d postgres -tAc 'SHOW data_directory;'" 2>&1); then
        echo "FATAL: SQL query 'SHOW data_directory;' failed on cluster port $PG_PORT:" >&2
        echo "$SQL_OUTPUT" >&2
        exit 1
    fi
fi

RUNNING_DATA_DIR=$(echo "$SQL_OUTPUT" | tr -d '[:space:]')
if [ -z "$RUNNING_DATA_DIR" ]; then
    echo "FATAL: SQL query 'SHOW data_directory;' returned empty output on cluster port $PG_PORT." >&2
    exit 1
fi

REAL_RUNNING_DATA_DIR=$(realpath -e "$RUNNING_DATA_DIR" 2>/dev/null || true)
if [ -z "$REAL_RUNNING_DATA_DIR" ]; then
    echo "FATAL: Running cluster data_directory '$RUNNING_DATA_DIR' cannot be resolved on filesystem." >&2
    exit 1
fi

if [[ "$REAL_RUNNING_DATA_DIR" != "$REAL_MOUNT_POINT/"* && "$REAL_RUNNING_DATA_DIR" != "$REAL_MOUNT_POINT" ]]; then
    echo "FATAL: Active running cluster data_directory '$REAL_RUNNING_DATA_DIR' does NOT reside inside D: mount '$REAL_MOUNT_POINT'." >&2
    exit 1
fi

echo "[ensure-kashyap-pg] Verified active running data_directory inside D: mount: $REAL_RUNNING_DATA_DIR"

# Require successful running-directory verification before reporting SUCCESS
echo "[ensure-kashyap-pg] SUCCESS: PostgreSQL cluster ${PG_VERSION}/${PG_CLUSTER} online on port ${PG_PORT} backed by D: drive storage."
