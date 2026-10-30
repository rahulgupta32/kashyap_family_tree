import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';
import 'package:kashyap_mobile/screens/account_deletion_screen.dart';
import 'package:kashyap_mobile/screens/profile_privacy_screen.dart';
import 'package:kashyap_mobile/services/genealogy_api_service.dart';
import 'package:kashyap_mobile/widgets/profile_photo_editor.dart';
import 'native_session_test.dart' show jsonResponse;

String accountToken(String owner) =>
    'fixture.${base64Url.encode(utf8.encode(jsonEncode({'sub': owner})))}.fixture';

Map<String, dynamic> privateProfile(String owner) => {
  'avatarAssetId': '$owner-private-avatar',
  'person': {
    'currentAddress': '$owner-private-address',
    'occupation': '$owner-private-occupation',
    'education': '$owner-private-education',
    'biography': '$owner-private-biography',
  },
  'privacy': {
    'profileVisibility': 'PRIVATE',
    'contactVisibility': 'PRIVATE',
    'addressVisibility': 'PRIVATE',
  },
};

// Fake profile callbacks deliberately bypass the transport's generation fence:
// these regressions verify that the displayed form has its own session fence.
class SessionProfileApi extends GenealogyApiService {
  final Future<Map<String, dynamic>> Function() readProfile;
  Future<Map<String, dynamic>> Function()? finishSave;
  final writes = <Map<String, dynamic>>[];
  int reads = 0;
  SessionProfileApi(this.readProfile)
      : super(client: MockClient((_) async => jsonResponse({'status': 'FAILED'})));

  @override
  Future<Map<String, dynamic>> getMyProfile() {
    reads++;
    return readProfile();
  }

  @override
  Future<Map<String, dynamic>> updateProfileDetails({
    String? occupation,
    String? education,
    String? biography,
    String? currentAddress,
    Map<String, String>? privacy,
  }) async {
    writes.add({
      'owner': chatAccountId,
      'currentAddress': currentAddress,
      'occupation': occupation,
      'education': education,
      'biography': biography,
      'privacy': Map<String, String>.from(privacy ?? {}),
    });
    return finishSave == null ? {} : await finishSave!();
  }
}

const saveLabel = 'सेटिङहरू सुरक्षित गर्नुहोस् (Save Settings)';
const sessionLabel = 'सत्र परिवर्तन भयो। फेरि साइन इन गरी प्रोफाइल खोल्नुहोस्। (Session changed; sign in and reopen profile.)';
const successLabel = 'प्रोफाइल तथा गोपनीयता सेटिङ सफलतापूर्वक सुरक्षित गरियो।';

void expectExpired(WidgetTester tester) {
  expect(find.text(sessionLabel), findsOneWidget);
  expect(find.textContaining('A-private-'), findsNothing);
  expect(find.byType(TextField), findsNothing);
  expect(find.byType(DropdownButtonFormField<String>), findsNothing);
  expect(find.byType(ProfilePhotoEditor), findsNothing);
  expect(find.text(saveLabel), findsNothing);
  expect(tester.widget<IconButton>(find.byKey(const Key('account-deletion-open'))).onPressed, isNull);
}

