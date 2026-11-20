import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kashyap_mobile/screens/calendar_audience_picker.dart';
import 'package:kashyap_mobile/services/genealogy_api_service.dart';
import 'native_session_test.dart' show jsonResponse;

void main(){
 testWidgets('generation criteria invalidate the old roster and return the exact confirmed preview to the event form',(tester)async{
  final sent=<Map<String,dynamic>>[];Map<String,dynamic>? selected;
  final api=GenealogyApiService(client:MockClient((request)async{
   if(request.method=='GET')return jsonResponse([{'id':'branch-1','nameNepali':'शाखा','nameEnglish':'Fictional branch'}]);
   final body=jsonDecode(request.body) as Map<String,dynamic>;sent.add(body);
   return jsonResponse({'previewId':'preview-${sent.length}','expiresAt':DateTime.now().add(const Duration(minutes:10)).toIso8601String(),
    'selection':body['audienceSelection'],'recipientCount':1,'recipients':[{'userId':'u1','personId':'p1','name':'Fictional recipient'}]},201);
  }))..setAuthToken('mock-access');addTearDown(api.dispose);
  await tester.pumpWidget(MaterialApp(home:Builder(builder:(context)=>TextButton(onPressed:()async{
   selected=await Navigator.push<Map<String,dynamic>>(context,MaterialPageRoute(builder:(_)=>CalendarAudiencePicker(api:api)));
  },child:const Text('Open audience')))));await tester.tap(find.text('Open audience'));await tester.pumpAndSettle();
  await tester.tap(find.byType(DropdownButtonFormField<String>).first);await tester.pumpAndSettle();await tester.tap(find.text('पुस्ता (Generation)').last);await tester.pumpAndSettle();
  await tester.tap(find.byType(DropdownButtonFormField<String>).at(1));await tester.pumpAndSettle();await tester.tap(find.text('शाखा / Fictional branch').last);await tester.pumpAndSettle();
  await tester.enterText(find.byType(TextField),'2');await tester.ensureVisible(find.text('समूह पूर्वावलोकन (Preview audience)'));await tester.tap(find.text('समूह पूर्वावलोकन (Preview audience)'));await tester.pumpAndSettle();
  expect(find.text('Fictional recipient'),findsOneWidget);expect(sent.last,{'audienceScope':'INVITED_ONLY','audienceSelection':{'type':'GENERATION','branchId':'branch-1','generation':2}});
  await tester.enterText(find.byType(TextField),'3');await tester.pump();expect(find.text('Fictional recipient'),findsNothing);expect(find.text('यो समूह प्रयोग गर्नुहोस् (Use audience)'),findsNothing);
  await tester.ensureVisible(find.text('समूह पूर्वावलोकन (Preview audience)'));await tester.tap(find.text('समूह पूर्वावलोकन (Preview audience)'));await tester.pumpAndSettle();
  await tester.ensureVisible(find.text('यो समूह प्रयोग गर्नुहोस् (Use audience)'));await tester.tap(find.text('यो समूह प्रयोग गर्नुहोस् (Use audience)'));await tester.pumpAndSettle();
  expect(selected!['audiencePreviewId'],'preview-2');expect(selected!['audienceSelection'],{'type':'GENERATION','branchId':'branch-1','generation':3});
 });
 testWidgets('a response from an earlier login cannot populate a recipient preview',(tester)async{
  final pending=Completer<http.Response>();
  final api=GenealogyApiService(client:MockClient((request)async{
   if(request.method=='GET')return jsonResponse([{'id':'branch-1','nameNepali':'शाखा','nameEnglish':'Fictional branch'}]);return pending.future;
  }))..setAuthToken('mock-access');addTearDown(api.dispose);
  await tester.pumpWidget(MaterialApp(home:CalendarAudiencePicker(api:api)));await tester.pumpAndSettle();
  await tester.tap(find.byType(DropdownButtonFormField<String>).at(1));await tester.pumpAndSettle();await tester.tap(find.text('शाखा / Fictional branch').last);await tester.pumpAndSettle();
  await tester.ensureVisible(find.text('समूह पूर्वावलोकन (Preview audience)'));await tester.tap(find.text('समूह पूर्वावलोकन (Preview audience)'));await tester.pump();api.setAuthToken('new-login');
  pending.complete(jsonResponse({'previewId':'old-preview','selection':{'type':'BRANCH','branchId':'branch-1'},'expiresAt':DateTime.now().add(const Duration(minutes:10)).toIso8601String(),
   'recipientCount':1,'recipients':[{'name':'Old account recipient'}]},201));await tester.pumpAndSettle();
  expect(find.text('Old account recipient'),findsNothing);expect(find.text('यो समूह प्रयोग गर्नुहोस् (Use audience)'),findsNothing);expect(find.textContaining('Session changed'),findsOneWidget);
 });
}
