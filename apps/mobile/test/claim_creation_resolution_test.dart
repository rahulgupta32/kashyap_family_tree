import 'dart:async';
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'claim_pending_intent_test.dart' as pending;
import 'native_session_test.dart' show MemorySessionStore, jsonResponse;

void main() {
  test('restored explicit resolution closes original identity only after durable acknowledgement', () async {
    final store = MemorySessionStore()..value = jsonEncode({...pending.pair(),
      'pendingProfileClaim':pending.envelope(),'pushRemovalPending':true});
    final sent = <dynamic>[];
    final api = pending.service(store,(request) async {
      if (request.url.path == '/auth/native/refresh') return jsonResponse(pending.pair('rotated'));
      sent.add(jsonDecode(request.body));
      if (request.url.path == '/claims/creation-resolution') return jsonResponse({'outcome':'ABANDONED'});
      expect(request.url.path,'/claims');return jsonResponse({'id':'new-claim'});
    });
    addTearDown(api.dispose);
    expect(await api.restoreSession(),isTrue);expect(sent,isEmpty);
    expect(await api.resolvePendingProfileClaim(),{'outcome':'ABANDONED'});
    expect(sent.single,{...pending.draft(),'creationKey':pending.key});
    expect(api.hasPendingProfileClaim,isFalse);
    final saved = jsonDecode(store.value!) as Map;
    expect(saved.containsKey('pendingProfileClaim'),isFalse);
    expect(saved['pushRemovalPending'],isTrue);expect(saved['refreshToken'],'rotated');
    await api.createProfileClaim(pending.draft());
    expect(sent[1]['creationKey'],isNot(pending.key));
  });

  test('created resolution preserves original request body and returns existing claim ID', () async {
    final store = MemorySessionStore()..value = jsonEncode({...pending.pair(),'pendingProfileClaim':pending.envelope()});
    final api = pending.service(store,(request) async {
      if (request.url.path == '/auth/native/refresh') return jsonResponse(pending.pair());
      expect(request.url.path,'/claims/creation-resolution');
      expect(jsonDecode(request.body),{...pending.draft(),'creationKey':pending.key});
      return jsonResponse({'outcome':'CREATED','claimId':'original-claim'});
    });
    addTearDown(api.dispose);await api.restoreSession();
    expect(await api.resolvePendingProfileClaim(),{'outcome':'CREATED','claimId':'original-claim'});
    expect(api.hasPendingProfileClaim,isFalse);
    expect(jsonDecode(store.value!).containsKey('pendingProfileClaim'),isFalse);
  });

  test('malformed and contradictory resolutions retain original pending identity', () async {
    for (final response in <dynamic>[
      null, [], {}, {'outcome':'CREATED'}, {'outcome':'CREATED','claimId':''},
      {'outcome':'CREATED','claimId':' '}, {'outcome':'CREATED','claimId':42},
      {'outcome':'CREATED','claimId':List.filled(129,'x').join()},
      {'outcome':'CREATED','claimId':'claim','extra':true},
      {'outcome':'ABANDONED','claimId':'claim'}, {'outcome':'OTHER'},
    ]) {
      final store = MemorySessionStore()..value = jsonEncode({...pending.pair(),'pendingProfileClaim':pending.envelope()});
      final api = pending.service(store,(request) async {
        if (request.url.path == '/auth/native/refresh') return jsonResponse(pending.pair());
        return http.Response(jsonEncode(response),200,headers:{'content-type':'application/json'});
      });
      addTearDown(api.dispose);await api.restoreSession();
      await expectLater(api.resolvePendingProfileClaim(),throwsFormatException);
      expect(api.hasPendingProfileClaim,isTrue);
      expect(jsonDecode(store.value!)['pendingProfileClaim'],pending.envelope());
    }
  });

  test('HTTP rejection retains original pending record for another explicit resolution', () async {
    final store = MemorySessionStore()..value = jsonEncode({...pending.pair(),'pendingProfileClaim':pending.envelope()});
    final api = pending.service(store,(request) async {
      if (request.url.path == '/auth/native/refresh') return jsonResponse(pending.pair());
      expect(request.url.path,'/claims/creation-resolution');
      return jsonResponse({'message':'Private diagnostic'},503);
    });
    addTearDown(api.dispose);await api.restoreSession();
    await expectLater(api.resolvePendingProfileClaim(),throwsException);
    expect(api.hasPendingProfileClaim,isTrue);
    expect(jsonDecode(store.value!)['pendingProfileClaim'],pending.envelope());
  });

  test('failed durable intent write prevents resolution HTTP and preserves original state', () async {
    final store = pending.FailingStore()..value = jsonEncode({...pending.pair(),'pendingProfileClaim':pending.envelope()});
    var sends = 0;
    final api = pending.service(store,(request) async {
      if (request.url.path == '/auth/native/refresh') return jsonResponse(pending.pair());
      sends++;return jsonResponse({'outcome':'ABANDONED'});
    });
    addTearDown(api.dispose);await api.restoreSession();store.fail = true;
    await expectLater(api.resolvePendingProfileClaim(),throwsStateError);
    expect(sends,0);expect(api.hasPendingProfileClaim,isTrue);
    expect(jsonDecode(store.value!)['pendingProfileClaim'],pending.envelope());
  });

  test('unconfirmed cleanup retains identity through independent writes and explicit resolution retry', () async {
    final store = pending.FailingStore()..value = jsonEncode({...pending.pair(),'pendingProfileClaim':pending.envelope()});
    final bodies = <dynamic>[];
    final api = pending.service(store,(request) async {
      if (request.url.path == '/auth/native/refresh') return jsonResponse(pending.pair());
      bodies.add(jsonDecode(request.body));
      if (bodies.length == 1) store.fail = true;
      return jsonResponse({'outcome':'ABANDONED'});
    });
    addTearDown(api.dispose);await api.restoreSession();
    await expectLater(api.resolvePendingProfileClaim(),throwsStateError);
    expect(api.hasPendingProfileClaim,isTrue);
    store.fail = false;
    await api.rememberPushRemoval(api.pushSessionGeneration);
    expect(jsonDecode(store.value!)['pendingProfileClaim'],pending.envelope());
    await api.resolvePendingProfileClaim();expect(bodies[1],bodies[0]);
    expect(api.hasPendingProfileClaim,isFalse);
    expect(jsonDecode(store.value!).containsKey('pendingProfileClaim'),isFalse);
    expect(jsonDecode(store.value!)['pushRemovalPending'],isTrue);
  });

  test('shared single-flight fences retry/create/resolve and ignores replaced-session resolution', () async {
    final store = MemorySessionStore()..value = jsonEncode({...pending.pair(),'pendingProfileClaim':pending.envelope()});
    final arrived = Completer<void>();final result = Completer<http.Response>();var resolutions = 0;
    final api = pending.service(store,(request) async {
      if (request.url.path == '/auth/native/refresh' || request.url.path == '/auth/native/verify') return jsonResponse(pending.pair());
      resolutions++;arrived.complete();return result.future;
    });
    addTearDown(api.dispose);await api.restoreSession();
    final old = expectLater(api.resolvePendingProfileClaim(),throwsStateError);await arrived.future;
    await expectLater(api.resolvePendingProfileClaim(),throwsStateError);
    await expectLater(api.retryPendingProfileClaim(),throwsStateError);
    await expectLater(api.createProfileClaim(pending.draft()),throwsStateError);
    expect(resolutions,1);
    await api.verifyOtp('replacement','123456');
    result.complete(jsonResponse({'outcome':'CREATED','claimId':'old-claim'}));await old;
    expect(api.hasPendingProfileClaim,isFalse);
    expect(jsonDecode(store.value!).containsKey('pendingProfileClaim'),isFalse);
  });

  test('unauthorized resolution rotates once and repeats identical body within the same session', () async {
    final store = MemorySessionStore()..value = jsonEncode({...pending.pair(),'pendingProfileClaim':pending.envelope()});
    final bodies = <String>[];var refreshes = 0;
    final api = pending.service(store,(request) async {
      if (request.url.path == '/auth/native/refresh') return jsonResponse(pending.pair('rotated-${++refreshes}'));
      bodies.add(request.body);
      return bodies.length == 1 ? jsonResponse({},401) : jsonResponse({'outcome':'ABANDONED'});
    });
    addTearDown(api.dispose);await api.restoreSession();
    final generation = api.pushSessionGeneration;
    await api.resolvePendingProfileClaim();
    expect(bodies.length,2);expect(bodies[0],bodies[1]);expect(refreshes,2);
    expect(api.pushSessionGeneration,generation);expect(api.hasPendingProfileClaim,isFalse);
    expect(jsonDecode(store.value!)['refreshToken'],'rotated-2');
  });
}
