import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kashyap_mobile/screens/account_deletion_screen.dart';
import 'package:kashyap_mobile/services/genealogy_api_service.dart';
import 'package:kashyap_mobile/services/session_store.dart';
import 'package:kashyap_mobile/services/chat_outbox.dart';

class MemorySession implements SessionStore {
  String? value = 'fictional credentials';
  @override Future<String?> read() async => value;
  @override Future<void> write(String v) async { value = v; }
  @override Future<void> clear() async { value = null; }
}
class MemoryOutbox implements ChatOutboxStore {
  String? value;
  bool cleared = false;
  @override Future<String?> read() async => value;
  @override Future<void> write(String v) async { value = v; }
  @override Future<void> clear() async { value = null; cleared = true; }
}
http.Response jsonResponse(Object value, [int status = 200]) => http.Response(jsonEncode(value), status, headers: {'content-type':'application/json'});
Map<String,dynamic> challenge() => {'challengeId':'fictional-challenge', 'expiresAt':DateTime.now().add(const Duration(minutes:5)).toIso8601String()};
Future<void> ready(WidgetTester tester) async {
  await tester.tap(find.byKey(const Key('deletion-request'))); await tester.pumpAndSettle();
  await tester.enterText(find.byKey(const Key('deletion-code')), '123456');
  await tester.tap(find.byKey(const Key('deletion-confirm'))); await tester.pumpAndSettle();
}
void main() {
  testWidgets('requires code and explicit confirmation; confirmed result clears credentials and outbox', (tester) async {
    final session=MemorySession(), outbox=MemoryOutbox(); final bodies=<dynamic>[];
    final api=GenealogyApiService(sessionStore:session,chatOutboxStore:outbox,client:MockClient((r) async {
      if(r.url.path.endsWith('delete-challenge')) return jsonResponse(challenge());
      bodies.add(jsonDecode(r.body));return jsonResponse({'success':true,'genealogyPreserved':true,'deletedAt':DateTime.now().toIso8601String()});
    }))..setAuthToken('old'); addTearDown(api.dispose);
    var confirmedEvents=0;api.onAccountDeleted=()=>confirmedEvents++;
    await tester.pumpWidget(MaterialApp(home:AccountDeletionScreen(api:api)));
    await tester.tap(find.byKey(const Key('deletion-request')));await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('deletion-code')), '123456');
    expect(tester.widget<ElevatedButton>(find.byKey(const Key('deletion-submit'))).onPressed,isNull);expect(bodies,isEmpty);
    await tester.tap(find.byKey(const Key('deletion-confirm')));await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('deletion-submit')));await tester.pumpAndSettle();
    expect(bodies,[{'challengeId':'fictional-challenge','otp':'123456'}]);expect(api.authToken,isNull);
    expect(session.value,isNull);expect(outbox.cleared,isTrue);expect(confirmedEvents,1);expect(find.textContaining('Account deleted; genealogy preserved'),findsOneWidget);
  });
  testWidgets('unconfirmed deletion preserves session and hides server diagnostics', (tester) async {
    final api=GenealogyApiService(client:MockClient((r) async => r.url.path.endsWith('delete-challenge') ? jsonResponse(challenge()) : jsonResponse({'message':'Private raw diagnostic'},503)))..setAuthToken('old');addTearDown(api.dispose);
    await tester.pumpWidget(MaterialApp(home:AccountDeletionScreen(api:api)));await ready(tester);
    await tester.tap(find.byKey(const Key('deletion-submit')));await tester.pumpAndSettle();
    expect(api.authToken,'old');expect(find.textContaining('Outcome unconfirmed'),findsOneWidget);expect(find.textContaining('Private raw diagnostic'),findsNothing);
  });
  testWidgets('late deletion response cannot clear replacement session or show success', (tester) async {
    final response=Completer<http.Response>();var posts=0;
    final api=GenealogyApiService(client:MockClient((r) async {
      if(r.url.path.endsWith('delete-challenge')) return jsonResponse(challenge());posts++;return response.future;
    }))..setAuthToken('old');addTearDown(api.dispose);
    var confirmedEvents=0;api.onAccountDeleted=()=>confirmedEvents++;
    await tester.pumpWidget(MaterialApp(home:AccountDeletionScreen(api:api)));await ready(tester);
    final retained=tester.widget<ElevatedButton>(find.byKey(const Key('deletion-submit'))).onPressed!;
    retained();retained();await tester.pump();expect(posts,1);
    api.setAuthToken('replacement');response.complete(jsonResponse({'success':true,'genealogyPreserved':true,'deletedAt':DateTime.now().toIso8601String()}));await tester.pumpAndSettle();
    expect(api.authToken,'replacement');expect(confirmedEvents,0);expect(find.byKey(const Key('deletion-code')),findsNothing);expect(find.textContaining('Account deleted; genealogy preserved'),findsNothing);
    retained();await tester.pump();expect(posts,1);
  });
  testWidgets('invalid success acknowledgement never clears a live session', (tester) async {
    final api=GenealogyApiService(client:MockClient((r) async => r.url.path.endsWith('delete-challenge') ? jsonResponse(challenge()) : jsonResponse({'success':true})))..setAuthToken('old');addTearDown(api.dispose);
    await tester.pumpWidget(MaterialApp(home:AccountDeletionScreen(api:api)));await ready(tester);
    await tester.tap(find.byKey(const Key('deletion-submit')));await tester.pumpAndSettle();
    expect(api.authToken,'old');expect(find.textContaining('Outcome unconfirmed'),findsOneWidget);
  });
}
