# Storage Preflight Report

**Project**: Kashyap Adhikari Family Tree  
**Owner**: Jyphra Technology Pvt. Ltd.  
**Date**: 2026-09-09  
**Status**: ✅ PASS

## D-Drive Verification

| Check | Result | Detail |
|-------|--------|--------|
| D:\ exists | ✅ PASS | Drive accessible |
| D:\ writable | ✅ PASS | Verified via directory creation |
| Free space | ✅ PASS | 120.44 GB free / 219.73 GB total |
| Minimum required | ✅ PASS | >50 GB available |
| Working directory | ✅ PASS | `D:\Jyphra\kashyap_family_tree` |

## Directory Structure

| Path | Purpose | Status |
|------|---------|--------|
| `D:\Jyphra\kashyap_family_tree\` | Repository/workspace | ✅ Created |
| `D:\Jyphra\kashyap_family_tree_data\` | Local databases and runtime data | ✅ Created |
| `D:\Jyphra\dev-cache\` | Dependency/package/build caches | ✅ Created |
| `D:\Jyphra\dev-tools\` | Project SDKs and toolchains | ✅ Created |
| `D:\Jyphra\containers\` | Docker/Podman data | ✅ Created |
| `D:\Jyphra\temp\kashyap_family_tree\` | Project TEMP/TMP | ✅ Created |
| `D:\Jyphra\backups\kashyap_family_tree\` | Local development backups | ✅ Created |

## Environment Variable Configuration

The following environment variables should be set for this project session:

```powershell
# Project temp directories
$env:TEMP = "D:\Jyphra\temp\kashyap_family_tree"
$env:TMP = "D:\Jyphra\temp\kashyap_family_tree"

# Flutter/Dart
$env:PUB_CACHE = "D:\Jyphra\dev-cache\pub-cache"

# Node.js (if used for admin portal)
$env:npm_config_cache = "D:\Jyphra\dev-cache\npm"
$env:PNPM_HOME = "D:\Jyphra\dev-cache\pnpm"

# Android SDK
$env:ANDROID_HOME = "D:\Jyphra\dev-tools\android-sdk"
$env:ANDROID_SDK_ROOT = "D:\Jyphra\dev-tools\android-sdk"
$env:ANDROID_AVD_HOME = "D:\Jyphra\dev-tools\android-avd"

# Gradle
$env:GRADLE_USER_HOME = "D:\Jyphra\dev-cache\gradle"

# Python
$env:PIP_CACHE_DIR = "D:\Jyphra\dev-cache\pip"
$env:PIPENV_CACHE_DIR = "D:\Jyphra\dev-cache\pipenv"

# Docker (requires Docker Desktop configuration)
# See DOCKER_STORAGE_GATE below
```

## Docker/WSL Storage Gate

> **⚠️ GATE: Docker Desktop storage location must be verified before use.**

Docker Desktop by default stores its disk image at:
`C:\Users\<user>\AppData\Local\Docker\wsl\data\ext4.vhdx`

### Required One-Time Configuration (Jyphra action):
1. Open Docker Desktop → Settings → Resources → Advanced
2. Set "Disk image location" to `D:\Jyphra\containers\docker-data`
3. Apply & Restart
4. Verify: `docker info | Select-String "Docker Root Dir"`

Until this is confirmed, container operations that would create large images/volumes will be avoided.

## Android SDK/Emulator Storage Gate

> **⚠️ GATE: Android SDK must be installed on D: drive.**

### Required Configuration:
1. Set `ANDROID_HOME=D:\Jyphra\dev-tools\android-sdk`
2. Set `ANDROID_AVD_HOME=D:\Jyphra\dev-tools\android-avd`
3. Install SDK components via `sdkmanager` with `--sdk_root=D:\Jyphra\dev-tools\android-sdk`

## Unavoidable C-Drive Writes

| Item | Path | Reason | Size Estimate |
|------|------|--------|---------------|
| Git config | `C:\Users\raahu\.gitconfig` | System-wide Git settings | <1 KB |
| Git credentials | `C:\Users\raahu\.git-credentials` or credential manager | OS credential store | <1 KB |
| Python (MS Store) | `C:\Users\raahu\AppData\Local\Packages\PythonSoftwareFoundation.*` | MS Store app install location | ~100 MB (pre-existing) |
| Antigravity | `C:\Users\raahu\.gemini\` | Tool configuration | <100 MB |

## Space Monitoring Protocol

Before and after each major operation:
1. Check `D:\` free space: `(Get-PSDrive D).Free / 1GB`
2. Minimum threshold: 20 GB
3. Warning threshold: 30 GB
4. If below warning: review and clean project caches
5. If below minimum: STOP the operation and report

---

*Last verified: 2026-09-09T02:10:00+05:45*
