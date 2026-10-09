import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';
import 'package:kashyap_mobile/screens/calendar_recurrence_screen.dart';
import 'package:kashyap_mobile/services/genealogy_api_service.dart';
import 'native_session_test.dart' show jsonResponse;

String token(String owner) => 'x.${base64Url.encode(utf8.encode(jsonEncode({'sub': owner})))}.x';
Map<String,dynamic> rule(String state) => {'id':'rule-1','version':state == 'WITHDRAWN' ? 3 : 2,'source_event_id':'event-1','source_version':4,'source_date':'2020-02-29','local_time':'09:00','leap_policy':'MARCH_01','source_ref':'Fictional date evidence','state':state};
Future<void> tap(WidgetTester tester, String text) async {
  final finder=find.text(text);await tester.ensureVisible(finder);await tester.tap(finder);await tester.pumpAndSettle();
}
void main() {
 testWidgets('preview and withdrawal preserve rule version and refresh terminal state', (tester) async {
  var state='APPROVED';
  final api=GenealogyApiService(client:MockClient((request) async {
   if(request.url.path.endsWith('/preview')){expect(request.url.queryParameters['year'],'2027');return jsonResponse({'year':2027,'startsAt':'2027-03-01T03:15:00Z','deliveryEnabled':true});}
   if(request.method=='POST'){expect(jsonDecode(request.body),{'version':2,'decision':'WITHDRAWN','reason':'Fictional consent withdrawal'});state='WITHDRAWN';return jsonResponse(rule(state));}
   return jsonResponse({'items':[rule(state)],'nextAfter':null});
  }))..setAuthToken(token('owner'));
  addTearDown(api.dispose);
  await tester.pumpWidget(MaterialApp(home:CalendarRecurrenceScreen(api:api)));await tester.pumpAndSettle();
  await tester.enterText(find.widgetWithText(TextField,'AD वर्ष 2000–2090 (Preview year)'),'2027');
  await tap(tester,'पूर्वावलोकन (Preview)');expect(find.byKey(const ValueKey('recurrence-preview')),findsOneWidget);
  await tester.enterText(find.widgetWithText(TextField,'निर्णय वा फिर्ताको कारण (Decision or withdrawal reason)'),'Fictional consent withdrawal');
  await tap(tester,'सहमति फिर्ता (Withdraw)');expect(find.textContaining('WITHDRAWN'),findsOneWidget);expect(find.text('सहमति फिर्ता (Withdraw)'),findsNothing);
  await tester.pumpWidget(const SizedBox());
 });
 testWidgets('paging carries exact cursor and denied reviewer queue clears owner evidence', (tester) async {
  final queries=<Map<String,String>>[];
  final api=GenealogyApiService(client:MockClient((request) async {
   final q=request.url.queryParameters;queries.add(q);
   if(q['queue']=='true')return jsonResponse({'message':'Current reviewer authority required'},403);
   return jsonResponse({'items':[q.containsKey('after')?{...rule('REJECTED'),'id':'rule-2','source_ref':'Second evidence'}:rule('PENDING')],'nextAfter':q.containsKey('after')?null:'cursor-exact'});
  }))..setAuthToken(token('owner'));addTearDown(api.dispose);
  await tester.pumpWidget(MaterialApp(home:CalendarRecurrenceScreen(api:api)));await tester.pumpAndSettle();
  await tap(tester,'थप प्रस्ताव (More proposals)');expect(queries.last,{'queue':'false','after':'cursor-exact'});expect(find.text('Second evidence'),findsOneWidget);
  await tester.ensureVisible(find.byType(SwitchListTile));await tester.tap(find.byType(SwitchListTile));await tester.pumpAndSettle();
  expect(find.text('Fictional date evidence'),findsNothing);expect(find.text('Second evidence'),findsNothing);expect(find.textContaining('Current reviewer authority required'),findsOneWidget);
  await tester.pumpWidget(const SizedBox());
 });
 testWidgets('late response after account switch cannot display previous private evidence', (tester) async {
  final pending=Completer<Map<String,dynamic>>();
  final api=GenealogyApiService(client:MockClient((_) async => jsonResponse(await pending.future)))..setAuthToken(token('owner'));
  addTearDown(api.dispose);
  await tester.pumpWidget(MaterialApp(home:CalendarRecurrenceScreen(api:api)));await tester.pump();
  api.setAuthToken(token('other'));pending.complete({'items':[rule('PENDING')],'nextAfter':null});
  await tester.pumpAndSettle();expect(find.text('Fictional date evidence'),findsNothing);expect(find.textContaining('Session changed'),findsOneWidget);
  await tester.pumpWidget(const SizedBox());
 });
}
