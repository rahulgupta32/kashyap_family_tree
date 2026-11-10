import 'dart:convert';
import 'dart:async';
import 'package:http/http.dart' as http;
import '../services/genealogy_api_service.dart';
import '../services/session_store.dart';
import '../services/chat_outbox.dart';
import '../services/chat_connection.dart';

const previewPersonas = [
  'Regular Member',
  'New / Unclaimed Member',
  'Branch Verifier',
  'Branch Admin',
  'Super Admin'
];
const previewOnly =
    'Offline synthetic preview only. This action requires authenticated full-stack testing; no backend change was made.';

class PreviewMemoryStore implements SessionStore, ChatOutboxStore {
  String? value;
  @override
  Future<String?> read() async => value;
  @override
  Future<void> write(String value) async {
    this.value = value;
  }

  @override
  Future<void> clear() async {
    value = null;
  }
}

/// No HTTP delegate, socket, JWT, secure credential or production data exists here.
class PreviewRepository extends http.BaseClient {
  final String persona;
  PreviewRepository(this.persona);
  bool get manager => ['Branch Admin', 'Super Admin'].contains(persona);
  String get owner => 'synthetic-${previewPersonas.indexOf(persona)}';
  final connections = <PreviewChatConnection>[];
  int sequence = 1;
  final preferences = <String, dynamic>{
    'inAppEnabled': true,
    'pushEnabled': false,
    'emailEnabled': false,
    'smsEnabled': false
  };
  late final people = <Map<String, dynamic>>[
    person('preview-parent', 'नमूना अभिभावक', 'Synthetic Parent', 1),
    person('preview-member', 'नमूना सदस्य', 'Synthetic Member', 2),
    person('preview-child', 'नमूना सन्तान', 'Synthetic Child', 3),
  ];
  Map<String, dynamic> person(
          String id, String ne, String en, int generation) =>
      {
        'id': id,
        'primaryNameNepali': ne,
        'primaryNameEnglish': en,
        'nameNepali': ne,
        'nameEnglish': en,
        'gender': 'OTHER',
        'livingStatus': 'LIVING',
        'generation': generation,
        'branchId': 'preview-branch',
        'branchName': 'Synthetic branch',
        'version': 1,
        'isClaimed': id == 'preview-member',
        'names': <dynamic>[],
        'parents': <dynamic>[],
        'children': <dynamic>[],
        'spouses': <dynamic>[],
        'birthPlace': 'Synthetic locality',
        'occupation': 'Synthetic occupation',
        'biography': 'Fictional preview record — no actual family data.',
      };
  late final events = <Map<String, dynamic>>[
    {
      'id': 'preview-event',
      'title': 'Synthetic family gathering',
      'description': 'Offline preview fixture — not a real invitation.',
      'eventType': 'GENERAL_EVENT',
      'audienceScope': 'PRIVATE',
      'startsAt': '2026-11-10T04:15:00Z',
      'location': 'Synthetic venue',
      'lifecycleState': 'ACTIVE',
      'version': 1,
      'canManage': true,
      'myRsvp': null,
    }
  ];
  final histories = <String, List<Map<String, dynamic>>>{
    'preview-event': [
      {
        'version': 1,
        'action': 'CALENDAR_EVENT_CREATED',
        'createdAt': '2026-11-09T00:00:00Z'
      }
    ]
  };
  final posts = <Map<String, dynamic>>[
    {
      'id': 'preview-post',
      'title': 'Synthetic community welcome',
      'content': 'This fictional post stays on this device until reset.',
      'category': 'GENERAL',
      'moderationStatus': 'PUBLISHED',
      'isLiked': false,
      'likesCount': 0,
      'commentsCount': 0,
      'canModerate': false,
      'canDelete': true,
      'canEdit': true,
      'version': 1,
    }
  ];
  final comments = <Map<String, dynamic>>[];
  final claims = <Map<String, dynamic>>[];
  final proposals = <Map<String, dynamic>>[];
  final notices = <Map<String, dynamic>>[
    {
      'id': '22222222-2222-4222-8222-222222222222',
      'title': 'Synthetic announcement',
      'body': 'Offline sample announcement. No notification was delivered.',
      'content': 'Offline sample announcement. No notification was delivered.',
      'publishedAt': '2026-11-09T00:00:00Z',
      'createdAt': '2026-11-09T00:00:00Z',
      'channel': 'IN_APP',
      'status': 'SENT',
    }
  ];
  final inbox = <Map<String, dynamic>>[
    {
      'id': 'preview-notification',
      'title': 'Synthetic notification',
      'body': 'Preview only — no push delivery.',
      'readAt': null,
      'createdAt': '2026-11-09T00:00:00Z',
      'type': 'ANNOUNCEMENT',
    }
  ];
  final messages = <Map<String, dynamic>>[
    {
      'id': 'preview-message',
      'sequence': 1,
      'readByUserIds': <String>[],
      'deliveredToUserIds': <String>[],
      'content': 'Synthetic chat history — no network delivery.',
      'senderUserId': 'synthetic-other',
      'createdAt': '2026-11-09T00:00:00Z',
      'senderName': 'Synthetic relative',
      'deliveredCount': 0,
      'readCount': 0,
    }
  ];
  final privacy = <String, dynamic>{
    'profileVisibility': 'VERIFIED_COMMUNITY',
    'contactVisibility': 'IMMEDIATE_FAMILY',
    'addressVisibility': 'PRIVATE'
  };
  Map<String, dynamic> get profile => {
        'id': owner,
        'userId': owner,
        'personId':
            persona == 'New / Unclaimed Member' ? null : 'preview-member',
        'person': people[1],
        'roles': [
          if (manager)
            persona == 'Super Admin' ? 'SUPER_ADMIN' : 'BRANCH_ADMIN'
          else if (persona == 'Branch Verifier')
            'BRANCH_VERIFIER'
          else
            'MEMBER'
        ],
        'privacy': privacy,
        'synthetic': true,
      };
  Map<String, dynamic> conversation() => {
        'id': '11111111-1111-4111-8111-111111111111',
        'title': 'Synthetic conversation',
        'type': 'DIRECT',
        'isParticipant': true,
        'unreadCount': 1
      };

