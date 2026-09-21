# ADR-007: REST/OpenAPI Specification & WebSocket Protocol

**Status**: Accepted (Baseline)  
**Date**: 2026-09-09  
**Decision Makers**: Jyphra Technology Pvt. Ltd.  
**Requirements References**: AUTH-FR, GEN-FR, CHAT-FR-001..014, NOT-FR-001..011, NFR-COMP-001

## 1. Context
Clients across web, mobile, and background integrations require predictable, versioned, strongly typed API contracts for transactional request-response, and low-latency bidirectional messaging for live chat and instant alerts.

## 2. Decision
- Primary Protocol: **RESTful HTTP endpoints** strictly defined with **OpenAPI 3.1** and shared TypeScript schemas (`@kashyap/contracts`).
- Real-Time Protocol: **WebSocket (Socket.IO/WSS)** with JWT handshake authentication, heartbeat liveness, and room-based channel routing for chat and alerts.

## 3. Alternatives Considered
| Alternative | Evaluation & Rationale for Rejection |
|-------------|--------------------------------------|
| **GraphQL** | Increased query complexity and caching challenges; REST with OpenAPI offers better client code generation in Flutter and simpler HTTP caching. |
| **gRPC-Web** | Complex proxy setup required for web clients; limited benefit over JSON for mobile clients given modern HTTP/2 compression. |
| **Server-Sent Events (SSE)** | Unidirectional; lacks bidirectional channel capabilities required for real-time mobile chat. |

## 4. Consequences
- **Positive**: Automated client SDK generation; standard HTTP caching headers; reliable WebSocket reconnection and room isolation.
- **Negative**: Two communication protocols to maintain and monitor.

## 5. Security & Privacy Impact
- Bearer JWT token authentication on all REST endpoints and WebSocket handshake connection hooks.

## 6. Scaling Impact
- Redis adapter for Socket.IO allows multi-node horizontal scaling of real-time gateways.

## 7. Operational Impact
- Interactive Swagger UI available at `/api/docs`; WebSocket healthcheck endpoints for load balancer liveness probes.
