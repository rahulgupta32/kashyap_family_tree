# ADR-012: Provider-Adapter Pattern for External Dependencies

**Status**: Accepted (Baseline)  
**Date**: 2026-09-09  
**Decision Makers**: Jyphra Technology Pvt. Ltd.  
**Requirements References**: AUTH-FR-002, NOT-FR-004, MAP-FR-001..007, CAL-FR-001..013, NFR-PORT-001, Open Gates HG-004, HG-009, HG-010, HG-011

## 1. Context
The platform integrates with third-party service providers (Nepali SMS/OTP gateways like Sparrow SMS/Aakash SMS, Push Notification providers like FCM/APNs, Bikram Sambat & Tithi astronomical calculation engines, and Map tiles). Provider vendors and commercial terms may change across the platform lifecycle.

## 2. Decision
Enforce strict **Port & Adapter (Hexagonal Architecture)** boundaries with TypeScript interfaces and mock test-doubles for all external services:
- `SmsOtpProvider`: `LocalDevSmsProvider`, `SparrowSmsProvider`, `AakashSmsProvider`, `TwilioProvider`
- `PushNotificationProvider`: `LocalDevPushProvider`, `FcmPushProvider`, `ApnsPushProvider`
- `CalendarTithiProvider`: `LocalDevTithiProvider`, `AstronomicalCalculatedTithiProvider`
- `MapServiceProvider`: `LocalDevMapProvider`, `OpenStreetMapProvider`, `GoogleMapsProvider`
- `StorageProvider`: `LocalDiskStorageProvider`, `MinioStorageProvider`, `S3StorageProvider`

## 3. Alternatives Considered
| Alternative | Evaluation & Rationale for Rejection |
|-------------|--------------------------------------|
| **Direct Vendor SDK Coupling in Business Logic** | High risk: vendor API changes or contract terminations break core application code; impossible to run unit tests offline without paid API credentials. |
| **Monolithic Gateway Proxy** | Overcomplicated network overhead compared to in-process polymorphic TypeScript provider adapters. |

## 4. Consequences
- **Positive**: Zero vendor lock-in; seamless offline development with deterministic test doubles; instant provider failover in production.
- **Negative**: Extra interface abstraction layer and adapter implementations to maintain.

## 5. Security & Privacy Impact
- Vendor credentials (API keys, tokens) reside strictly in environment secrets and are isolated within individual adapter classes.

## 6. Scaling Impact
- High-concurrency async batching inside adapters (e.g. SMS queueing) isolates external network delays from user-facing HTTP request threads.

## 7. Operational Impact
- Environment variable `SMS_PROVIDER=sparrow|aakash|mock` switches active adapter without code rebuild.
