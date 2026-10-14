import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kashyap_mobile/localization/calendar_labels.dart';
import 'package:kashyap_mobile/screens/calendar_events_screen.dart';
import 'package:kashyap_mobile/screens/calendar_session_guard.dart';
import 'package:kashyap_mobile/services/genealogy_api_service.dart';
import 'native_session_test.dart' show jsonResponse;

const titleKey = ValueKey('calendar-title');
const descriptionKey = ValueKey('calendar-description');
const locationKey = ValueKey('calendar-location');
Map<String,dynamic> ordinaryEvent({bool canManage=true}) => {
  'id':'event-1', 'title':'Fictional meeting', 'description':'Approved private details', 'location':'Approved venue',
  'eventType':'COMMUNITY_MEETING', 'audienceScope':'INVITED_ONLY', 'canManage':canManage,
  'version':4, 'lifecycleState':'ACTIVE', 'startsAt':'2027-01-02T04:15:00Z', 'reminderOffsets':[60],
  'audienceSelection':{'type':'BRANCH','branchId':'branch-1'},
};
Future<void> tapButton(WidgetTester tester, String label) async {
  final finder=find.widgetWithText(TextButton,label);
  await tester.ensureVisible(finder); await tester.tap(finder); await tester.pumpAndSettle();
}
Future<void> createDialog(WidgetTester tester) async {
  await tester.tap(find.byTooltip(calendarLabels['create']!)); await tester.pumpAndSettle();
}
Future<void> chooseDate(WidgetTester tester) async {
  await tapButton(tester,calendarLabels['time']!);
  await tester.tap(find.text('OK').last); await tester.pumpAndSettle();
  await tester.tap(find.text('OK').last); await tester.pumpAndSettle();
}

