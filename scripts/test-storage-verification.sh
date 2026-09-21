#!/bin/bash
# ==============================================================================
# Kashyap Adhikari Family Tree Platform
# Script: test-storage-verification.sh
# Purpose: Regression suite verifying that invalid backing paths, images outside D:,
#          symlinks resolving outside D:, regular files on C:, backing mismatches,
#          failed/empty/invalid pg_conftool results, and failed/empty/invalid SQL
#          data_directory results are strictly rejected with exit code 1.
# Authority: Jyphra Technology Pvt. Ltd.
# ==============================================================================
set -uo pipefail

ENSURE_SCRIPT="/usr/local/bin/ensure-kashyap-pg.sh"
if [ ! -x "$ENSURE_SCRIPT" ]; then
    ENSURE_SCRIPT="$(dirname "$0")/ensure-kashyap-pg.sh"
fi

echo "======================================================================"
echo "Starting PostgreSQL Storage Verification Regression Tests"
echo "Target script: $ENSURE_SCRIPT"
echo "======================================================================"

PASSED=0
FAILED=0

run_test() {
    local test_name="$1"
    local expected_code="$2"
    local expected_pattern="$3"
    shift 3
    local cmd=("$@")

    echo ""
    echo "----------------------------------------------------------------------"
    echo "RUNNING: $test_name"
    echo "Command: ${cmd[*]}"

    local output
    local exit_code=0
    output=$("${cmd[@]}" 2>&1) || exit_code=$?

    if [ "$exit_code" -ne "$expected_code" ]; then
        echo "FAIL: Expected exit code $expected_code, but got $exit_code."
        echo "Output was:"
        echo "$output"
        ((FAILED++))
        return 1
    fi

    if [ -n "$expected_pattern" ] && ! echo "$output" | grep -Eq "$expected_pattern"; then
        echo "FAIL: Output did not match expected regex pattern: $expected_pattern"
        echo "Output was:"
        echo "$output"
        ((FAILED++))
        return 1
    fi

    echo "PASS: Exited with code $exit_code matching pattern: '$expected_pattern'"
    ((PASSED++))
    return 0
}

# ------------------------------------------------------------------------------
# Test 1: Non-existent image path
# ------------------------------------------------------------------------------
run_test \
    "Test 1: Reject non-existent image path" \
    1 \
    "PostgreSQL backing image does not exist" \
    env KASHYAP_PG_IMAGE="/mnt/d/Jyphra/pg_data/non_existent_image_12345.img" "$ENSURE_SCRIPT"

# ------------------------------------------------------------------------------
# Test 2: Same-named image located on C: root filesystem (/tmp)
# ------------------------------------------------------------------------------
FAKE_C_IMAGE="/tmp/kashyap_pg.img"
truncate -s 10M "$FAKE_C_IMAGE"
trap 'rm -f "$FAKE_C_IMAGE"' EXIT

run_test \
    "Test 2: Reject same-named image located outside D: (on C: filesystem)" \
    1 \
    "does not resolve under the D: drive mount" \
    env KASHYAP_PG_IMAGE="$FAKE_C_IMAGE" "$ENSURE_SCRIPT"

# ------------------------------------------------------------------------------
# Test 3: Symlink under D: mount resolving to a target file outside D: (on C:)
# ------------------------------------------------------------------------------
SYMLINK_ON_D="/mnt/d/Jyphra/pg_data/test_symlink_resolving_outside.img"
ln -sf "$FAKE_C_IMAGE" "$SYMLINK_ON_D"

run_test \
    "Test 3: Reject symlink on D: resolving outside D:" \
    1 \
    "does not resolve under the D: drive mount" \
    env KASHYAP_PG_IMAGE="$SYMLINK_ON_D" "$ENSURE_SCRIPT"

rm -f "$SYMLINK_ON_D"

# ------------------------------------------------------------------------------
# Test 4: Loop backing mismatch (expected image on D: differs from active loop device)
# ------------------------------------------------------------------------------
OTHER_D_IMAGE="/mnt/d/Jyphra/pg_data/test_other_backing.img"
truncate -s 10M "$OTHER_D_IMAGE"

run_test \
    "Test 4: Reject loop backing mismatch (exact canonical path comparison)" \
    1 \
    "loop backing mismatch" \
    env KASHYAP_PG_IMAGE="$OTHER_D_IMAGE" "$ENSURE_SCRIPT"

rm -f "$OTHER_D_IMAGE"

# ------------------------------------------------------------------------------
# Test 5: Reject effective log destination when it is an existing regular file on C:
# ------------------------------------------------------------------------------
LOG_PATH="/var/log/postgresql/postgresql-16-kashyap.log"
SAVED_LOG_SYMLINK=""
if [ -L "$LOG_PATH" ]; then
    SAVED_LOG_SYMLINK=$(readlink "$LOG_PATH")
fi

# Temporarily replace symlink with a regular file on C:
rm -f "$LOG_PATH"
touch "$LOG_PATH"

