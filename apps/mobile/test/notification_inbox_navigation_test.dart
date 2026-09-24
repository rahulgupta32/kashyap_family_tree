import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';
import 'package:kashyap_mobile/screens/follow_manager_screen.dart';
import 'package:kashyap_mobile/screens/notification_inbox_screen.dart';
import 'package:kashyap_mobile/screens/person_search_screen.dart';
import 'package:kashyap_mobile/services/genealogy_api_service.dart';
import 'native_session_test.dart' show jsonResponse;

void main() {
  testWidgets('Mocked inbox workflow opens a person picker after marking the notice read', (tester) async {
    var readRequests = 0;
    final service = GenealogyApiService(client: MockClient((request) async {
      expect(request.headers['Authorization'], 'Bearer inbox-session');
      if (request.url.path == '/notifications/preferences') {
        return jsonResponse({'inAppEnabled':true,'workflowEnabled':true,'chatEnabled':true,'familyEventsEnabled':true});
      }
      if (request.url.path == '/notifications') {
        return jsonResponse({'items':[{'id':'notice-1','category':'WORKFLOW','action':'CHANGE_REQUEST_APPROVED_AND_MERGED',
          'message':'A change request has an update','destination':'/change-requests','createdAt':'2026-09-24T00:00:00Z','readAt':null}],
          'nextCursor':null,'unreadCount':1});
      }
      if (request.url.path == '/notifications/notice-1/read') {
        readRequests++;
        return jsonResponse({'id':'notice-1','readAt':'2026-09-24T00:01:00Z'});
      }
      if (request.url.path == '/genealogy/search') return jsonResponse({'items':[], 'total':0,'page':1,'limit':20});
      return jsonResponse({'message':'Unexpected request'},404);
    }))..setAuthToken('inbox-session');
    addTearDown(service.dispose);
    await tester.pumpWidget(MaterialApp(home: NotificationInboxScreen(apiService:service)));
    await tester.pumpAndSettle();
    await tester.tap(find.text('A change request has an update'));
    await tester.pumpAndSettle();
    expect(readRequests,1);
    expect(find.byType(PersonSearchScreen),findsOneWidget);
    expect(find.text('कश्यप अधिकारी वंशावली'),findsOneWidget);
  });

  testWidgets('Mocked follow manager saves an authorized branch choice and removes it', (tester) async {
    const branchId='ba7349c0-9394-4c41-983d-e03bdbf809a1';
    Map<String,dynamic>? saved;
    final service=GenealogyApiService(client:MockClient((request) async {
      expect(request.headers['Authorization'],'Bearer follows-session');
      if(request.url.path=='/genealogy/branches')return jsonResponse([{'id':branchId,'nameNepali':'काल्पनिक शाखा','code':'TEST'}]);
      if(request.url.path=='/notifications/follows'){
        if(request.method=='POST'){
          saved={'id':'follow-1','targetType':'BRANCH','branchId':branchId,'generation':null,
            'relationshipGroup':null,'personId':null};
          return jsonResponse(saved!);
        }
        return jsonResponse(saved==null?[]:[saved]);
      }
      if(request.method=='DELETE'&&request.url.path=='/notifications/follows/follow-1'){
        saved=null;return jsonResponse({'removed':true});
      }
      return jsonResponse({'message':'Unexpected request'},404);
    }))..setAuthToken('follows-session');
    addTearDown(service.dispose);
    await tester.pumpWidget(MaterialApp(home:FollowManagerScreen(apiService:service)));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('शाखा (Branch)'),250,
      scrollable:find.byType(Scrollable).first);
    final branchField=find.ancestor(of:find.text('शाखा (Branch)'),
      matching:find.byType(DropdownButtonFormField<String>));
    await tester.tap(branchField);
    await tester.pumpAndSettle();
    await tester.tap(find.text('काल्पनिक शाखा').last);
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('शाखा अनुसरण (Follow branch)'),200,
      scrollable:find.byType(Scrollable).first);
    await tester.tap(find.text('शाखा अनुसरण (Follow branch)'));
    await tester.pumpAndSettle();
    expect(saved?['branchId'],branchId);
    await tester.scrollUntilVisible(find.textContaining('BRANCH ·'),300,scrollable:find.byType(Scrollable).first);
    expect(find.textContaining('BRANCH ·'),findsOneWidget);
    await tester.tap(find.byTooltip('Unfollow'));
    await tester.pumpAndSettle();
    expect(saved,isNull);
  });
}
