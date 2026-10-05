import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kashyap_mobile/screens/community_screen.dart';
import 'package:kashyap_mobile/services/genealogy_api_service.dart';
import 'native_session_test.dart' show MemorySessionStore;

void main() {
  testWidgets('Mocked community HTTP flow submits session-bound content and reloads reaction state', (tester) async {
    var liked = false;
    Map<String, dynamic>? submitted;
    final service = GenealogyApiService(sessionStore: MemorySessionStore(), client: MockClient((request) async {
      expect(request.headers['Authorization'], 'Bearer community-session');
      if (request.method == 'POST') {
        submitted = jsonDecode(request.body) as Map<String, dynamic>;
        return http.Response('{"id":"new-post"}', 201);
      }
      if (request.method == 'PUT') { liked = (jsonDecode(request.body) as Map)['liked'] as bool; return http.Response('{}', 200); }
      return http.Response(jsonEncode([{'id':'post-id','title':'Fictional discussion','content':'A fictional message',
        'moderationStatus':'PUBLISHED','isLiked':liked,'likesCount':liked ? 1 : 0,'commentsCount':0,'canModerate':false,'canDelete':false}]), 200);
    }));
    service.setAuthToken('community-session');
    addTearDown(service.dispose);
    await tester.pumpWidget(MaterialApp(home: CommunityScreen(apiService: service)));
    await tester.pumpAndSettle();
    await tester.tap(find.text('♡ 0 · Like'));await tester.pumpAndSettle();
    expect(find.text('♥ 1 · Like'), findsOneWidget);
    await tester.tap(find.byTooltip('Create post'));await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextFormField).at(0), 'Fictional title');
    await tester.enterText(find.byType(TextFormField).at(1), 'Fictional body');
    await tester.ensureVisible(find.text('समीक्षामा पठाउनुहोस् (Submit for review)'));
    await tester.tap(find.text('समीक्षामा पठाउनुहोस् (Submit for review)'));await tester.pumpAndSettle();
    expect(submitted, {'title':'Fictional title','content':'Fictional body','category':'DISCUSSION'});
    expect(submitted!.containsKey('authorUserId'), isFalse);
    expect(find.textContaining('Submitted for independent moderation'), findsOneWidget);
  });
  testWidgets('Author edits carry the viewed version and reason; history retains both snapshots', (tester) async {
    Map<String,dynamic>? edited;
    var content = 'Original fictional message';
    var status = 'PUBLISHED';
    final service = GenealogyApiService(sessionStore: MemorySessionStore(), client: MockClient((request) async {
      expect(request.headers['Authorization'], 'Bearer revision-session');
      if (request.method == 'PUT') {
        edited = jsonDecode(request.body) as Map<String,dynamic>;
        content = edited!['content'] as String; status = 'PENDING';
        return http.Response('{}',200);
      }
      if (request.url.path.endsWith('/revisions')) {
        return http.Response(jsonEncode([
          {'version':3,'title':'Fictional discussion','content':content,'category':'DISCUSSION','reason':'Correct gathering details','createdAt':'2026-10-04T00:00:00Z'},
          {'version':1,'title':'Fictional discussion','content':'Original fictional message','category':'DISCUSSION','reason':'Initial submission','createdAt':'2026-10-03T00:00:00Z'},
        ]),200);
      }
      return http.Response(jsonEncode([{'id':'post-id','title':'Fictional discussion','content':content,'category':'DISCUSSION','version':2,
        'moderationStatus':status,'isLiked':false,'likesCount':0,'commentsCount':0,'canModerate':false,'canDelete':false,'canEdit':true,'canViewRevisions':true}]),200);
    }));
    service.setAuthToken('revision-session');addTearDown(service.dispose);
    await tester.pumpWidget(MaterialApp(home:CommunityScreen(apiService:service)));await tester.pumpAndSettle();
    await tester.tap(find.text('सम्पादन (Edit)'));await tester.pumpAndSettle();
    expect(find.text('Original fictional message'),findsOneWidget);
    await tester.enterText(find.byType(TextFormField).at(1),'Updated fictional message');
    await tester.enterText(find.byType(TextFormField).at(2),'Correct gathering details');
    await tester.ensureVisible(find.text('समीक्षामा पठाउनुहोस् (Submit for review)'));
    await tester.tap(find.text('समीक्षामा पठाउनुहोस् (Submit for review)'));await tester.pumpAndSettle();
    expect(edited,{'title':'Fictional discussion','content':'Updated fictional message','category':'DISCUSSION','version':2,'reason':'Correct gathering details'});
    expect(find.text('PENDING'),findsOneWidget);expect(find.text('♡ 0 · Like'),findsNothing);
    await tester.tap(find.text('Revision history'));await tester.pumpAndSettle();
    expect(find.text('Original fictional message'),findsOneWidget);expect(find.text('Updated fictional message'),findsOneWidget);
    expect(find.text('Reason: Correct gathering details'),findsOneWidget);
  });

  testWidgets('Private moderation history renders resolved appeal outcomes', (tester) async {
    final service = GenealogyApiService(sessionStore: MemorySessionStore(), client: MockClient((request) async {
      expect(request.headers['Authorization'], 'Bearer history-session');
      if (request.url.path.endsWith('/moderation-history')) {
        return http.Response(jsonEncode({'items':[{'version':2,'decision':'REJECTED','notes':'Fictional review reason','createdAt':'2026-10-05T00:00:00Z','appeal':{'status':'RESOLVED','reason':'Fictional appeal explanation','createdAt':'2026-10-05T01:00:00Z','resolvedAt':'2026-10-05T02:00:00Z'}}],'nextBeforeVersion':null}),200);
      }
      return http.Response(jsonEncode([{'id':'post-id','title':'Fictional history','content':'Fictional content','moderationStatus':'PENDING','canViewRevisions':true}]),200);
    }));
    service.setAuthToken('history-session');addTearDown(service.dispose);
    await tester.pumpWidget(MaterialApp(home:CommunityScreen(apiService:service)));await tester.pumpAndSettle();
    await tester.tap(find.text('समीक्षा इतिहास (Moderation history)'));await tester.pumpAndSettle();
    expect(find.text('Fictional review reason'),findsOneWidget);
    expect(find.text('Appeal: RESOLVED'),findsOneWidget);
    expect(find.text('Fictional appeal explanation'),findsOneWidget);
    expect(tester.widget<TextButton>(find.widgetWithText(TextButton,'Older decisions')).onPressed,isNull);
  });

  testWidgets('Image upload retry preserves its file, request ID and viewed version', (tester) async {
    const channel=MethodChannel('kashyap/chat_attachments');
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(channel,(call) async => {'mimeType':'image/png','dataBase64':'aW1hZ2U='});
    addTearDown(()=>TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(channel,null));
    final bodies=<Map>[];
    final service=GenealogyApiService(sessionStore:MemorySessionStore(),client:MockClient((request) async {
      if(request.method=='POST'){
        bodies.add(jsonDecode(request.body) as Map);return http.Response(bodies.length==1?'{}':'{"assetId":"fictional"}',bodies.length==1?500:201);
      }
      return http.Response(jsonEncode([{'id':'post-id','title':'Fictional image','content':'Fictional content','moderationStatus':'PENDING','version':4,'canEdit':true}]),200);
    }));
    service.setAuthToken('header.${base64Url.encode(utf8.encode('{"sub":"image-owner"}'))}.signature');addTearDown(service.dispose);
    await tester.pumpWidget(MaterialApp(home:CommunityScreen(apiService:service)));await tester.pumpAndSettle();
    await tester.tap(find.text('तस्बिर थप्नुहोस् (Add image)'));await tester.pumpAndSettle();
    await tester.tap(find.text('Choose image'));await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField),'Fictional image reason');
    await tester.tap(find.text('Submit image for review'));await tester.pumpAndSettle();
    expect(find.textContaining('500'),findsOneWidget);
    await tester.tap(find.text('Retry image upload'));await tester.pumpAndSettle();
    expect(bodies.length,2);expect(bodies[1],bodies[0]);expect(bodies[0]['version'],4);expect(bodies[0]['dataBase64'],'aW1hZ2U=');
  });

}
