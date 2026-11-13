# Native release endpoint and app identity guard

The Flutter client's development default remains the Android emulator HTTP API. Release startup now refuses HTTP, local/reserved placeholder hosts, URL credentials, query strings and fragments before an authenticated API client is created. It shows a fixed bilingual unavailable state without echoing configuration. The API service also validates its endpoint when constructed outside the normal app entry point. The Android launcher name now matches the committed Nepali iOS display name.

The endpoint is a public build setting, not a secret. CI simulator and unsigned iOS compilation still use `https://api.invalid` as a nonfunctional placeholder; those builds are never distribution artifacts. No actual provider or production endpoint has been configured by this batch. A signed release requires an approved reachable HTTPS API URL and physical-device acceptance.

Added focused Dart cases for permitted debug emulator use, release HTTPS acceptance, and rejection of insecure, reserved and credential-bearing URLs. XML parsing, frozen assessment/workbook validators and diff checks are local preflight. Exact-head Flutter, Android and iOS CI results must be recorded in PR #5 after completion. No production acceptance, merge or deployment follows from this guard.
