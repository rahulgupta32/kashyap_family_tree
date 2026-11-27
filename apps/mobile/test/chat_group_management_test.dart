import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';
import 'package:kashyap_mobile/screens/chat_group_management_screen.dart';
import 'package:kashyap_mobile/localization/chat_group_labels.dart';
import 'package:kashyap_mobile/services/genealogy_api_service.dart';
import 'native_session_test.dart' show jsonResponse;

void main(){
  testWidgets('owner promotes a member with the displayed version and reloads server roles',(tester)async{
    var promoted=false;
    final api=GenealogyApiService(client:MockClient((request)async{
      expect(request.headers['Authorization'],'Bearer mock-access');
      if(request.method=='PATCH'){
        expect(request.url.path,'/chat/conversations/group-1/members/member-1');
        expect(jsonDecode(request.body),{'role':'ADMIN','version':7});promoted=true;
        return jsonResponse({'success':true,'version':8});
      }
      return jsonResponse({'id':'group-1','title':'Fictional group','description':'Fictional purpose','version':promoted?8:7,
        'myRole':'OWNER','canManage':true,'isOwner':true,'memberCount':2,'members':[
          {'userId':'owner-1','name':'Fictional owner','role':'OWNER'},
          {'userId':'member-1','name':'Fictional member','role':promoted?'ADMIN':'MEMBER'},
        ]});
    }))..setAuthToken('mock-access');addTearDown(api.dispose);
    await tester.pumpWidget(MaterialApp(home:ChatGroupManagementScreen(api:api,conversationId:'group-1')));
    await tester.pumpAndSettle();
    final promote=find.text(chatGroupLabels['promote']!);await tester.ensureVisible(promote);await tester.tap(promote);await tester.pumpAndSettle();
    expect(promoted,isTrue);expect(find.text('Fictional member · ADMIN'),findsOneWidget);expect(find.text(chatGroupLabels['demote']!),findsOneWidget);
  });
  testWidgets('ordinary member can inspect group information without management controls',(tester)async{
    final api=GenealogyApiService(client:MockClient((_)async=>jsonResponse({'id':'group-2','title':'Fictional group',
      'description':'','version':1,'myRole':'MEMBER','canManage':false,'isOwner':false,'memberCount':2,'members':[
        {'userId':'owner','name':'Fictional owner','role':'OWNER'},{'userId':'member','name':'Fictional member','role':'MEMBER'}
      ]})))..setAuthToken('mock-access');addTearDown(api.dispose);
    await tester.pumpWidget(MaterialApp(home:ChatGroupManagementScreen(api:api,conversationId:'group-2')));await tester.pumpAndSettle();
    expect(find.text('Fictional owner · OWNER'),findsOneWidget);expect(find.byType(TextField),findsNothing);
    expect(find.text(chatGroupLabels['promote']!),findsNothing);expect(find.text(chatGroupLabels['remove']!),findsNothing);expect(find.text(chatGroupLabels['transfer']!),findsNothing);
  });
}
