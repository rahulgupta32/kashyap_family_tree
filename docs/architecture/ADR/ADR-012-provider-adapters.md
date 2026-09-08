# ADR-012: Provider-Adapter Pattern for External Dependencies

**Status**: Accepted (Baseline)  
**Date**: 2026-09-09  
**Decision Makers**: Jyphra Technology Pvt. Ltd.  
**Source**: Master Requirements Specification §21

## Context
The platform integrates with external 3rd-party systems (SMS/OTP gateways, Push notification services, Bikram Sambat / Tithi astronomical engines, Map providers, Cloud storage). These providers vary between development, testing, staging, and production environments, and contracts may change over the platform's lifecycle.

## Decision
Enforce strict **Port & Adapter (Hexagonal)** boundaries with TypeScript interfaces for all external systems:
- `SmsOtpProvider`: LocalDevSmsProvider, SparrowSmsProvider, TwilioProvider, AkashSmsProvider
- `PushNotificationProvider`: LocalDevPushProvider, FcmPushProvider, ApnsPushProvider
- `CalendarTithiProvider`: LocalDevTithiProvider, AstronomicalCalculatedTithiProvider, EphemerisApiProvider
- `MapServiceProvider`: LocalDevMapProvider, OpenStreetMapProvider, GoogleMapsProvider
- `StorageProvider`: LocalDiskStorageProvider, MinioStorageProvider, S3StorageProvider