run_test \
    "Test 5: Reject existing regular log file on C: filesystem" \
    1 \
    "is an existing regular file on C: root filesystem" \
    "$ENSURE_SCRIPT"

# Restore original symlink
rm -f "$LOG_PATH"
if [ -n "$SAVED_LOG_SYMLINK" ]; then
    ln -sf "$SAVED_LOG_SYMLINK" "$LOG_PATH"
fi

# ------------------------------------------------------------------------------
# Test 6: Reject effective log destination when symlink resolves outside D:
# ------------------------------------------------------------------------------
rm -f "$LOG_PATH"
ln -sf "/tmp/fake_outside_kashyap.log" "$LOG_PATH"

run_test \
    "Test 6: Reject log symlink resolving outside D: storage mount" \
    1 \
    "does not resolve inside verified D: storage mount" \
    "$ENSURE_SCRIPT"

# Restore original symlink
rm -f "$LOG_PATH"
if [ -n "$SAVED_LOG_SYMLINK" ]; then
    ln -sf "$SAVED_LOG_SYMLINK" "$LOG_PATH"
fi

# ------------------------------------------------------------------------------
# Test 7: Reject when pg_conftool command fails
# ------------------------------------------------------------------------------
run_test \
    "Test 7: Reject when pg_conftool command fails (nonzero exit)" \
    1 \
    "pg_conftool command failed to retrieve data_directory" \
    env PG_CONFTOOL_CMD="false" "$ENSURE_SCRIPT"

# ------------------------------------------------------------------------------
# Test 8: Reject when pg_conftool returns empty output
# ------------------------------------------------------------------------------
run_test \
    "Test 8: Reject when pg_conftool returns empty output" \
    1 \
    "pg_conftool returned empty output|Failed to parse configured data_directory" \
    env PG_CONFTOOL_CMD="echo" "$ENSURE_SCRIPT"

# ------------------------------------------------------------------------------
# Test 9: Reject when pg_conftool configured path does not exist / cannot resolve
# ------------------------------------------------------------------------------
run_test \
    "Test 9: Reject when configured data_directory cannot be resolved" \
    1 \
    "does not exist or cannot be resolved" \
    env PG_CONFTOOL_CMD="echo data_directory = '/mnt/kashyap_pg/nonexistent_subpath_xyz'" "$ENSURE_SCRIPT"

# ------------------------------------------------------------------------------
# Test 10: Reject when pg_conftool configured path resolves outside D: mount
# ------------------------------------------------------------------------------
run_test \
    "Test 10: Reject when configured data_directory resolves outside D: mount" \
    1 \
    "does NOT resolve inside verified D: storage mount" \
    env PG_CONFTOOL_CMD="echo data_directory = '/var/lib/postgresql/16/main'" "$ENSURE_SCRIPT"

# ------------------------------------------------------------------------------
# Test 11: Reject when SQL query command fails (nonzero exit)
# ------------------------------------------------------------------------------
run_test \
    "Test 11: Reject when SQL query command fails (nonzero exit)" \
    1 \
    "SQL query 'SHOW data_directory;' failed" \
    env PSQL_QUERY_CMD="false" "$ENSURE_SCRIPT"

# ------------------------------------------------------------------------------
# Test 12: Reject when SQL query returns empty output
# ------------------------------------------------------------------------------
run_test \
    "Test 12: Reject when SQL query returns empty output" \
    1 \
    "SQL query 'SHOW data_directory;' returned empty output" \
    env PSQL_QUERY_CMD="echo" "$ENSURE_SCRIPT"

# ------------------------------------------------------------------------------
# Test 13: Reject when SQL query returns unresolvable path
# ------------------------------------------------------------------------------
run_test \
    "Test 13: Reject when SQL query returns unresolvable path" \
    1 \
    "cannot be resolved on filesystem" \
    env PSQL_QUERY_CMD="echo /mnt/kashyap_pg/nonexistent_runtime_xyz" "$ENSURE_SCRIPT"

# ------------------------------------------------------------------------------
# Test 14: Reject when SQL query returns path outside D: mount
# ------------------------------------------------------------------------------
run_test \
    "Test 14: Reject when running data_directory resolves outside D: mount" \
    1 \
    "does NOT reside inside D: mount" \
    env PSQL_QUERY_CMD="echo /var/lib/postgresql/16/main" "$ENSURE_SCRIPT"

# ------------------------------------------------------------------------------
# Test 15: Valid D: drive backing image, configuration, and SQL query succeeds
# ------------------------------------------------------------------------------
run_test \
    "Test 15: Valid D: drive backing image, configuration, and SQL query succeeds" \
    0 \
    "SUCCESS: PostgreSQL cluster 16/kashyap online on port 5433 backed by D: drive storage" \
    "$ENSURE_SCRIPT"

echo ""
echo "======================================================================"
echo "Regression Suite Completed: $PASSED passed, $FAILED failed."
echo "======================================================================"

if [ "$FAILED" -ne 0 ]; then
    exit 1
fi
exit 0
