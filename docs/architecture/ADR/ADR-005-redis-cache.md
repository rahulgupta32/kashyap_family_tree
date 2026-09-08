# ADR-005: Redis for Caching, Rate Limiting, and Ephemeral State

**Status**: Accepted (Baseline)  
**Date**: 2026-09-09  
**Decision Makers**: Jyphra Technology Pvt. Ltd.  
**Source**: Master Requirements Specification §21

## Context
High-frequency operations (OTP verification, rate limiting, session token invalidation, active WebSocket connections, notification fan-out queues) require sub-millisecond ephemeral storage.

## Decision
Adopt **Redis 7+** as the distributed cache, session registry, rate limiter, and message broker for background job queues (BullMQ).

## Rationale
- In-memory performance for throttling OTP requests and brute-force protection
- Native TTL support for temporary OTP tokens, verification codes, and cached tree nodes
- BullMQ integration for reliable background job processing (notifications, image resizing, data imports)