void main(){
 testWidgets('ordinary community meeting create posts trimmed details and explicit date without source inference',(tester) async {
  Map<String,dynamic>? submitted;
  final api=GenealogyApiService(client:MockClient((request)async{
   if(request.method=='POST'){expect(request.url.path,'/calendar/events');submitted=jsonDecode(request.body) as Map<String,dynamic>;return jsonResponse(ordinaryEvent(),201);}
   return jsonResponse(submitted==null?[]:[{...ordinaryEvent(),...submitted!}]);
  }))..setAuthToken('mock-access');addTearDown(api.dispose);
  await tester.pumpWidget(MaterialApp(home:CalendarEventsScreen(apiService:api)));await tester.pumpAndSettle();await createDialog(tester);
  await tester.enterText(find.byKey(titleKey),'  Fictional community meeting  ');
  await tester.enterText(find.byKey(descriptionKey),'  Organizers approved these details.  ');
  await tester.enterText(find.byKey(locationKey),'  Fictional hall  ');
  await tester.ensureVisible(find.byKey(const ValueKey('calendar-event-type')));await tester.tap(find.byKey(const ValueKey('calendar-event-type')));await tester.pumpAndSettle();
  await tester.tap(find.text(calendarLabels['communityMeeting']!).last);await tester.pumpAndSettle();
  expect(find.text('SHRADDHA'),findsNothing);await chooseDate(tester);
  await tapButton(tester,calendarLabels['save']!);
  expect(submitted,containsPair('title','Fictional community meeting'));expect(submitted,containsPair('eventType','COMMUNITY_MEETING'));
  expect(submitted,containsPair('description','Organizers approved these details.'));expect(submitted,containsPair('location','Fictional hall'));
  expect(submitted!['audienceScope'],'COMMUNITY');expect(submitted!['reminderOffsets'],isEmpty);expect(DateTime.parse(submitted!['startsAt'] as String).isUtc,isTrue);
  expect(submitted!.keys.toSet(),{'title','description','location','eventType','audienceScope','startsAt','reminderOffsets'});
  expect(find.byType(AlertDialog),findsNothing);expect(find.text('Organizers approved these details.'),findsOneWidget);
  expect(find.text('${calendarLabels['location']}: Fictional hall'),findsOneWidget);
 });

 testWidgets('default general event normalizes empty optional fields',(tester)async{
  Map<String,dynamic>? submitted;
  final api=GenealogyApiService(client:MockClient((request)async{
   if(request.method=='POST'){submitted=jsonDecode(request.body) as Map<String,dynamic>;return jsonResponse({},201);}return jsonResponse([]);
  }))..setAuthToken('mock-access');addTearDown(api.dispose);
  await tester.pumpWidget(MaterialApp(home:CalendarEventsScreen(apiService:api)));await tester.pumpAndSettle();await createDialog(tester);
  await tester.enterText(find.byKey(titleKey),'General fixture');await tester.enterText(find.byKey(descriptionKey),'   ');await tester.enterText(find.byKey(locationKey),'  ');
  await chooseDate(tester);await tapButton(tester,calendarLabels['save']!);
  expect(submitted!['eventType'],'GENERAL_EVENT');expect(submitted!['description'],'');expect(submitted!['location'],'');
 });

 testWidgets('create validates title, details and venue UTF16 bounds before any request',(tester)async{
  var writes=0;
  final api=GenealogyApiService(client:MockClient((request)async{if(request.method=='POST')writes++;return jsonResponse([]);}))..setAuthToken('mock-access');addTearDown(api.dispose);
  await tester.pumpWidget(MaterialApp(home:CalendarEventsScreen(apiService:api)));await tester.pumpAndSettle();await createDialog(tester);
  await tester.enterText(find.byKey(titleKey),List.filled(128,'😀').join());await tapButton(tester,calendarLabels['save']!);
  expect(find.text(calendarLabels['titleLimit']!),findsOneWidget);
  await tester.enterText(find.byKey(titleKey),'Valid title');await tester.enterText(find.byKey(descriptionKey),List.filled(10001,'a').join());await tapButton(tester,calendarLabels['save']!);
  expect(find.text(calendarLabels['descriptionLimit']!),findsOneWidget);
  await tester.enterText(find.byKey(descriptionKey),'Valid details');await tester.enterText(find.byKey(locationKey),List.filled(256,'a').join());await tapButton(tester,calendarLabels['save']!);
  expect(find.text(calendarLabels['locationLimit']!),findsOneWidget);expect(writes,0);
  await tester.enterText(find.byKey(locationKey),'Valid venue');await tapButton(tester,calendarLabels['save']!);
  expect(find.text(calendarLabels['required']!),findsOneWidget);expect(writes,0);
 });

 testWidgets('ordinary edit preserves date type and audience by sending only content plus exact version',(tester)async{
  var current=ordinaryEvent();Map<String,dynamic>? patched;
  final api=GenealogyApiService(client:MockClient((request)async{
   if(request.method=='PATCH'){expect(request.url.path,'/calendar/events/event-1');patched=jsonDecode(request.body) as Map<String,dynamic>;current={...current,...patched!,'version':5};return jsonResponse(current);}
   return jsonResponse([current]);
  }))..setAuthToken('mock-access');addTearDown(api.dispose);
  await tester.pumpWidget(MaterialApp(home:CalendarEventsScreen(apiService:api)));await tester.pumpAndSettle();await tapButton(tester,calendarLabels['edit']!);
  expect(tester.widget<TextField>(find.byKey(descriptionKey)).controller!.text,'Approved private details');expect(tester.widget<TextField>(find.byKey(locationKey)).controller!.text,'Approved venue');
  await tester.enterText(find.byKey(titleKey),' Updated meeting ');await tester.enterText(find.byKey(descriptionKey),' Updated details ');await tester.enterText(find.byKey(locationKey),' New venue ');
  await tapButton(tester,calendarLabels['save']!);
  expect(patched,{'version':4,'title':'Updated meeting','description':'Updated details','location':'New venue'});
  expect(current['startsAt'],'2027-01-02T04:15:00Z');expect(current['eventType'],'COMMUNITY_MEETING');expect(current['audienceScope'],'INVITED_ONLY');
  expect(current['audienceSelection'],{'type':'BRANCH','branchId':'branch-1'});expect(current['reminderOffsets'],[60]);
  expect(find.text('Updated details'),findsOneWidget);expect(find.text('${calendarLabels['location']}: New venue'),findsOneWidget);
 });

 testWidgets('ordinary edit clears optional content explicitly with current version',(tester)async{
  Map<String,dynamic>? patched;
  final api=GenealogyApiService(client:MockClient((request)async{
   if(request.method=='PATCH'){patched=jsonDecode(request.body) as Map<String,dynamic>;return jsonResponse({});}return jsonResponse([ordinaryEvent()]);
  }))..setAuthToken('mock-access');addTearDown(api.dispose);
  await tester.pumpWidget(MaterialApp(home:CalendarEventsScreen(apiService:api)));await tester.pumpAndSettle();await tapButton(tester,calendarLabels['edit']!);
  await tester.enterText(find.byKey(descriptionKey),'  ');await tester.enterText(find.byKey(locationKey),'');await tapButton(tester,calendarLabels['save']!);
  expect(patched,{'version':4,'title':'Fictional meeting','description':'','location':''});
 });

 testWidgets('ordinary edit validates content bounds without changing server state',(tester)async{
  var writes=0;
  final api=GenealogyApiService(client:MockClient((request)async{if(request.method=='PATCH')writes++;return jsonResponse([ordinaryEvent()]);}))..setAuthToken('mock-access');addTearDown(api.dispose);
  await tester.pumpWidget(MaterialApp(home:CalendarEventsScreen(apiService:api)));await tester.pumpAndSettle();await tapButton(tester,calendarLabels['edit']!);
  await tester.enterText(find.byKey(titleKey),'   ');await tapButton(tester,calendarLabels['save']!);expect(find.text(calendarLabels['titleLimit']!),findsOneWidget);
  await tester.enterText(find.byKey(titleKey),'Valid title');await tester.enterText(find.byKey(descriptionKey),List.filled(5001,'😀').join());await tapButton(tester,calendarLabels['save']!);
  expect(find.text(calendarLabels['descriptionLimit']!),findsOneWidget);expect(writes,0);expect(find.byType(AlertDialog),findsOneWidget);
 });

 for(final status in [409,403]){
  testWidgets('server $status retains edit draft and requires explicit reload before another edit',(tester)async{
   var writes=0,reads=0;
   final api=GenealogyApiService(client:MockClient((request)async{
    if(request.method=='PATCH'){writes++;expect(jsonDecode(request.body)['version'],4);return jsonResponse({'message':'Private server details'},status);}
    reads++;return jsonResponse([{...ordinaryEvent(),if(reads>1)'title':'New server revision',if(reads>1)'version':5}]);
   }))..setAuthToken('mock-access');addTearDown(api.dispose);
   await tester.pumpWidget(MaterialApp(home:CalendarEventsScreen(apiService:api)));await tester.pumpAndSettle();await tapButton(tester,calendarLabels['edit']!);
   await tester.enterText(find.byKey(titleKey),'Retained draft');await tester.enterText(find.byKey(descriptionKey),'Retained private details');await tapButton(tester,calendarLabels['save']!);
   expect(find.byType(AlertDialog),findsOneWidget);expect(tester.widget<TextField>(find.byKey(titleKey)).controller!.text,'Retained draft');
   expect(tester.widget<TextField>(find.byKey(descriptionKey)).controller!.text,'Retained private details');expect(find.text('Private server details'),findsNothing);
   expect(tester.widget<TextButton>(find.widgetWithText(TextButton,calendarLabels['save']!)).onPressed,isNull);expect(writes,1);expect(reads,1);
   await tapButton(tester,calendarLabels['closeReload']!);expect(reads,2);expect(find.byType(AlertDialog),findsNothing);expect(find.text('New server revision'),findsOneWidget);
   await tapButton(tester,calendarLabels['edit']!);expect(tester.widget<TextField>(find.byKey(titleKey)).controller!.text,'New server revision');
  });
 }

 testWidgets('invitee sees approved details and venue without organizer edit controls',(tester)async{
  final api=GenealogyApiService(client:MockClient((_)async=>jsonResponse([ordinaryEvent(canManage:false)])))..setAuthToken('mock-access');addTearDown(api.dispose);
  await tester.pumpWidget(MaterialApp(home:CalendarEventsScreen(apiService:api)));await tester.pumpAndSettle();
  expect(find.text('Approved private details'),findsOneWidget);expect(find.text('${calendarLabels['location']}: Approved venue'),findsOneWidget);
  expect(find.text(calendarLabels['communityMeeting']!),findsOneWidget);
  expect(find.text(calendarLabels['edit']!),findsNothing);expect(find.text(calendarLabels['cancel']!),findsNothing);
 });

 testWidgets('other event categories retain legacy title-only edits',(tester)async{
  Map<String,dynamic>? patched;
  final api=GenealogyApiService(client:MockClient((request)async{
   if(request.method=='PATCH'){patched=jsonDecode(request.body) as Map<String,dynamic>;return jsonResponse({});}return jsonResponse([{...ordinaryEvent(),'eventType':'MARRIAGE'}]);
  }))..setAuthToken('mock-access');addTearDown(api.dispose);
  await tester.pumpWidget(MaterialApp(home:CalendarEventsScreen(apiService:api)));await tester.pumpAndSettle();await tapButton(tester,calendarLabels['edit']!);
  expect(find.byKey(descriptionKey),findsNothing);expect(find.byKey(locationKey),findsNothing);await tester.enterText(find.byKey(titleKey),'Revised existing title');await tapButton(tester,calendarLabels['save']!);
  expect(patched,{'version':4,'title':'Revised existing title'});
 });

 testWidgets('session replacement clears ordinary edit controllers and prevents stale save',(tester)async{
  var writes=0;
  final api=GenealogyApiService(client:MockClient((request)async{if(request.method=='PATCH')writes++;return jsonResponse([ordinaryEvent()]);}))..setAuthToken('old');addTearDown(api.dispose);
  await tester.pumpWidget(MaterialApp(home:CalendarEventsScreen(apiService:api)));await tester.pumpAndSettle();await tapButton(tester,calendarLabels['edit']!);
  await tester.enterText(find.byKey(descriptionKey),'Unsubmitted private edit');
  final controller=tester.widget<TextField>(find.byKey(descriptionKey)).controller!;
  final save=tester.widget<TextButton>(find.widgetWithText(TextButton,calendarLabels['save']!)).onPressed!;
  api.setAuthToken('new');expect(controller.text,'');save();await tester.pumpAndSettle();
  expect(writes,0);expect(find.byType(AlertDialog),findsNothing);expect(find.text('Approved private details'),findsNothing);expect(find.text(calendarSessionChanged),findsOneWidget);expect(tester.takeException(),isNull);
 });


 testWidgets('ordinary edit submits once while busy even if the old save callback is retained',(tester)async{
  final pending=Completer<http.Response>();var writes=0;
  final api=GenealogyApiService(client:MockClient((request)async{
   if(request.method=='PATCH'){writes++;return pending.future;}return jsonResponse([ordinaryEvent()]);
  }))..setAuthToken('old');addTearDown(api.dispose);
  await tester.pumpWidget(MaterialApp(home:CalendarEventsScreen(apiService:api)));await tester.pumpAndSettle();await tapButton(tester,calendarLabels['edit']!);
  final save=tester.widget<TextButton>(find.widgetWithText(TextButton,calendarLabels['save']!)).onPressed!;
  save();save();await tester.pump();expect(writes,1);
  expect(tester.widget<TextButton>(find.widgetWithText(TextButton,calendarLabels['save']!)).onPressed,isNull);
  expect(tester.widget<TextField>(find.byKey(descriptionKey)).enabled,isFalse);
  pending.complete(jsonResponse(ordinaryEvent()));await tester.pumpAndSettle();expect(writes,1);expect(find.byType(AlertDialog),findsNothing);
 });

 testWidgets('closing a failed edit blocks another mutation until an explicit calendar refresh',(tester)async{
  var writes=0,reads=0;
  final api=GenealogyApiService(client:MockClient((request)async{
   if(request.method=='PATCH'){writes++;return jsonResponse({},409);}reads++;return jsonResponse([ordinaryEvent()]);
  }))..setAuthToken('old');addTearDown(api.dispose);
  await tester.pumpWidget(MaterialApp(home:CalendarEventsScreen(apiService:api)));await tester.pumpAndSettle();await tapButton(tester,calendarLabels['edit']!);
  await tapButton(tester,calendarLabels['save']!);await tapButton(tester,calendarLabels['close']!);
  expect(tester.widget<TextButton>(find.widgetWithText(TextButton,calendarLabels['edit']!)).onPressed,isNull);
  expect(tester.widget<TextButton>(find.widgetWithText(TextButton,calendarLabels['cancel']!)).onPressed,isNull);expect(writes,1);expect(reads,1);
  await tester.tap(find.widgetWithIcon(IconButton,Icons.refresh));await tester.pumpAndSettle();expect(reads,2);
  expect(tester.widget<TextButton>(find.widgetWithText(TextButton,calendarLabels['edit']!)).onPressed,isNotNull);
 });


 testWidgets('ordinary create submits once for retained same-frame save callbacks',(tester)async{
  final pending=Completer<http.Response>();var writes=0;
  final api=GenealogyApiService(client:MockClient((request)async{
   if(request.method=='POST'){writes++;return pending.future;}return jsonResponse([]);
  }))..setAuthToken('old');addTearDown(api.dispose);
  await tester.pumpWidget(MaterialApp(home:CalendarEventsScreen(apiService:api)));await tester.pumpAndSettle();await createDialog(tester);
  await tester.enterText(find.byKey(titleKey),'Single create fixture');await chooseDate(tester);
  final save=tester.widget<TextButton>(find.widgetWithText(TextButton,calendarLabels['save']!)).onPressed!;
  save();save();await tester.pump();expect(writes,1);
  expect(tester.widget<TextField>(find.byKey(descriptionKey)).enabled,isFalse);
  pending.complete(jsonResponse({},201));await tester.pumpAndSettle();expect(writes,1);expect(find.byType(AlertDialog),findsNothing);
 });

 testWidgets('dismissed ordinary edit save callback cannot submit or pop another route',(tester)async{
  var writes=0;
  final api=GenealogyApiService(client:MockClient((request)async{if(request.method=='PATCH')writes++;return jsonResponse([ordinaryEvent()]);}))..setAuthToken('old');addTearDown(api.dispose);
  await tester.pumpWidget(MaterialApp(home:CalendarEventsScreen(apiService:api)));await tester.pumpAndSettle();await tapButton(tester,calendarLabels['edit']!);
  final oldSave=tester.widget<TextButton>(find.widgetWithText(TextButton,calendarLabels['save']!)).onPressed!;
  await tapButton(tester,calendarLabels['close']!);oldSave();await tester.pumpAndSettle();
  expect(writes,0);expect(find.byType(AlertDialog),findsNothing);expect(find.text('Fictional meeting'),findsOneWidget);expect(tester.takeException(),isNull);
 });

 testWidgets('late ordinary edit success cannot reload or restore data in replacement session',(tester)async{
  final pending=Completer<http.Response>();var reads=0,writes=0;
  final api=GenealogyApiService(client:MockClient((request)async{
   if(request.method=='PATCH'){writes++;return pending.future;}reads++;return jsonResponse([ordinaryEvent()]);
  }))..setAuthToken('old');addTearDown(api.dispose);
  await tester.pumpWidget(MaterialApp(home:CalendarEventsScreen(apiService:api)));await tester.pumpAndSettle();await tapButton(tester,calendarLabels['edit']!);
  await tester.enterText(find.byKey(descriptionKey),'Pending private draft');
  await tester.ensureVisible(find.widgetWithText(TextButton,calendarLabels['save']!));await tester.tap(find.widgetWithText(TextButton,calendarLabels['save']!));await tester.pump();
  api.setAuthToken('new');pending.complete(jsonResponse(ordinaryEvent()));await tester.pumpAndSettle();
  expect(writes,1);expect(reads,1);expect(find.byType(AlertDialog),findsNothing);expect(find.text('Approved private details'),findsNothing);expect(find.text(calendarSessionChanged),findsOneWidget);expect(tester.takeException(),isNull);
 });
}
