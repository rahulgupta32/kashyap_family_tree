import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kashyap_mobile/screens/chat_screen.dart';
import 'package:kashyap_mobile/services/chat_connection.dart';
import 'package:kashyap_mobile/services/genealogy_api_service.dart';
import 'native_session_test.dart' show MemorySessionStore;

class FakeChatConnection implements ChatConnection {
  final events=StreamController<Map<String,dynamic>>();
  final sent=<Map<String,dynamic>>[];
  @override
  Stream<Map<String,dynamic>> get frames=>events.stream;
  @override
  int? get closeCode=>null;
  @override
  void send(Map<String,dynamic> frame){sent.add(frame);}
  @override
  Future<void> close()async{await events.close();}
}
class ChatTestApi extends GenealogyApiService {
  final FakeChatConnection connection;
  ChatTestApi(this.connection,http.Client client):super(client:client,sessionStore:MemorySessionStore());
  @override
  Future<ChatConnection> openChatConnection()async=>connection;
}
void main(){
 testWidgets('Mocked chat transport preserves retry identity and renders server receipts without spoofing sender',(tester)async{
  final connection=FakeChatConnection();final requests=<Map<String,dynamic>>[];
  final api=ChatTestApi(connection,MockClient((request)async{
   expect(request.headers['Authorization'],'Bearer fictional-session');
   requests.add(jsonDecode(request.body) as Map<String,dynamic>);
   return requests.length==1?http.Response('{"message":"Temporary failure"}',503):http.Response('{"id":"m1"}',201);
  }));api.setAuthToken('fictional-session');addTearDown(api.dispose);
  await tester.pumpWidget(MaterialApp(home:ChatConversationScreen(api:api,conversation:const {'id':'conv','title':'Fictional family','type':'DIRECT'},userId:'viewer')));
  await tester.pump();connection.events.add({'type':'authenticated'});await tester.pump();
  expect(connection.sent,contains(equals({'type':'subscribe','conversationId':'conv'})));
  await tester.enterText(find.byType(TextField),'A fictional message');await tester.tap(find.byTooltip('Send message'));await tester.pumpAndSettle();
  expect(find.textContaining('Temporary failure'),findsOneWidget);
  await tester.tap(find.byTooltip('Send message'));await tester.pumpAndSettle();
  expect(requests.length,2);expect(requests[0]['clientMessageId'],requests[1]['clientMessageId']);expect(requests[0].keys,unorderedEquals(['content','clientMessageId']));
  connection.events.add({'type':'snapshot','conversationId':'conv','typingUserIds':[],'messages':[{'id':'m1','senderUserId':'viewer','sequence':1,'content':'A fictional message','isDeleted':false,'readByUserIds':['viewer','other']}]});await tester.pumpAndSettle();
  expect(find.text('A fictional message'),findsOneWidget);expect(find.text('You · Read'),findsOneWidget);expect(connection.sent,contains(equals({'type':'read','sequence':1})));
  await tester.pumpWidget(const SizedBox.shrink());await tester.pump();
 });
}
