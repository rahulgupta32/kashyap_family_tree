import 'dart:async';
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kashyap_mobile/services/genealogy_api_service.dart';
import 'native_session_test.dart' show MemorySessionStore, jsonResponse;
import 'chat_outbox_test.dart' show MemoryChatOutboxStore;

const server = 'https://claim.example.test';
const key = '00000000-0000-4000-8000-000000000001';
String token(String owner) => 'x.${base64Url.encode(utf8.encode(jsonEncode({'sub': owner})))}.signature';
Map<String, dynamic> draft() => {
  'targetPersonId': 'fictional-person', 'relationshipDescription': 'Private family relationship',
  'statementOfTruth': true, 'evidenceAttachments': [
    {'mediaAssetId': '11111111-1111-4111-8111-111111111111', 'documentType': 'family_photo'}
  ]
};
Map<String, dynamic> pair([String refresh = 'refresh']) => {'accessToken': token('owner'), 'refreshToken': refresh};
Map<String, dynamic> envelope() => {'key': key, 'owner': 'owner', 'server': server, 'body': draft()};

class FailingStore extends MemorySessionStore {
  bool fail = false;
  @override
  Future<void> write(String value) async {
    if (fail) { throw StateError('storage unavailable'); }
    await super.write(value);
  }
}

GenealogyApiService service(MemorySessionStore store, Future<http.Response> Function(http.Request) send) =>
    GenealogyApiService(baseUrl: server, sessionStore: store,
      chatOutboxStore: MemoryChatOutboxStore(), client: MockClient(send));

