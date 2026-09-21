# PostgreSQL Storage Architecture, Provisioning & Operations (D: Drive)

**Platform**: Kashyap Adhikari Family Tree Platform  
**Managing Entity**: Jyphra Technology Pvt. Ltd.  
**Baseline**: Kashyap Adhikari Final Implementation Documentation Baseline v1.1  

---

## 1. Storage Architecture Overview

To strictly comply with enterprise infrastructure guidelines requiring all controllable heavy database and runtime storage to reside on the **D:** drive, PostgreSQL data for this platform is physically decoupled from the WSL2 Ubuntu root filesystem virtual disk (`ext4.vhdx` on C:).

* **Backing Virtual Disk Image**: `D:\Jyphra\pg_data\kashyap_pg.img` (raw ext4 filesystem image on Windows NTFS host)
* **WSL2 Mount Target**: `/mnt/kashyap_pg` (mounted via `/dev/loop0`)
* **Cluster Version & Identifier**: PostgreSQL 16 (`kashyap`)
* **Cluster Port**: `5433` (internal WSL2) -> Bridged to `127.0.0.1:5434` (Windows local development loopback)
* **Data Directory (`data_directory`)**: `/mnt/kashyap_pg/pgdata` (strictly inside the D: ext4 mount)
* **Cluster Logs**: `/mnt/kashyap_pg/logs/postgresql-16-kashyap.log` (routed from Debian/Ubuntu's `/var/log/postgresql/` via symlink)
* **Current Allocation**: 2.0 GB virtual disk, ~48 MB used, ~1.8 GB available (3% utilization)
* **Authoritative Backups**: `D:\Jyphra\backups\pg_kashyap_20260910_pre_migration\kashyap_db.dump`

### Workload Isolation Boundary
The default WSL2 Ubuntu root distribution on C: hosts pre-existing, unrelated databases (`vidyarthi`, `mala_chem`) on PostgreSQL cluster `16/main` (port `5432`). That cluster and its data directory (`/var/lib/postgresql/16/main`) remain completely untouched and operational.

---

## 2. First-Time Provisioning (Clean Environment Setup)

> [!CAUTION]
> **Data Loss Prevention Guardrails**:
> * Never run first-time provisioning against an existing cluster or image.
> * If `D:\Jyphra\pg_data\kashyap_pg.img` already exists or the cluster `16/kashyap` is already initialized, **STOP**.
> * The runtime script `ensure-kashyap-pg.sh` will **NEVER** automatically format or initialize missing storage; missing storage causes an immediate fail-fast termination to protect data integrity.

Follow these reproducible steps when setting up the database storage on a fresh developer machine or environment.

### Step 2.1: Host Prerequisites & Workspace Verification
Ensure Windows Subsystem for Linux (WSL2) with Ubuntu 24.04+ is installed, and PostgreSQL 16 binaries are present:
```bash
# In WSL2 (Ubuntu):
sudo apt-get update
sudo apt-get install -y postgresql-16 postgresql-client-16
```
Ensure the target directory exists on the host D: drive:
```bash
# Verify D: drive mount in WSL
mkdir -p /mnt/d/Jyphra/pg_data
```

### Step 2.2: Virtual Ext4 Image Creation & Formatting
Create a sparse or fixed virtual ext4 image file on D: drive:
```bash
# Create 2.0 GB raw image file on D: drive (ensure file does NOT already exist)
if [ -f /mnt/d/Jyphra/pg_data/kashyap_pg.img ]; then
    echo "FATAL: Image file already exists. Aborting provisioning to prevent data loss." >&2
    exit 1
fi

truncate -s 2G /mnt/d/Jyphra/pg_data/kashyap_pg.img
mkfs.ext4 -L kashyap_pg /mnt/d/Jyphra/pg_data/kashyap_pg.img
```

### Step 2.3: Loop Mount Target & Directory Permissions
Create the mount point and attach the image to `/mnt/kashyap_pg`:
```bash
sudo mkdir -p /mnt/kashyap_pg
sudo mount -o loop /mnt/d/Jyphra/pg_data/kashyap_pg.img /mnt/kashyap_pg

# Set postgres user ownership
sudo chown -R postgres:postgres /mnt/kashyap_pg
sudo chmod 750 /mnt/kashyap_pg
```

### Step 2.4: Dedicated Project Cluster Creation & Configuration
Initialize the new PostgreSQL 16 cluster directly on the mounted D: storage:
```bash
# Refuse if cluster already exists
if pg_lsclusters | grep -q "16\s\+kashyap"; then
    echo "FATAL: Cluster 16/kashyap already exists. Aborting cluster creation." >&2
    exit 1
fi

sudo pg_createcluster 16 kashyap -d /mnt/kashyap_pg/pgdata -p 5433

# Verify data_directory in /etc/postgresql/16/kashyap/postgresql.conf
pg_conftool 16 kashyap show data_directory
# Output must be: '/mnt/kashyap_pg/pgdata'
```

### Step 2.5: Project Log Routing Setup
Ensure PostgreSQL logs are written exclusively to D: storage, preventing log accumulation on C::
```bash
sudo mkdir -p /mnt/kashyap_pg/logs
sudo chown -R postgres:postgres /mnt/kashyap_pg/logs
sudo chmod 750 /mnt/kashyap_pg/logs
sudo touch /mnt/kashyap_pg/logs/postgresql-16-kashyap.log
sudo chown postgres:postgres /mnt/kashyap_pg/logs/postgresql-16-kashyap.log

# Remove default regular file created on C: during pg_createcluster, and replace with symlink
sudo rm -f /var/log/postgresql/postgresql-16-kashyap.log
sudo ln -sf /mnt/kashyap_pg/logs/postgresql-16-kashyap.log /var/log/postgresql/postgresql-16-kashyap.log

# Verify symlink
ls -la /var/log/postgresql/postgresql-16-kashyap.log
# Expected: -> /mnt/kashyap_pg/logs/postgresql-16-kashyap.log
```

### Step 2.6: Database & Role Initialization (No Hardcoded Credentials in Git)
Start the cluster and provision the application user and database:
```bash
sudo pg_ctlcluster 16 kashyap start

# Export your development password into environment variable (DO NOT COMMIT SECRETS)
export DB_DEV_PASSWORD="your_secure_dev_password"

# Create application user and database
sudo -u postgres psql -p 5433 <<EOF
CREATE USER kashyap_user WITH ENCRYPTED PASSWORD '${DB_DEV_PASSWORD}';
CREATE DATABASE kashyap_db OWNER kashyap_user;
GRANT ALL PRIVILEGES ON DATABASE kashyap_db TO kashyap_user;
\c kashyap_db
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
EOF
unset DB_DEV_PASSWORD
```

### Step 2.7: Service & Helper Installation
Install the mount and verification script and configure the systemd unit:
```bash
# Copy and configure ensure script
sudo cp /mnt/d/Jyphra/kashyap_family_tree/scripts/ensure-kashyap-pg.sh /usr/local/bin/ensure-kashyap-pg.sh
sudo chmod +x /usr/local/bin/ensure-kashyap-pg.sh

# Copy and enable systemd unit
sudo cp /mnt/d/Jyphra/kashyap_family_tree/scripts/kashyap-pg.service /etc/systemd/system/kashyap-pg.service
sudo systemctl daemon-reload
sudo systemctl enable kashyap-pg.service
```

---

## 3. Normal Startup & Runtime Verification

> [!IMPORTANT]
> **Strict Separation from Provisioning**:
> Normal startup procedures assume the storage image and database already exist. Normal startup will **NEVER** re-format, overwrite, or auto-initialize missing databases.

### 3.1. Automated Startup Script (`scripts/ensure-kashyap-pg.sh`)
The production startup script [`scripts/ensure-kashyap-pg.sh`](../scripts/ensure-kashyap-pg.sh) executes on system startup or bridge invocation. It enforces 7 rigorous fail-fast validations:
1. **Backing Image Existence & Canonical Resolution**: Verifies `IMAGE_PATH` exists and resolves to a valid canonical path.
2. **Strict D: Mount Verification**: Confirms `findmnt -T` resolves the canonical image path to `/mnt/d` (source `D:\`). Rejects any image path or symlink resolving outside D:.
3. **Safe Mount Execution**: Mounts `/mnt/d/Jyphra/pg_data/kashyap_pg.img` to `/mnt/kashyap_pg` only if not already mounted.
4. **Exact Canonical Backing-Path Matching**: Compares the loop device backing file (`losetup -O BACK-FILE`) against the expected canonical image path via exact string equality. Substring matching is strictly prohibited.
5. **Configured & Running Data Directory Verification**: Resolves `data_directory` from PostgreSQL cluster configuration and running postmaster via SQL, confirming it resides inside the verified `/mnt/kashyap_pg` mount.
6. **Effective Log Destination Verification**: Inspects `/var/log/postgresql/postgresql-16-kashyap.log`. Rejects any existing regular file on C: with a fatal error; verifies the symlink resolves to `/mnt/kashyap_pg/logs/` on D: storage.
7. **Cluster Readiness Probe**: Starts cluster `16/kashyap` if offline, verifies status is `online` on port `5433`, and checks live connectivity.

Manual invocation:
```bash
sudo /usr/local/bin/ensure-kashyap-pg.sh
```

### 3.2. Windows TCP Bridge (`scripts/pg_bridge.js`)
To enable seamless development from Windows without exposing PostgreSQL cluster ports to external networks:
```powershell
node scripts/pg_bridge.js
```
The bridge:
* Executes `ensure-kashyap-pg.sh` via WSL.
* Holds an active WSL keepalive process.
* Resolves the dynamic WSL IP address.
* Verifies port `5433` readiness with TCP probe before listening.
* Listens strictly on Windows loopback `127.0.0.1:5434`.

---

## 4. Storage Verification Regression Suite

The regression test suite [`scripts/test-storage-verification.sh`](../scripts/test-storage-verification.sh) verifies that all security boundaries, wrong paths, and misconfigurations fail fast:

```bash
sudo /mnt/d/Jyphra/kashyap_family_tree/scripts/test-storage-verification.sh
```

### Test Coverage Matrix:
| Test ID | Scenario | Expected Result | Error Pattern Verified |
|:---:|---|:---:|---|
| **Test 1** | Non-existent image path (`KASHYAP_PG_IMAGE=.../fake.img`) | Exit Code `1` | `PostgreSQL backing image does not exist` |
| **Test 2** | Same-named image located outside D: (`/tmp/kashyap_pg.img`) | Exit Code `1` | `does not resolve under the D: drive mount` |
| **Test 3** | Symlink on D: resolving outside D: (target on C:) | Exit Code `1` | `does not resolve under the D: drive mount` |
| **Test 4** | Loop device backing mismatch (different image on D:) | Exit Code `1` | `loop backing mismatch` |
| **Test 5** | Regular file on C: at log destination | Exit Code `1` | `is an existing regular file on C: root filesystem` |
| **Test 6** | Log destination symlink resolving outside D: | Exit Code `1` | `does not resolve inside verified D: storage mount` |
| **Test 7** | Existing correct D: drive configuration | Exit Code `0` | `SUCCESS: PostgreSQL cluster 16/kashyap online on port 5433 backed by D: drive storage` |

---

## 5. Capacity Expansion Procedure (Online / Offline)

If database growth exceeds the initial 2.0 GB allocation, expand the virtual ext4 image without data loss:

1. **Stop the project cluster**:
   ```bash
   sudo pg_ctlcluster 16 kashyap stop
   ```
2. **Unmount the loop filesystem**:
   ```bash
   sudo umount /mnt/kashyap_pg
   ```
3. **Expand the physical file on D: drive** (e.g. add 5 GB):
   ```bash
   truncate -s +5G /mnt/d/Jyphra/pg_data/kashyap_pg.img
   ```
4. **Integrity check on the extended image**:
   ```bash
   sudo e2fsck -f /mnt/d/Jyphra/pg_data/kashyap_pg.img
   ```
5. **Resize the ext4 filesystem to fill new space**:
   ```bash
   sudo resize2fs /mnt/d/Jyphra/pg_data/kashyap_pg.img
   ```
6. **Remount and bring cluster online**:
   ```bash
   sudo /usr/local/bin/ensure-kashyap-pg.sh
   ```
7. **Verify new capacity**:
   ```bash
   df -h /mnt/kashyap_pg
   ```

---

## 6. Disaster Recovery & Backup Restoration

Pre-migration and milestone database backups are archived on D: drive:
* **Primary Snapshot**: `D:\Jyphra\backups\pg_kashyap_20260910_pre_migration\kashyap_db.dump`

To restore this dump into the D:-backed PostgreSQL cluster:
```bash
# Ensure cluster is mounted and running
sudo /usr/local/bin/ensure-kashyap-pg.sh

# Restore using pg_restore
sudo -u postgres pg_restore \
    -p 5433 \
    -d kashyap_db \
    --no-owner \
    --no-privileges \
    --clean \
    --if-exists \
    /mnt/d/Jyphra/backups/pg_kashyap_20260910_pre_migration/kashyap_db.dump

# Re-run migrations to verify database schema status
pnpm --filter @kashyap/api run test:integration
```

---

## 7. Redis Storage Architecture & Operations (D: Drive)

To ensure caching, rate limiting, and atomic OTP challenges also adhere strictly to the D: drive heavy runtime storage constraint, Redis persistence (RDB snapshots and AOF logs) is co-located inside the verified D: loop filesystem.

* **Backing Mount Target**: `/mnt/kashyap_pg` (`D:\Jyphra\pg_data\kashyap_pg.img`)
* **Redis Working & Data Directory**: `/mnt/kashyap_pg/redis`
* **Redis Port**: `6379` (standard internal loopback)
* **Configuration Target**: `/etc/redis/redis.conf` (`dir /mnt/kashyap_pg/redis`)
* **Persistence Mechanisms**: RDB (`dump.rdb`) & AOF (`appendonly.aof`) saved directly to D: storage
* **Startup & Verification Script**: [`scripts/ensure-kashyap-redis.sh`](../scripts/ensure-kashyap-redis.sh)

### Redis Verification Script (`scripts/ensure-kashyap-redis.sh`)
The automated verification script enforces:
1. **Prerequisite Mount Check**: Requires `/mnt/kashyap_pg` to be actively mounted from `D:\Jyphra\pg_data\kashyap_pg.img`.
2. **Directory & Ownership Verification**: Creates `/mnt/kashyap_pg/redis` if missing with ownership `redis:redis` and permissions `0750`.
3. **Configuration Audit**: Checks `/etc/redis/redis.conf` to confirm `dir` is set to `/mnt/kashyap_pg/redis`.
4. **Service Health & Port Probe**: Starts `redis-server` if stopped and tests connectivity via `redis-cli ping`.
5. **Runtime Data Directory Probe**: Runs `redis-cli config get dir` against the live running server, confirming output matches `/mnt/kashyap_pg/redis` exactly. Non-matching or C: locations trigger fatal non-zero exits.

Invocation:
```bash
sudo /mnt/d/Jyphra/kashyap_family_tree/scripts/ensure-kashyap-redis.sh
```

---

## 8. System & Workload Safety Assurances

1. **WSL2 Virtual Disk Preservation**: The C: drive WSL root virtual disk (`ext4.vhdx`) remains unmodified. Neither PostgreSQL transactions nor Redis persistence logs occur on C:.
2. **Shared Cluster Preservation**: The default PostgreSQL cluster `16/main` housing `vidyarthi` and `mala_chem` remains isolated on port `5432`.
3. **Reboot Verification Distinction**: Local cluster restart was verified (`pg_ctlcluster 16 kashyap restart`, exit code 0). Full system/WSL reboot was deliberately not executed during verification to prevent disrupting running background workloads.
