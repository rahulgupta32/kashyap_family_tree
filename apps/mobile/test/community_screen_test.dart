import 'dart:convert';
import 'package:flutter/material.dart';
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
}
