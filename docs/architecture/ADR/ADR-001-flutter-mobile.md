# ADR-001: Flutter for Mobile Applications

**Status**: Accepted (Baseline)  
**Date**: 2026-09-09  
**Decision Makers**: Jyphra Technology Pvt. Ltd.  
**Source**: Master Requirements Specification §21

## Context

The Kashyap Adhikari Family Tree requires native-quality mobile applications for both Android and iOS. The application includes complex genealogy tree visualization, real-time chat, offline capabilities, and bilingual (Nepali/English) support including Devanagari script rendering.

## Decision

Use **Flutter (Dart)** as the cross-platform mobile framework for the Android and iOS member application.

## Rationale

- Single high-quality codebase for both platforms
- Mature UI framework with excellent performance characteristics
- Native integration support for camera, push notifications, secure storage
- Strong Devanagari/Unicode text rendering
- Growing ecosystem and long-term Google backing
- Proven genealogy/tree visualization capabilities
- Platform accessibility semantics support

## Consequences

### Positive
- Reduced development time vs. maintaining two native codebases
- Consistent UX across platforms
- Hot reload for rapid development
- Rich widget library for complex UI (tree visualization, chat)

### Negative
- Team must maintain Flutter/Dart expertise
- Native platform bridges required for some device features
- iOS builds require macOS CI infrastructure (documented as gate HG-007)
- Slightly larger app binary than pure native

## Alternatives Considered

| Alternative | Rejected Because |
|-------------|-----------------|
| React Native | Flutter has better performance for complex tree rendering; baseline specifies Flutter |
| Native (Kotlin + Swift) | Double development effort; baseline specifies Flutter |
| Kotlin Multiplatform | Less mature for full-stack mobile UI; baseline specifies Flutter |

---

*This ADR implements the baseline decision from Master Requirements Specification §21 ADR-001.*
