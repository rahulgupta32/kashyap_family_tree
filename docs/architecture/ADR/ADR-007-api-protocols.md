# ADR-007: REST/OpenAPI Specification & WebSocket Protocol

**Status**: Accepted (Baseline)  
**Date**: 2026-09-09  
**Decision Makers**: Jyphra Technology Pvt. Ltd.  
**Source**: Master Requirements Specification §21

## Context
Clients (Flutter Mobile, Next.js Admin, Background Workers) require predictable, versioned, strongly typed API contracts and real-time bidirectional messaging for chat and instant notifications.

## Decision
- Primary API: **RESTful HTTP endpoints** strictly documented with **OpenAPI 3.1** (Swagger) and shared TypeScript schemas (`@kashyap/contracts`).
- Real-time Communication: **WebSocket (Socket.IO/WSS)** with JWT authentication, heartbeat liveness, and room-based channel routing.