void main() {
  group('Profile form session isolation (fake callbacks; not real-device acceptance)', () {
    testWidgets('replacement clears loaded private state synchronously and stale actions cannot patch B', (tester) async {
      final api = SessionProfileApi(() async => privateProfile('A'))..setAuthToken(accountToken('A'));
      addTearDown(api.dispose);
      await tester.pumpWidget(MaterialApp(home: ProfilePrivacyScreen(apiService: api)));
      await tester.pumpAndSettle();
      expect(find.text('A-private-address'), findsOneWidget);
      expect(tester.widget<ProfilePhotoEditor>(find.byType(ProfilePhotoEditor)).initialAsset, 'A-private-avatar');
      final controllers = tester.widgetList<TextField>(find.byType(TextField)).map((field) => field.controller!).toList();
      final staleSave = tester.widget<ElevatedButton>(find.widgetWithText(ElevatedButton, saveLabel)).onPressed!;
      final staleDelete = tester.widget<IconButton>(find.byKey(const Key('account-deletion-open'))).onPressed!;
      final staleScope = tester.widgetList<DropdownButtonFormField<String>>(find.byType(DropdownButtonFormField<String>)).first.onChanged!;

      api.setAuthToken(accountToken('B'));
      expect(controllers.every((controller) => controller.text.isEmpty), isTrue);
      staleSave();
      staleDelete();
      staleScope('PUBLIC');
      await tester.pumpAndSettle();
      expectExpired(tester);
      expect(api.writes, isEmpty);
      expect(find.byType(AccountDeletionScreen), findsNothing);
      await tester.pumpWidget(const SizedBox.shrink());
    });

    testWidgets('late old profile load cannot restore private fields or avatar after replacement', (tester) async {
      final response = Completer<Map<String, dynamic>>();
      final api = SessionProfileApi(() => response.future)..setAuthToken(accountToken('A'));
      addTearDown(api.dispose);
      await tester.pumpWidget(MaterialApp(home: ProfilePrivacyScreen(apiService: api)));
      await tester.pump();
      api.setAuthToken(accountToken('B'));
      response.complete(privateProfile('A'));
      await tester.pumpAndSettle();
      expectExpired(tester);
      expect(api.reads, 1);
      expect(api.writes, isEmpty);
      await tester.pumpWidget(const SizedBox.shrink());
    });

    for (final failed in [false, true]) {
      testWidgets('late ${failed ? 'failed' : 'successful'} old save cannot change replacement state', (tester) async {
        final response = Completer<Map<String, dynamic>>();
        final api = SessionProfileApi(() async => privateProfile('A'))..setAuthToken(accountToken('A'));
        api.finishSave = () => response.future;
        addTearDown(api.dispose);
        await tester.pumpWidget(MaterialApp(home: ProfilePrivacyScreen(apiService: api)));
        await tester.pumpAndSettle();
        final save = find.widgetWithText(ElevatedButton, saveLabel);
        await tester.ensureVisible(save);
        await tester.tap(save);
        await tester.pump();
        expect(api.writes.single['owner'], 'A');
        expect(tester.widgetList<TextField>(find.byType(TextField)).every((field) => field.enabled == false), isTrue);
        api.setAuthToken(accountToken('B'));
        if (failed) {
          response.completeError(Exception('A-private-server-diagnostic'));
        } else {
          response.complete({});
        }
        await tester.pumpAndSettle();
        expectExpired(tester);
        expect(find.text(successLabel), findsNothing);
        expect(api.writes.length, 1);
        expect(api.writes.where((write) => write['owner'] == 'B'), isEmpty);
        await tester.pumpWidget(const SizedBox.shrink());
      });
    }

    testWidgets('replacement API cannot inherit the old form even without a session notification', (tester) async {
      final first = SessionProfileApi(() async => privateProfile('A'))..setAuthToken(accountToken('A'));
      final second = SessionProfileApi(() async => privateProfile('B'))..setAuthToken(accountToken('B'));
      addTearDown(first.dispose);
      addTearDown(second.dispose);
      const key = ValueKey('same-profile-route');
      await tester.pumpWidget(MaterialApp(home: ProfilePrivacyScreen(key: key, apiService: first)));
      await tester.pumpAndSettle();
      final staleSave = tester.widget<ElevatedButton>(find.widgetWithText(ElevatedButton, saveLabel)).onPressed!;
      await tester.pumpWidget(MaterialApp(home: ProfilePrivacyScreen(key: key, apiService: second)));
      staleSave();
      await tester.pumpAndSettle();
      expectExpired(tester);
      expect(first.writes, isEmpty);
      expect(second.writes, isEmpty);
      expect(second.reads, 0);
      await tester.pumpWidget(const SizedBox.shrink());
    });

    testWidgets('signed-out opening exposes no form, profile read, photo or deletion action', (tester) async {
      final api = SessionProfileApi(() async => privateProfile('A'));
      addTearDown(api.dispose);
      await tester.pumpWidget(MaterialApp(home: ProfilePrivacyScreen(apiService: api)));
      await tester.pumpAndSettle();
      expectExpired(tester);
      expect(api.reads, 0);
      expect(api.writes, isEmpty);
      await tester.pumpWidget(const SizedBox.shrink());
    });

    testWidgets('profile failure hides raw diagnostics and cannot submit empty defaults', (tester) async {
      final api = SessionProfileApi(() async => throw Exception('A-private-server-diagnostic'))..setAuthToken(accountToken('A'));
      addTearDown(api.dispose);
      await tester.pumpWidget(MaterialApp(home: ProfilePrivacyScreen(apiService: api)));
      await tester.pumpAndSettle();
      expect(find.textContaining('A-private-'), findsNothing);
      expect(find.byType(TextField), findsNothing);
      expect(find.text(saveLabel), findsNothing);
      expect(find.text('पुनः प्रयास (Retry)'), findsOneWidget);
      expect(api.writes, isEmpty);
      await tester.pumpWidget(const SizedBox.shrink());
    });
  });
}
