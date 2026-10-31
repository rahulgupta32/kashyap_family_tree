import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kashyap_mobile/screens/community_screen.dart';
import 'package:kashyap_mobile/screens/comment_cases_screen.dart';
import 'package:kashyap_mobile/services/genealogy_api_service.dart';
import 'native_session_test.dart' show MemorySessionStore;

void main() {
  testWidgets('Replies carry the selected parent and cancellation restores a top-level comment', (tester) async {
    tester.view.physicalSize = const Size(1200,1800); tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize); addTearDown(tester.view.resetDevicePixelRatio);
    Map<String,dynamic>? submitted;
    final rows = <Map<String,dynamic>>[{'id':'parent-id','content':'Fictional parent'}];
    final service = GenealogyApiService(sessionStore: MemorySessionStore(), client: MockClient((request) async {
      if (request.url.path.endsWith('/comments/browse')) {
        return http.Response(jsonEncode({'items':rows.map((c)=>{...c,if(c['parentCommentId']!=null)'parentContent':'Fictional parent'}).toList(),'nextBefore':null}),200);
      }
      if (request.url.path.endsWith('/comments')) {
        if (request.method == 'POST') {
          submitted = jsonDecode(request.body) as Map<String,dynamic>;
          rows.add({'id':'reply-id',...submitted!});
          return http.Response('{}',201);
        }
        return http.Response(jsonEncode(rows),200);
      }
      return http.Response(jsonEncode([{'id':'post-id','title':'Fictional discussion','content':'Fictional body',
        'moderationStatus':'PUBLISHED','isLiked':false,'likesCount':0,'commentsCount':1,'canModerate':false,'canDelete':false}]),200);
    }));
    service.setAuthToken('reply-session'); addTearDown(service.dispose);
    await tester.pumpWidget(MaterialApp(home: CommunityScreen(apiService:service)));
    await tester.pumpAndSettle();
    await tester.tap(find.text('टिप्पणी (1)')); await tester.pumpAndSettle();
    await tester.tap(find.text('जवाफ (Reply)')); await tester.pumpAndSettle();
    expect(find.text('Replying to: Fictional parent'),findsOneWidget);
    await tester.enterText(find.byType(TextField),'Fictional child'); await tester.pump();
    await tester.tap(find.text('पठाउनुहोस् (Send comment)')); await tester.pumpAndSettle();
    expect(submitted,{'content':'Fictional child','parentCommentId':'parent-id'});
    expect(find.text('Reply to: Fictional parent'),findsOneWidget);
    await tester.tap(find.text('जवाफ (Reply)').first); await tester.pumpAndSettle();
    await tester.tap(find.text('Cancel reply')); await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField),'Top-level comment'); await tester.pump();
    await tester.tap(find.text('पठाउनुहोस् (Send comment)')); await tester.pumpAndSettle();
    expect(submitted,{'content':'Top-level comment'});
  });
  testWidgets('Comment pages append older records and reset to latest with parent context', (tester) async {
    tester.view.physicalSize = const Size(1200,1800); tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize); addTearDown(tester.view.resetDevicePixelRatio);
    final requests = <String>[];
    final service = GenealogyApiService(sessionStore:MemorySessionStore(),client:MockClient((request) async {
      if(request.url.path.endsWith('/comments/browse')) {
        requests.add(request.url.query);
        final older=request.url.queryParameters['before']=='cursor-id';
        return http.Response(jsonEncode({'items':older?[{'id':'old-id','content':'Older parent'}]:[{'id':'new-id','content':'New reply','parentCommentId':'old-id','parentContent':'Older parent'}],'nextBefore':older?null:'cursor-id'}),200);
      }
      return http.Response(jsonEncode([{'id':'post-id','title':'Page fixture','content':'Fictional body','moderationStatus':'PUBLISHED','isLiked':false,'likesCount':0,'commentsCount':2,'canModerate':false,'canDelete':false}]),200);
    }));
    service.setAuthToken('page-session'); addTearDown(service.dispose);
    await tester.pumpWidget(MaterialApp(home:CommunityScreen(apiService:service))); await tester.pumpAndSettle();
    await tester.tap(find.text('टिप्पणी (2)')); await tester.pumpAndSettle();
    expect(find.text('Reply to: Older parent'),findsOneWidget);
    await tester.tap(find.text('Older comments')); await tester.pumpAndSettle();
    expect(requests.last,'before=cursor-id'); expect(find.text('Older parent'),findsOneWidget);
    expect(tester.widget<TextButton>(find.widgetWithText(TextButton,'Older comments')).onPressed,isNull);
    await tester.tap(find.text('Latest comments')); await tester.pumpAndSettle();
    expect(requests.last,''); expect(find.text('Older parent'),findsNothing);
  });
  testWidgets('Comment removal requires a reason and reloads retained child with unavailable parent', (tester) async {
    tester.view.physicalSize = const Size(1200,1800); tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize); addTearDown(tester.view.resetDevicePixelRatio);
    var removed=false; Map<String,dynamic>? submitted;
    final service=GenealogyApiService(sessionStore:MemorySessionStore(),client:MockClient((request) async {
      if(request.method=='DELETE') {expect(request.url.path.endsWith('/comments/parent-id'),isTrue); submitted=jsonDecode(request.body) as Map<String,dynamic>;removed=true;return http.Response('{}',200);}
      if(request.url.path.endsWith('/comments/browse')) { return http.Response(jsonEncode({'items':[
        if(!removed){'id':'parent-id','content':'Fictional removal parent','canRemove':true},
        {'id':'child-id','content':'Fictional child remains','parentCommentId':'parent-id','parentContent':removed?null:'Fictional removal parent','canRemove':false},
      ],'nextBefore':null}),200); }
      return http.Response(jsonEncode([{'id':'post-id','title':'Removal fixture','content':'Fictional body','moderationStatus':'PUBLISHED','isLiked':false,'likesCount':0,'commentsCount':removed?1:2,'canModerate':false,'canDelete':false}]),200);
    }));
    service.setAuthToken('removal-session');addTearDown(service.dispose);
    await tester.pumpWidget(MaterialApp(home:CommunityScreen(apiService:service)));await tester.pumpAndSettle();
    await tester.tap(find.text('टिप्पणी (2)'));await tester.pumpAndSettle();
    expect(find.byTooltip('Remove comment'),findsOneWidget);
    await tester.tap(find.byTooltip('Remove comment'));await tester.pumpAndSettle();
    expect(tester.widget<FilledButton>(find.widgetWithText(FilledButton,'Confirm comment removal')).onPressed,isNull);
    await tester.enterText(find.byType(TextField),'Remove incorrect fictional comment');await tester.pump();
    await tester.tap(find.text('Confirm comment removal'));await tester.pumpAndSettle();
    expect(submitted,{'reason':'Remove incorrect fictional comment'});
    expect(find.text('Fictional removal parent'),findsNothing);expect(find.text('Fictional child remains'),findsOneWidget);
    expect(find.text('Reply to: Parent comment unavailable'),findsOneWidget);
  });
  testWidgets('Independent comment case review carries exact sequence and required notes', (tester) async {
    tester.view.physicalSize=const Size(1200,1800);tester.view.devicePixelRatio=1;
    addTearDown(tester.view.resetPhysicalSize);addTearDown(tester.view.resetDevicePixelRatio);
    Map<String,dynamic>? submitted;var status='OPEN';
    final service=GenealogyApiService(sessionStore:MemorySessionStore(),client:MockClient((request) async {
      if(request.method=='POST'){
        expect(request.url.path.endsWith('/9007199254740993/review'),isTrue);submitted=jsonDecode(request.body) as Map<String,dynamic>;status='KEPT';return http.Response('{}',201);
      }
      return http.Response(jsonEncode({'items':[{'sequence':'9007199254740993','commentId':'comment-id','content':'Fictional reported comment','category':'OTHER','reason':'Fictional report reason','status':status,'removed':false,'reviewNotes':status=='KEPT'?'Independent review notes':null}],'nextBefore':null}),200);
    }));
    service.setAuthToken('case-session');addTearDown(service.dispose);
    await tester.pumpWidget(MaterialApp(home:CommentCasesScreen(api:service,postId:'post-id')));await tester.pumpAndSettle();
    await tester.tap(find.text('Keep comment'));await tester.pumpAndSettle();
    expect(tester.widget<FilledButton>(find.widgetWithText(FilledButton,'Submit review')).onPressed,isNull);
    await tester.enterText(find.byType(TextField),'Independent review notes');await tester.pump();
    await tester.tap(find.text('Submit review'));await tester.pumpAndSettle();
    expect(submitted,{'decision':'KEEP','notes':'Independent review notes'});expect(find.text('KEPT · Independent review notes'),findsOneWidget);
  });
  testWidgets('Restoration submits the viewed comment version and required reason', (tester) async {
    tester.view.physicalSize=const Size(1200,1800);tester.view.devicePixelRatio=1;
    addTearDown(tester.view.resetPhysicalSize);addTearDown(tester.view.resetDevicePixelRatio);
    var restored=false;Map<String,dynamic>? submitted;
    final service=GenealogyApiService(sessionStore:MemorySessionStore(),client:MockClient((request) async {
      if(request.method=='POST'){
        expect(request.url.path.endsWith('/comments/comment-id/restore'),isTrue);submitted=jsonDecode(request.body) as Map<String,dynamic>;restored=true;return http.Response('{}',201);
      }
      return http.Response(jsonEncode({'items':[{'sequence':'9007199254740993','commentId':'comment-id','content':'Fictional retained comment','category':'OTHER','reason':'Historical concern','status':'REMOVED','removed':!restored,'canRestore':!restored,'moderationVersion':restored?3:2,'removalKind':restored?null:'CASE'}],'nextBefore':null}),200);
    }));
    service.setAuthToken('restore-session');addTearDown(service.dispose);
    await tester.pumpWidget(MaterialApp(home:CommentCasesScreen(api:service,postId:'post-id')));await tester.pumpAndSettle();
    await tester.tap(find.text('Restore comment'));await tester.pumpAndSettle();
    expect(tester.widget<FilledButton>(find.widgetWithText(FilledButton,'Confirm restoration')).onPressed,isNull);
    await tester.enterText(find.byType(TextField),'Correct removal after independent review');await tester.pump();
    await tester.tap(find.text('Confirm restoration'));await tester.pumpAndSettle();
    expect(submitted,{'version':2,'reason':'Correct removal after independent review'});
    expect(find.widgetWithText(TextButton,'Restore comment'),findsNothing);expect(find.text('Fictional retained comment'),findsOneWidget);
  });
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
    await tester.enterText(find.byType(TextField),'Fictional image reason');await tester.pump();
    await tester.tap(find.text('Submit image for review'));await tester.pumpAndSettle();
    expect(bodies,hasLength(1));expect(find.textContaining('500'),findsOneWidget);
    await tester.tap(find.text('Retry image upload'));await tester.pumpAndSettle();
    expect(bodies.length,2);expect(bodies[1],bodies[0]);expect(bodies[0]['version'],4);expect(bodies[0]['dataBase64'],'aW1hZ2U=');
  });

  testWidgets('Locality sharing carries explicit consent and the viewed version without a phone payload', (tester) async {
    Map? submitted;
    final service=GenealogyApiService(sessionStore:MemorySessionStore(),client:MockClient((request) async {
      if(request.method=='PUT'){submitted=jsonDecode(request.body) as Map;return http.Response('{"version":6}',200);}
      return http.Response(jsonEncode([{'id':'post-id','title':'Fictional sharing','content':'Fictional content','moderationStatus':'PUBLISHED','version':5,'canEdit':true,'sharing':{'localityVisibility':'PRIVATE','contactVisibility':'PRIVATE','contactConsent':false}}]),200);
    }));
    service.setAuthToken('header.${base64Url.encode(utf8.encode('{"sub":"sharing-owner"}'))}.signature');addTearDown(service.dispose);
    await tester.pumpWidget(MaterialApp(home:CommunityScreen(apiService:service)));await tester.pumpAndSettle();
    await tester.tap(find.text('स्थान / सम्पर्क (Location/contact sharing)'));await tester.pumpAndSettle();
    expect(tester.widgetList<SwitchListTile>(find.byType(SwitchListTile)).every((tile)=>!tile.value),isTrue);
    await tester.enterText(find.byType(TextField).at(0),'Kaski');await tester.enterText(find.byType(TextField).at(1),'Pokhara');
    await tester.tap(find.text('Share approximate locality with verified post readers'));await tester.pump();
    await tester.enterText(find.byType(TextField).at(2),'Share approximate locality');await tester.pump();
    await tester.ensureVisible(find.text('Save sharing for review'));await tester.tap(find.text('Save sharing for review'));await tester.pumpAndSettle();
    expect(submitted,{'version':5,'reason':'Share approximate locality','locality':{'district':'Kaski','municipality':'Pokhara'},'localityVisibility':'VERIFIED_COMMUNITY','contactVisibility':'PRIVATE','contactConsent':false});
    expect(submitted!.containsKey('phoneNumber'),isFalse);
  });

  testWidgets('Moderator sees private report evidence and escalation sends viewed version', (tester) async {
    Map<String,dynamic>? submitted;
    var escalated=false;
    final service=GenealogyApiService(sessionStore:MemorySessionStore(),client:MockClient((request)async{
      if(request.method=='POST'){submitted=jsonDecode(request.body) as Map<String,dynamic>;escalated=true;return http.Response('{}',201);}
      if(request.url.path.endsWith('/reports')){return http.Response(jsonEncode({'version':7,'reports':{'items':[{'sequence':'9007199254740993','reason':'Fictional private report concern','status':'OPEN','reportedVersion':5,'createdAt':'2026-10-06T00:00:00Z'}],'nextBefore':null},'escalations':{'items':[],'nextBefore':null}}),200);}
      return http.Response(jsonEncode([{'id':'post-id','title':'Fictional case','content':'Fictional content','moderationStatus':'PENDING','version':7,'canViewReports':true,'canEscalate':!escalated,'canModerate':!escalated,'escalated':escalated}]),200);
    }));
    service.setAuthToken('case-session');addTearDown(service.dispose);
    await tester.pumpWidget(MaterialApp(home:CommunityScreen(apiService:service)));await tester.pumpAndSettle();
    await tester.tap(find.text('रिपोर्ट प्रमाण (Report evidence)'));await tester.pumpAndSettle();
    expect(find.text('Fictional private report concern'),findsOneWidget);
    expect(tester.widget<TextButton>(find.widgetWithText(TextButton,'Older reports')).onPressed,isNull);
    await tester.pageBack();await tester.pumpAndSettle();
    await tester.tap(find.text('केन्द्रीय समीक्षा (Escalate to central)'));await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField),'Fictional central review request');await tester.pump();
    await tester.tap(find.text('Submit escalation'));await tester.pumpAndSettle();
    expect(submitted,{'version':7,'reason':'Fictional central review request'});
    expect(find.text('Escalated: awaiting independent central review.'),findsOneWidget);
    expect(find.text('Review'),findsNothing);
  });

}