  dynamic route(String method, Uri uri, Map<String, dynamic> body) {
    final path = uri.path;
    final read = method == 'GET';
    if (path.startsWith('/auth/')) throw StateError(previewOnly);
    if (path == '/genealogy/search' && read) {
      final q = (uri.queryParameters['query'] ?? '').toLowerCase();
      final rows = people
          .where((p) => '${p['primaryNameNepali']} ${p['primaryNameEnglish']}'
              .toLowerCase()
              .contains(q))
          .toList();
      return {'items': rows, 'total': rows.length, 'page': 1, 'limit': 20};
    }
    if (path == '/genealogy/branches' && read) {
      return [
        {
          'id': 'preview-branch',
          'nameNepali': 'नमूना शाखा',
          'nameEnglish': 'Synthetic branch'
        }
      ];
    }
    if (path.startsWith('/genealogy/people/') && read) {
      final id = uri.pathSegments[2];
      final p = people.singleWhere((p) => p['id'] == id);
      if (path.endsWith('/tree')) {
        return {
          ...p,
          'ancestors': id == 'preview-member' ? [people[0]] : [],
          'children': id == 'preview-member' ? [people[2]] : [],
          'spouses': []
        };
      }
      return {
        ...p,
        'parents': id == 'preview-member'
            ? [
                {
                  'id': 'preview-link-parent',
                  'targetPersonId': 'preview-parent',
                  'person': people[0]
                }
              ]
            : [],
        'children': id == 'preview-member'
            ? [
                {
                  'id': 'preview-link-child',
                  'targetPersonId': 'preview-child',
                  'person': people[2]
                }
              ]
            : []
      };
    }
    if (path == '/profile/me' && read) return profile;
    if (path == '/profile/privacy' || path == '/profile/profile') {
      if (!read) {
        if (path == '/profile/privacy') {
          privacy.addAll(body);
        } else {
          people[1].addAll({...body}..remove('privacy'));
          if (body['privacy'] is Map) {
            privacy.addAll(Map<String, dynamic>.from(body['privacy'] as Map));
          }
        }
      }
      return profile;
    }
    if (path == '/calendar/events' || path == '/calendar') {
      if (read) return events;
      final event = {
        ...events.first,
        ...body,
        'id': 'preview-event-${sequence++}',
        'version': 1,
        'lifecycleState': 'ACTIVE',
        'canManage': true
      };
      events.add(event);
      histories[event['id'] as String] = [
        {'version': 1, 'action': 'CALENDAR_EVENT_CREATED'}
      ];
      return event;
    }
    if (path == '/calendar/browse') {
      return {'items': events, 'nextBefore': null};
    }
    if (path == '/calendar/invitees') return [];
    if (path == '/calendar/period') {
      final date = uri.queryParameters['date'] ?? '2026-11-10';
      return {
        'items': events.map((e) => {...e, 'displayDate': date}).toList(),
        'nextBefore': null,
        'days': [
          {'date': date, 'day': 10, 'count': events.length}
        ],
        'undatedCount': 0,
        'period': {
          'label': 'Synthetic period',
          'source': uri.queryParameters['source'],
          'view': uri.queryParameters['view'],
          'date': date
        }
      };
    }
    if (path.startsWith('/calendar/events/')) {
      final event = events.singleWhere((e) => e['id'] == uri.pathSegments[2]);
      if (path.endsWith('/history')) return histories[event['id']] ?? [];
      if (path.endsWith('/rsvp')) {
        if (event['lifecycleState'] == 'CANCELLED') {
          throw StateError('Synthetic event is cancelled');
        }
        event['myRsvp'] = body['response'];
        return {'success': true, 'myRsvp': body['response']};
      }
      if (!read) {
        if (body['version'] != event['version']) {
          throw StateError('Synthetic event version changed; reload');
        }
        event.addAll(body);
        event['version'] = (event['version'] as int) + 1;
        if (path.endsWith('/cancel')) event['lifecycleState'] = 'CANCELLED';
        histories.putIfAbsent(event['id'] as String, () => []).add({
          'version': event['version'],
          'action': path.endsWith('/cancel')
              ? 'CALENDAR_EVENT_CANCELLED'
              : 'CALENDAR_EVENT_UPDATED'
        });
      }
      return event;
    }
    if (path == '/community/posts') {
      if (!read) {
        posts.insert(0, {
          'moderationStatus': 'PUBLISHED',
          'isLiked': false,
          'likesCount': 0,
          'commentsCount': 0,
          'canDelete': true,
          'canEdit': true,
          'version': 1,
          ...body,
          'id': 'preview-post-${sequence++}'
        });
      }
      return read
          ? posts.map((p) => {...p, 'canModerate': manager}).toList()
          : posts.first;
    }
    if (path.startsWith('/community/posts/')) {
      final post = posts.singleWhere((p) => p['id'] == uri.pathSegments[2]);
      if (path.endsWith('/comments/browse')) {
        return {'items': comments, 'nextBefore': null};
      }
      if (path.endsWith('/comments') && !read) {
        final comment = {
          ...body,
          'id': 'preview-comment-${sequence++}',
          'createdAt': '2026-11-09T00:00:00Z'
        };
        comments.add(comment);
        post['commentsCount'] = comments.length;
        return comment;
      }
      if (path.endsWith('/like')) {
        post['isLiked'] = body['liked'];
        post['likesCount'] = body['liked'] == true ? 1 : 0;
        return post;
      }
      if (method == 'PUT' && uri.pathSegments.length == 3) {
        post.addAll(body);
        return post;
      }
      if (method == 'DELETE' && uri.pathSegments.length == 3) {
        posts.remove(post);
        return {'success': true};
      }
      throw StateError(previewOnly);
    }
    if (path == '/notifications/preferences') {
      if (!read) preferences.addAll(body);
      return preferences;
    }
    if (path == '/notifications') return {'items': inbox, 'nextCursor': null};
    if (path == '/notifications/broadcasts') return notices;
    if (path.startsWith('/notifications/broadcasts/')) return notices.first;
    if (!read &&
        (path == '/notifications/read-all' ||
            path.endsWith('/read') ||
            path.endsWith('/unread')) &&
        path.startsWith('/notifications/')) {
      for (final n in inbox) {
        n['readAt'] = path.endsWith('/unread') ? null : '2026-11-09T00:00:00Z';
      }
      return {'success': true};
    }
    if (path == '/chat/conversations') {
      return read ? [conversation()] : conversation();
    }
    if (path.endsWith('/messages') && path.startsWith('/chat/')) {
      if (!read) {
        final m = {
          ...body,
          'id': 'preview-message-${sequence++}',
          'senderUserId': owner,
          'sequence': messages.length + 1,
          'readByUserIds': <String>[],
          'deliveredToUserIds': <String>[],
          'createdAt': '2026-11-09T00:00:00Z'
        };
        messages.add(m);
        for (final connection in connections) {
          connection.snapshot();
        }
        return m;
      }
      return messages;
    }
    if (path.startsWith('/chat/') && path.endsWith('/read')) {
      return {'success': true};
    }
    if (path == '/claims/mine') return {'items': claims, 'nextCursor': null};
    if (path == '/claims' || path == '/change-requests') {
      final rows = path == '/claims' ? claims : proposals;
      if (!read) {
        rows.add({
          ...body,
          'id': 'preview-request-${sequence++}',
          'requesterUserId': owner,
          'status': path == '/claims' ? 'PENDING_TIER1' : 'PENDING',
          'version': 1,
          'createdAt': '2026-11-09T00:00:00Z'
        });
      }
      return read ? rows : rows.last;
    }
    if (path.startsWith('/change-requests/') && read) {
      return proposals.singleWhere((p) => p['id'] == uri.pathSegments[1]);
    }
    if (path == '/cultural/content/published' && read) return [];
    if (path == '/calendar/recurrences' && read) return [];
    throw StateError(
        '$previewOnly\nUnsupported synthetic route: $method $path');
  }

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    if (request.url.host != 'offline-preview.invalid') {
      throw StateError('Preview transport forbids external hosts');
    }
    try {
      final raw = await request.finalize().bytesToString();
      final body = raw.isEmpty
          ? <String, dynamic>{}
          : Map<String, dynamic>.from(jsonDecode(raw) as Map);
      final result = route(request.method, request.url, body);
      return http.StreamedResponse(
          Stream.value(utf8.encode(jsonEncode(result))),
          request.method == 'POST' ? 201 : 200,
          headers: {'content-type': 'application/json'});
    } catch (e) {
      return http.StreamedResponse(
          Stream.value(utf8.encode(jsonEncode({'message': e.toString()}))), 409,
          headers: {'content-type': 'application/json'});
    }
  }
}

