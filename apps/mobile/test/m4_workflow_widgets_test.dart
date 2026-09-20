import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';
import 'package:kashyap_mobile/screens/sign_in_screen.dart';
import 'package:kashyap_mobile/screens/profile_privacy_screen.dart';
import 'package:kashyap_mobile/screens/calendar_events_screen.dart';
import 'package:kashyap_mobile/screens/person_search_screen.dart';
import 'package:kashyap_mobile/screens/claim_profile_screen.dart';
import 'package:kashyap_mobile/services/genealogy_api_service.dart';
import 'native_session_test.dart' show MemorySessionStore, jsonResponse;
import 'api_smoke_flow_test.dart' show FakeGenealogyApiService;

void main() {
  group('M4 workflow widgets (mock HTTP; live device acceptance is separate)', () {
    testWidgets('sign-in UI submits the returned OTP challenge and stores the session', (tester) async {
      var signedIn = false;
      final store = MemorySessionStore();
      final service = GenealogyApiService(sessionStore: store, client: MockClient((request) async {
        if (request.url.path == '/auth/otp/request') {
          return jsonResponse({'otpSessionId': 'ui-challenge'});
        }
        expect(request.url.path, '/auth/native/verify');
        expect(jsonDecode(request.body)['otpSessionId'], 'ui-challenge');
        expect(jsonDecode(request.body)['code'], '123456');
        return jsonResponse({'accessToken': 'ui-access', 'refreshToken': 'ui-refresh'});
      }));
      addTearDown(service.dispose);
      await tester.pumpWidget(MaterialApp(home: SignInScreen(apiService: service,
        onSignedIn: () => signedIn = true, onBrowsePublic: () {})));
      await tester.enterText(find.byKey(const Key('sign-in-phone')), '+9779840000001');
      await tester.tap(find.byKey(const Key('sign-in-submit')));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('sign-in-code')), '123456');
      await tester.tap(find.byKey(const Key('sign-in-submit')));
      await tester.pumpAndSettle();
      expect(signedIn, isTrue);
      expect(service.authToken, 'ui-access');
      expect(store.value, contains('ui-refresh'));
    });

    testWidgets('profile loads saved values and saves details and privacy in one request', (tester) async {
      var patches = 0;
      final service = GenealogyApiService(client: MockClient((request) async {
        if (request.method == 'GET') {
          return jsonResponse({'person': {'currentAddress': 'Saved address', 'occupation': 'Teacher'},
            'privacy': {'profileVisibility': 'PRIVATE', 'contactVisibility': 'IMMEDIATE_FAMILY', 'addressVisibility': 'PRIVATE'}});
        }
        patches++;
        expect(request.method, 'PATCH');
        expect(request.url.path, '/profile/profile');
        final body = jsonDecode(request.body);
        expect(body['currentAddress'], 'Updated address');
        expect(body['occupation'], 'Teacher');
        expect(body['privacy']['profileVisibility'], 'PRIVATE');
        return jsonResponse({});
      }))..setAuthToken('mock-access');
      addTearDown(service.dispose);
      await tester.pumpWidget(MaterialApp(home: ProfilePrivacyScreen(apiService: service)));
      await tester.pumpAndSettle();
      expect(find.text('Saved address'), findsOneWidget);
      await tester.enterText(find.byType(TextField).first, 'Updated address');
      final save = find.text('सेटिङहरू सुरक्षित गर्नुहोस् (Save Settings)');
      await tester.ensureVisible(save);
      await tester.tap(save);
      await tester.pumpAndSettle();
      expect(patches, 1);
      expect(find.text('प्रोफाइल तथा गोपनीयता सेटिङ सफलतापूर्वक सुरक्षित गरियो।'), findsOneWidget);
    });

    testWidgets('failed profile loading cannot overwrite fields with empty defaults', (tester) async {
      final service = GenealogyApiService(client: MockClient((_) async => jsonResponse({}, 503)));
      addTearDown(service.dispose);
      await tester.pumpWidget(MaterialApp(home: ProfilePrivacyScreen(apiService: service)));
      await tester.pumpAndSettle();
      expect(find.byType(TextField), findsNothing);
      expect(find.text('पुनः प्रयास (Retry)'), findsOneWidget);
    });

    testWidgets('calendar RSVP posts the chosen event and reloads persisted response', (tester) async {
      String? rsvp;
      var loads = 0;
      final service = GenealogyApiService(client: MockClient((request) async {
        expect(request.headers['Authorization'], 'Bearer mock-access');
        if (request.method == 'POST') {
          expect(request.url.path, '/calendar/events/event-2/rsvp');
          rsvp = jsonDecode(request.body)['response'];
          return jsonResponse({'success': true, 'myRsvp': rsvp});
        }
        loads++;
        return jsonResponse([{'id': 'event-2', 'title': 'Fictional family gathering', 'audienceScope': 'COMMUNITY', 'myRsvp': rsvp}]);
      }))..setAuthToken('mock-access');
      addTearDown(service.dispose);
      await tester.pumpWidget(MaterialApp(home: CalendarEventsScreen(apiService: service)));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('rsvp-event-2-GOING')));
      await tester.pumpAndSettle();
      expect(rsvp, 'GOING');
      expect(loads, 2);
      expect(tester.widget<ChoiceChip>(find.byKey(const ValueKey('rsvp-event-2-GOING'))).selected, isTrue);
    });

    testWidgets('drawer claim uses explicitly selected second person, not the first result', (tester) async {
      final service = FakeGenealogyApiService()..setAuthToken('mock-access');
      addTearDown(service.dispose);
      await tester.pumpWidget(MaterialApp(home: PersonSearchScreen(apiService: service)));
      await tester.pumpAndSettle();
      await tester.tap(find.text('हरि प्रसाद अधिकारी (परीक्षण)'));
      await tester.pumpAndSettle();
      await tester.pageBack();
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Open navigation menu'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('दाबी प्रमाणीकरण (Profile Claims)'));
      await tester.pumpAndSettle();
      expect(tester.widget<ClaimProfileScreen>(find.byType(ClaimProfileScreen)).personId, 'p-201');
    });
  });
}
