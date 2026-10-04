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
import 'chat_outbox_test.dart' show MemoryChatOutboxStore, conversation;

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
  ChatTestApi(this.connection,http.Client client):super(client:client,sessionStore:MemorySessionStore(),chatOutboxStore:MemoryChatOutboxStore());
  @override
  Future<ChatConnection> openChatConnection()async=>connection;
}
void main(){
 testWidgets('Mocked chat transport preserves retry identity and renders server receipts without spoofing sender',(tester)async{
  final token='header.${base64Url.encode(utf8.encode(jsonEncode({'sub':'viewer'})))}.signature';
  final connection=FakeChatConnection();final requests=<Map<String,dynamic>>[];
  final api=ChatTestApi(connection,MockClient((request)async{
   expect(request.headers['Authorization'],'Bearer $token');
   requests.add(jsonDecode(request.body) as Map<String,dynamic>);
   return requests.length==1?http.Response('{"message":"Temporary failure"}',503):http.Response('{"id":"m1"}',201);
  }));api.setAuthToken(token);addTearDown(api.dispose);
  await tester.pumpWidget(MaterialApp(home:ChatConversationScreen(api:api,conversation:const {'id':conversation,'title':'Fictional family','type':'DIRECT'},userId:'viewer')));
  await tester.pump();connection.events.add({'type':'authenticated'});await tester.pump();
  expect(connection.sent,contains(equals({'type':'subscribe','conversationId':conversation})));
  await tester.enterText(find.byType(TextField),'A fictional message');await tester.pump();await tester.tap(find.byTooltip('Send message'));await tester.pumpAndSettle();
  expect(find.textContaining('Queued for sending'),findsOneWidget);
  expect(tester.widget<TextField>(find.byType(TextField)).controller!.text,isEmpty);
  await tester.tap(find.byTooltip('पुनः प्रयास (Retry queued message)'));await tester.pumpAndSettle();
  expect(requests.length,2);expect(requests[0]['clientMessageId'],requests[1]['clientMessageId']);expect(requests[0].keys,unorderedEquals(['content','clientMessageId']));
  connection.events.add({'type':'snapshot','conversationId':conversation,'typingUserIds':[],'messages':[{'id':'m1','senderUserId':'viewer','sequence':1,'content':'A fictional message','isDeleted':false,'readByUserIds':['viewer'],'deliveredToUserIds':['other']}]});await tester.pumpAndSettle();
  expect(find.text('You · प्राप्त भयो (Delivered)'),findsOneWidget);
  expect(connection.sent,contains(equals({'type':'delivered','messageIds':['m1']})));
  connection.events.add({'type':'snapshot','conversationId':conversation,'typingUserIds':[],'messages':[{'id':'m1','senderUserId':'viewer','sequence':1,'content':'A fictional message','isDeleted':false,'readByUserIds':['viewer','other'],'deliveredToUserIds':['other']}]});await tester.pumpAndSettle();
  expect(find.text('A fictional message'),findsOneWidget);expect(find.text('You · पढियो (Read)'),findsOneWidget);expect(connection.sent,contains(equals({'type':'read','sequence':1})));
  await tester.pumpWidget(const SizedBox.shrink());await tester.pump();
 });
 testWidgets('Reporting shares only the selected message and entered reason',(tester)async{
  final connection=FakeChatConnection();final requests=<http.Request>[];
  final api=ChatTestApi(connection,MockClient((request)async{requests.add(request);return http.Response('{"alreadyReported":false}',201);}));
  api.setAuthToken('header.${base64Url.encode(utf8.encode(jsonEncode({'sub':'viewer'})))}.signature');addTearDown(api.dispose);
  await tester.pumpWidget(MaterialApp(home:ChatConversationScreen(api:api,conversation:const {'id':conversation,'title':'Fictional family','type':'DIRECT'},userId:'viewer')));await tester.pump();
  connection.events.add({'type':'snapshot','conversationId':conversation,'typingUserIds':[],'messages':[{'id':'reported','senderUserId':'other','sequence':1,'content':'Selected message','isDeleted':false,'readByUserIds':[],'deliveredToUserIds':[]}]});await tester.pumpAndSettle();
  await tester.tap(find.byTooltip('उजुरी (Report message)'));await tester.pumpAndSettle();
  await tester.enterText(find.widgetWithText(TextField,'उजुरीको कारण (Report reason)'),'Fictional spam');await tester.pump();
  await tester.tap(find.text('पठाउनुहोस् (Submit report)'));await tester.pumpAndSettle();
  expect(requests.single.url.path,'/chat/conversations/$conversation/messages/reported/report');
  expect(jsonDecode(requests.single.body),{'reason':'Fictional spam'});
  expect(find.text('उजुरी पठाइयो (Report submitted)'),findsOneWidget);
  await tester.pumpWidget(const SizedBox.shrink());await tester.pump();
 });

}