class PreviewApiService extends GenealogyApiService {
  final PreviewRepository repository;
  PreviewApiService(this.repository)
      : super(
            baseUrl: 'https://offline-preview.invalid',
            client: repository,
            sessionStore: PreviewMemoryStore(),
            chatOutboxStore: PreviewMemoryStore());
  // UI session marker only: no bearer is installed in the production transport.
  @override
  String? get authToken => 'offline-ui-marker-not-a-credential';
  @override
  String? get chatAccountId => repository.owner;
  @override
  Future<ChatConnection> openChatConnection() async {
    final connection = PreviewChatConnection(repository);
    repository.connections.add(connection);
    return connection;
  }

  @override
  Future<dynamic> createCalendarEvent([Map<String, dynamic>? body]) =>
      requestJson('/calendar/events', method: 'POST', data: body);
  @override
  Future<Map<String, dynamic>> createProfileClaim(
          Map<String, dynamic> body) async =>
      Map<String, dynamic>.from(
          await requestJson('/claims', method: 'POST', data: body) as Map);
  @override
  Future<bool> restoreSession() async => false;
}

class PreviewChatConnection implements ChatConnection {
  final PreviewRepository repository;
  late final StreamController<Map<String, dynamic>> controller;
  PreviewChatConnection(this.repository) {
    controller = StreamController<Map<String, dynamic>>(
        onListen: () => scheduleMicrotask(() {
              if (!controller.isClosed) {
                controller.add({'type': 'authenticated'});
              }
            }));
  }
  void snapshot() {
    if (!controller.isClosed) {
      controller.add({
        'type': 'snapshot',
        'conversationId': repository.conversation()['id'],
        'messages': jsonDecode(jsonEncode(repository.messages)),
        'typingUserIds': <String>[]
      });
    }
  }

  @override
  Stream<Map<String, dynamic>> get frames => controller.stream;
  @override
  int? get closeCode => controller.isClosed ? 1000 : null;
  @override
  void send(Map<String, dynamic> frame) {
    if (frame['type'] == 'subscribe') snapshot();
  }

  @override
  Future<void> close() async {
    repository.connections.remove(this);
    await controller.close();
  }
}
