import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kashyap_mobile/screens/device_sessions_screen.dart';
import 'package:kashyap_mobile/services/genealogy_api_service.dart';

class DevicesApi extends GenealogyApiService {
  String owner='owner-a';
  bool fail=false;
  Completer<dynamic>? delayed;
  final operations=<String>[];
  @override
  String? get chatAccountId=>owner;
  @override
  Future<dynamic> requestJson(String path,{String method='GET',Map<String,dynamic>? data,String? boundAccountId}) async {
    expect(boundAccountId,owner);operations.add('$method $path');
    if(fail){throw Exception('PRIVATE_PROVIDER_DETAIL');}
    if(delayed!=null){return delayed!.future;}
    if(method=='POST'){return {'success':true};}
    return {'items':[{'id':'current','platform':'android','label':'Current fictional','isCurrent':true,'createdAt':'2026-10-10','expiresAt':'2026-10-11'},
      {'id':'other','platform':'ios','label':'Other fictional','isCurrent':false,'createdAt':'2026-10-10','expiresAt':'2026-10-11'}],'nextCursor':null};
  }
}
void main(){
  Future<void> open(WidgetTester tester,DevicesApi api) async {await tester.pumpWidget(MaterialApp(home:DeviceSessionsScreen(apiService:api)));await tester.pumpAndSettle();}
  testWidgets('current device has no revoke control and other device requires confirmation',(tester) async {
    final api=DevicesApi();await open(tester,api);expect(find.text('यो उपकरण (This device)'),findsOneWidget);expect(find.text('साइन आउट गर्नुहोस् (Sign out device)'),findsOneWidget);
    await tester.tap(find.text('साइन आउट गर्नुहोस् (Sign out device)'));await tester.pumpAndSettle();await tester.tap(find.text('रद्द (Cancel)'));await tester.pumpAndSettle();expect(api.operations.where((s)=>s.startsWith('POST')),isEmpty);
    await tester.tap(find.text('साइन आउट गर्नुहोस् (Sign out device)'));await tester.pumpAndSettle();await tester.tap(find.text('पुष्टि (Confirm sign out)'));await tester.pumpAndSettle();expect(api.operations,contains('POST /auth/sessions/other/revoke'));
  });
  testWidgets('unconfirmed revocation clears private rows and redacts exception detail',(tester) async {
    final api=DevicesApi();await open(tester,api);api.fail=true;await tester.tap(find.text('साइन आउट गर्नुहोस् (Sign out device)'));await tester.pumpAndSettle();await tester.tap(find.text('पुष्टि (Confirm sign out)'));await tester.pumpAndSettle();expect(find.textContaining('Action unconfirmed'),findsOneWidget);expect(find.textContaining('Other fictional'),findsNothing);expect(find.textContaining('PRIVATE_PROVIDER_DETAIL'),findsNothing);
  });
  testWidgets('late account response cannot restore a preceding account device list',(tester) async {
    final api=DevicesApi();await open(tester,api);api.delayed=Completer<dynamic>();await tester.tap(find.text('सूची ताजा गर्नुहोस् (Refresh devices)'));await tester.pump();api.owner='owner-b';api.delayed!.complete({'items':[{'id':'private','platform':'ios','label':'PREVIOUS_ACCOUNT_PRIVATE','isCurrent':false}],'nextCursor':null});await tester.pumpAndSettle();expect(find.textContaining('PREVIOUS_ACCOUNT_PRIVATE'),findsNothing);expect(find.textContaining('Other fictional'),findsNothing);
  });
}
