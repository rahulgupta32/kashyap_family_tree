import 'dart:async';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import 'native_push_lifecycle.dart';

// These are Firebase app identifiers, not server credentials. They must match
// the approved native bundle/application IDs before enabling push on a device.
const _apiKey = String.fromEnvironment('FIREBASE_API_KEY');
const _appId = String.fromEnvironment('FIREBASE_APP_ID');
const _senderId = String.fromEnvironment('FIREBASE_MESSAGING_SENDER_ID');
const _projectId = String.fromEnvironment('FIREBASE_PROJECT_ID');

bool get firebasePushConfigured => !kIsWeb &&
    (defaultTargetPlatform == TargetPlatform.android || defaultTargetPlatform == TargetPlatform.iOS) &&
    _apiKey.isNotEmpty && _appId.isNotEmpty && _senderId.isNotEmpty && _projectId.isNotEmpty;

class FirebasePushSource implements PushTokenSource {
  Future<void>? _initialization;

  Future<void> _initialize() async {
    if (!firebasePushConfigured) { throw StateError('Push is not configured'); }
    _initialization ??= Firebase.initializeApp(options: const FirebaseOptions(
      apiKey: _apiKey, appId: _appId, messagingSenderId: _senderId, projectId: _projectId,
    )).then<void>((_) {});
    try { await _initialization; }
    catch (_) { _initialization = null; rethrow; }
  }

  @override
  Future<bool> permissionGranted({bool request = false}) async {
    await _initialize();
    final messaging = FirebaseMessaging.instance;
    final settings = request
        ? await messaging.requestPermission(alert: true, badge: true, sound: true)
        : await messaging.getNotificationSettings();
    return settings.authorizationStatus == AuthorizationStatus.authorized ||
        settings.authorizationStatus == AuthorizationStatus.provisional;
  }

  @override
  Future<String?> currentToken() async {
    await _initialize();
    // APNs registration is asynchronous. Retry on the next app resume if it
    // has not arrived; never call getToken ahead of APNs on Apple platforms.
    if (defaultTargetPlatform == TargetPlatform.iOS &&
        await FirebaseMessaging.instance.getAPNSToken() == null) { return null; }
    await FirebaseMessaging.instance.setAutoInitEnabled(true);
    return FirebaseMessaging.instance.getToken();
  }

  @override
  Stream<String> get tokenChanges => FirebaseMessaging.instance.onTokenRefresh;

  @override
  Future<void> stop() async {
    if (_initialization != null) {
      await _initialize();
      await FirebaseMessaging.instance.setAutoInitEnabled(false);
    }
  }
}
