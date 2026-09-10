# PostgreSQL Storage Architecture & Operations (D: Drive)

**Platform**: Kashyap Adhikari Family Tree Platform  
**Managing Entity**: Jyphra Technology Pvt. Ltd.  
**Baseline**: Kashyap Adhikari Final Implementation Documentation Baseline v1.1  

---

## 1. Storage Overview

To strictly satisfy the enterprise requirement that all controllable heavy development and runtime storage remain on the **D:** drive, PostgreSQL data for this platform is decoupled from the C:-backed WSL2 distribution virtual disk.

* **Backing Image File (Windows)**: `D:\Jyphra\pg_data\kashyap_pg.img`
* **Linux Mount Target (WSL)**: `/mnt/kashyap_pg` (native ext4 filesystem)
* **Cluster Version & Name**: PostgreSQL 16 (`kashyap`)
* **Cluster Port**: `5433` (internal WSL) -> Bridged to `127.0.0.1:5434` (Windows local development)
* **Data Directory**: `/mnt/kashyap_pg/pgdata`
* **Database Logs**: `/mnt/kashyap_pg/logs/postgresql-16-kashyap.log` (redirected from `/var/log/postgresql/` via symlink)
* **Current Allocation**: 2.0 GB total, ~48 MB used, ~1.8 GB available (3% utilization).

The default WSL2 Ubuntu distribution and its pre-existing cluster (`16/main` on port `5432`) housing unrelated workloads (`vidyarthi`, `mala_chem`) remain 100% untouched and operational.

---

## 2. Reproducible Installation & Setup

### Prerequisites
1. Windows Subsystem for Linux (WSL2) with Ubuntu 24.04+.
2. PostgreSQL 16 installed in the WSL distribution (`postgresql-16`, `postgresql-client-16`).
3. Dedicated project directory on D: drive: `D:\Jyphra\pg_data`.

### Automated Mount & Verification Script
The source script [`scripts/ensure-kashyap-pg.sh`](../scripts/ensure-kashyap-pg.sh) provides idempotent, safe mounting:
1. Verifies `D:\Jyphra\pg_data\kashyap_pg.img` exists.
2. Mounts the image via loop device to `/mnt/kashyap_pg`.
3. Verifies that `findmnt` and `losetup` confirm the mount is actively backed by `kashyap_pg.img` before any cluster action.
4. Fails safely if the mount is absent or unbacked—never initializes or writes to the underlying C: mount directory.
5. Verifies data directory `/mnt/kashyap_pg/pgdata` exists (will not overwrite or re-initdb).
6. Starts the `16/kashyap` cluster and verifies port `5433` readiness.

### Systemd Integration
A systemd unit [`scripts/kashyap-pg.service`](../scripts/kashyap-pg.service) ensures the storage is mounted and the cluster is started on WSL initialization:
```bash
# In WSL (as root):
cp /mnt/d/Jyphra/kashyap_family_tree/scripts/ensure-kashyap-pg.sh /usr/local/bin/ensure-kashyap-pg.sh
chmod +x /usr/local/bin/ensure-kashyap-pg.sh
cp /mnt/d/Jyphra/kashyap_family_tree/scripts/kashyap-pg.service /etc/systemd/system/kashyap-pg.service
systemctl daemon-reload
systemctl enable kashyap-pg.service
```

---

## 3. Capacity Expansion Procedure

If database volume exceeds the initial 2.0 GB allocation, expand the virtual ext4 image online or offline without data loss:

1. **Stop the project cluster**:
   ```bash
   wsl -u root -d Ubuntu -- pg_ctlcluster 16 kashyap stop
   ```
2. **Unmount the loop filesystem**:
   ```bash
   wsl -u root -d Ubuntu -- umount /mnt/kashyap_pg
   ```
3. **Expand the physical file on D: drive** (e.g. add 5 GB):
   ```bash
   wsl -u root -d Ubuntu -- truncate -s +5G /mnt/d/Jyphra/pg_data/kashyap_pg.img
   ```
4. **Integrity check on the extended image**:
   ```bash
   wsl -u root -d Ubuntu -- e2fsck -f /mnt/d/Jyphra/pg_data/kashyap_pg.img
   ```
5. **Resize the ext4 filesystem to fill new space**:
   ```bash
   wsl -u root -d Ubuntu -- resize2fs /mnt/d/Jyphra/pg_data/kashyap_pg.img
   ```
6. **Remount and bring cluster online**:
   ```bash
   wsl -u root -d Ubuntu -- /usr/local/bin/ensure-kashyap-pg.sh
   ```
7. **Verify new capacity**:
   ```bash
   wsl -u root -d Ubuntu -- df -h /mnt/kashyap_pg
   ```

---

## 4. Recoverable Backups

Authoritative pre-migration and milestone database dumps are stored in:
`D:\Jyphra\backups\pg_kashyap_20260910_pre_migration\kashyap_db.dump`

To restore into the D:-backed cluster:
```bash
wsl -u postgres -d Ubuntu -- pg_restore -p 5433 -d kashyap_db --no-owner --no-privileges --clean --if-exists /mnt/d/Jyphra/backups/pg_kashyap_20260910_pre_migration/kashyap_db.dump
```
