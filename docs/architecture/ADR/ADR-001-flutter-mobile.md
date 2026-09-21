# ADR-001: Flutter for Mobile Applications

**Status**: Accepted (Baseline)  
**Date**: 2026-09-09  
**Decision Makers**: Jyphra Technology Pvt. Ltd.  
**Requirements References**: AUTH-FR, PROF-FR, GEN-FR, CHAT-FR, COM-FR, MAP-FR, I18N-FR, NFR-COMP-001, NFR-NET-001

## 1. Context
The Kashyap Adhikari Family Tree platform requires native-quality mobile applications for both Android and iOS in Nepal and the global diaspora. The app features complex multi-generation genealogy tree rendering (pinch-to-zoom, pan, dynamic node layout), real-time chat, offline data caching, camera/attachment verification flows, push notifications, and rich Devanagari (Nepali) typography.

## 2. Decision
Adopt **Flutter (Dart 3.x)** as the cross-platform mobile framework for the Android and iOS member application.

## 3. Alternatives Considered
| Alternative | Evaluation & Rationale for Rejection |
|-------------|--------------------------------------|
| **React Native** | Bridge serialization bottleneck during high-node-count canvas tree rendering; inferior Devanagari text shaping out of the box. |
| **Native (Kotlin/Android + Swift/iOS)** | Double development and QA budget; synchronization drift risk for business rules and tree algorithms. |
| **Kotlin Multiplatform (KMP)** | Compose Multiplatform for iOS was less mature for complex canvas gestures during baseline evaluation. |

## 4. Consequences
- **Positive**: Single codebase for Android/iOS; Skia/Impeller hardware-accelerated 60fps graph rendering; consistent UI tokens across platforms.
- **Negative**: Native bridging required for platform-specific hardware/APNs; macOS CI required for iOS signing (tracked under Open Gate HG-007).

## 5. Security & Privacy Impact
- Secure storage via Android Keystore / iOS Keychain for JWT refresh tokens.
- Certificate pinning on mobile API client against MITM attacks.
- Local biometric authentication (Fingerprint / Face ID) for sensitive profile access.

## 6. Scaling Impact
- High client-side canvas rendering efficiency reduces backend compute load; clients request subtree slices and render graph layout locally.

## 7. Operational Impact
- Automated CI builds for Android APK/AAB; Fastlane scripts for Play Store and TestFlight distribution.