void main() {
  test('lost acknowledgement restores exact private intent before retry and rotates credentials', () async {
    final store = MemorySessionStore();
    final sent = <Map<String, dynamic>>[];
    final first = service(store, (request) async {
      if (request.url.path == '/auth/native/verify') { return jsonResponse(pair()); }
      final saved = jsonDecode(store.value!) as Map;
      expect(saved['pendingProfileClaim']['owner'], 'owner');
      expect(saved['pendingProfileClaim']['server'], server);
      sent.add(jsonDecode(request.body) as Map<String, dynamic>);
      expect(saved['pendingProfileClaim']['key'], sent.single['creationKey']);
      throw StateError('lost response after commit');
    });
    await first.verifyOtp('otp', '123456');
    final original = draft();
    await expectLater(first.createProfileClaim(original), throwsStateError);
    original['relationshipDescription'] = 'Changed draft';
    (original['evidenceAttachments'] as List).clear();
    expect(first.hasPendingProfileClaim, isTrue);
    expect(first.pendingProfileClaimTargetId, 'fictional-person');
    first.dispose();
    final restored = service(store, (request) async {
      if (request.url.path == '/auth/native/refresh') { return jsonResponse(pair('rotated')); }
      expect(request.url.path, '/claims');
      sent.add(jsonDecode(request.body) as Map<String, dynamic>);
      return jsonResponse({'id': 'original-claim', 'targetPersonId': 'fictional-person'}, 201);
    });
    addTearDown(restored.dispose);
    expect(await restored.restoreSession(), isTrue);
    expect(jsonDecode(store.value!)['refreshToken'], 'rotated');
    expect(restored.hasPendingProfileClaim, isTrue);
    await expectLater(restored.createProfileClaim(draft()), throwsStateError);
    expect(await restored.retryPendingProfileClaim(), {'id': 'original-claim', 'targetPersonId': 'fictional-person'});
    expect(sent[1], sent[0]);
    expect(sent[0]['creationKey'], matches(RegExp(r'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$')));
    expect(restored.hasPendingProfileClaim, isFalse);
    expect(restored.pendingProfileClaimTargetId, isNull);
    expect(jsonDecode(store.value!).containsKey('pendingProfileClaim'), isFalse);
  });

  test('storage failure prevents HTTP and preserves original identity for explicit retry', () async {
    final store = FailingStore();
    final sent = <Map<String, dynamic>>[];
    final api = service(store, (request) async {
      if (request.url.path == '/auth/native/verify') { return jsonResponse(pair()); }
      sent.add(jsonDecode(request.body) as Map<String, dynamic>);
      return jsonResponse({'id': 'claim'}, 201);
    });
    addTearDown(api.dispose);
    await api.verifyOtp('otp', '123456');
    store.fail = true;
    await expectLater(api.createProfileClaim(draft()), throwsStateError);
    expect(sent, isEmpty);
    expect(api.hasPendingProfileClaim, isTrue);
    store.fail = false;
    await api.retryPendingProfileClaim();
    expect(sent.length, 1);
    expect(sent.single['relationshipDescription'], draft()['relationshipDescription']);
    expect(api.hasPendingProfileClaim, isFalse);
  });

  test('unconfirmed cleanup retains exact key and a later refresh cannot erase it', () async {
    final store = FailingStore();
    final sent = <String>[];
    var reads = 0;
    final api = service(store, (request) async {
      if (request.url.path == '/auth/native/verify') { return jsonResponse(pair()); }
      if (request.url.path == '/auth/native/refresh') { return jsonResponse(pair('rotated')); }
      if (request.url.path == '/me') { return ++reads == 1 ? jsonResponse({}, 401) : jsonResponse({}); }
      sent.add(request.body);
      if (sent.length == 1) { store.fail = true; }
      return jsonResponse({'id': 'one-claim'}, 201);
    });
    addTearDown(api.dispose);
    await api.verifyOtp('otp', '123456');
    await expectLater(api.createProfileClaim(draft()), throwsStateError);
    expect(api.hasPendingProfileClaim, isTrue);
    final pendingKey = jsonDecode(store.value!)['pendingProfileClaim']['key'];
    store.fail = false;
    final generation = api.pushSessionGeneration;
    await api.requestJson('/me');
    expect(api.pushSessionGeneration, generation);
    expect(jsonDecode(store.value!)['pendingProfileClaim']['key'], pendingKey);
    await api.retryPendingProfileClaim();
    expect(sent[1], sent[0]);
    expect(api.hasPendingProfileClaim, isFalse);
  });

  test('401 retry keeps the same identity and body through same-family rotation', () async {
    final store = MemorySessionStore();
    final sent = <String>[];
    var rotated = false;
    final api = service(store, (request) async {
      if (request.url.path == '/auth/native/verify') { return jsonResponse(pair()); }
      if (request.url.path == '/auth/native/refresh') { rotated = true; return jsonResponse(pair('rotated')); }
      sent.add(request.body);
      return rotated ? jsonResponse({'id': 'claim'}, 201) : jsonResponse({}, 401);
    });
    addTearDown(api.dispose);
    await api.verifyOtp('otp', '123456');
    final generation = api.pushSessionGeneration;
    await api.createProfileClaim(draft());
    expect(sent.length, 2);
    expect(sent[1], sent[0]);
    expect(api.pushSessionGeneration, generation);
  });

  test('concurrent submission is fenced and replacement sign-in clears stored private intent', () async {
    final arrived = Completer<void>();
    final response = Completer<http.Response>();
    final store = MemorySessionStore();
    var posts = 0;
    final api = service(store, (request) async {
      if (request.url.path == '/auth/native/verify') { return jsonResponse(pair()); }
      posts++;
      arrived.complete();
      return response.future;
    });
    addTearDown(api.dispose);
    await api.verifyOtp('otp', '123456');
    final old = expectLater(api.createProfileClaim(draft()), throwsStateError);
    await arrived.future;
    await expectLater(api.retryPendingProfileClaim(), throwsStateError);
    await expectLater(api.createProfileClaim(draft()), throwsStateError);
    expect(posts, 1);
    await api.verifyOtp('replacement', '123456');
    expect(api.hasPendingProfileClaim, isFalse);
    expect(jsonDecode(store.value!).containsKey('pendingProfileClaim'), isFalse);
    response.complete(jsonResponse({'id': 'old-claim'}, 201));
    await old;
    expect(api.hasPendingProfileClaim, isFalse);
  });

  test('malformed or wrong-target acknowledgement never clears retry identity', () async {
    for (final acknowledgement in [{}, {'id': ''}, {'id': 'claim', 'targetPersonId': 'other'}]) {
      final api = service(MemorySessionStore(), (_) async => jsonResponse(acknowledgement, 201))..setAuthToken('fixture');
      addTearDown(api.dispose);
      await expectLater(api.createProfileClaim(draft()), throwsFormatException);
      expect(api.hasPendingProfileClaim, isTrue);
      expect(api.pendingProfileClaimTargetId, 'fictional-person');
    }
  });

  test('restoration rejects malformed, foreign, mutable or oversized stored envelopes before HTTP', () async {
    final invalid = <dynamic>[
      null,
      {...envelope(), 'owner': 'other'},
      {...envelope(), 'server': 'https://other.example.test'},
      {...envelope(), 'key': '------------------------------------'},
      {...envelope(), 'key': '00000000-0000-1000-8000-000000000001'},
      {...envelope(), 'extra': 'unrecognized'},
      {...envelope(), 'body': {...draft(), 'creationKey': key}},
      {...envelope(), 'body': {...draft(), 'statementOfTruth': false}},
      {...envelope(), 'body': {...draft(), 'targetPersonId': ''}},
      {...envelope(), 'body': {...draft(), 'relationshipDescription': List.filled(2001, 'x').join()}},
      {...envelope(), 'body': {...draft(), 'evidenceAttachments': [{'mediaAssetId': 'asset', 'documentType': 'government_document'}]}},
      {...envelope(), 'body': {...draft(), 'evidenceAttachments': List.filled(6, {'mediaAssetId': 'asset', 'documentType': 'other'})}},
    ];
    for (final pending in invalid) {
      final store = MemorySessionStore()..value = jsonEncode({...pair(), 'pendingProfileClaim': pending});
      var sends = 0;
      final api = service(store, (_) async { sends++; return jsonResponse(pair()); });
      addTearDown(api.dispose);
      expect(await api.restoreSession(), isFalse);
      expect(sends, 0);
      expect(store.value, isNull);
      expect(api.hasPendingProfileClaim, isFalse);
    }
  });

  test('push and calendar serialized writes preserve claim intent and independent cleanup', () async {
    final store = MemorySessionStore();
    final api = service(store, (request) async {
      if (request.url.path == '/auth/native/verify') { return jsonResponse(pair()); }
      if (request.url.path == '/calendar/events') { return jsonResponse({'id': 'calendar-event'}, 201); }
      return jsonResponse({'message': 'unavailable'}, 503);
    });
    addTearDown(api.dispose);
    await api.verifyOtp('otp', '123456');
    await expectLater(api.createProfileClaim(draft()), throwsException);
    final pending = jsonDecode(store.value!)['pendingProfileClaim'];
    await api.rememberPushRemoval(api.pushSessionGeneration);
    await api.createCalendarEvent({'title': 'Fixture'});
    expect(jsonDecode(store.value!)['pendingProfileClaim'], pending);
    expect(jsonDecode(store.value!)['pushRemovalPending'], isTrue);
    expect(api.hasPendingCalendarCreate, isFalse);
    expect(api.hasPendingProfileClaim, isTrue);
  });

  test('confirmed logout removes pending private intent from memory and secure session', () async {
    final store = MemorySessionStore();
    final api = service(store, (request) async {
      if (request.url.path == '/auth/native/verify') { return jsonResponse(pair()); }
      if (request.url.path == '/auth/logout') { return jsonResponse({'success': true}); }
      return jsonResponse({'message': 'unavailable'}, 503);
    });
    addTearDown(api.dispose);
    await api.verifyOtp('otp', '123456');
    await expectLater(api.createProfileClaim(draft()), throwsException);
    expect(api.hasPendingProfileClaim, isTrue);
    await api.logout();
    expect(api.hasPendingProfileClaim, isFalse);
    expect(api.pendingProfileClaimTargetId, isNull);
    expect(store.value, isNull);
  });

  test('bearer-only compatibility remains memory-scoped and never overwrites secure credentials', () async {
    final store = MemorySessionStore()..value = 'untouched';
    final bodies = <String>[];
    final api = service(store, (request) async { bodies.add(request.body); return jsonResponse({}, 503); })..setAuthToken('fixture');
    addTearDown(api.dispose);
    await expectLater(api.createProfileClaim(draft()), throwsException);
    await expectLater(api.retryPendingProfileClaim(), throwsException);
    expect(bodies[0], bodies[1]);
    expect(store.value, 'untouched');
    api.setAuthToken('fixture');
    expect(api.hasPendingProfileClaim, isFalse);
    await expectLater(api.createProfileClaim(draft()), throwsException);
    expect(jsonDecode(bodies[2])['creationKey'], isNot(jsonDecode(bodies[0])['creationKey']));
  });
}
