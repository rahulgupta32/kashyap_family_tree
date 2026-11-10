import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:kashyap_mobile/dev_preview/preview_app.dart';
import 'package:kashyap_mobile/dev_preview/preview_repository.dart';
import 'package:kashyap_mobile/screens/notification_inbox_screen.dart';

void main() {
  test('preview requires explicit opt-in and debug mode', () {
    expect(allowDevPreview(debug: false, requested: true), isFalse);
    expect(allowDevPreview(debug: true, requested: false), isFalse);
    expect(allowDevPreview(debug: true, requested: true), isTrue);
  });
  test('transport rejects external hosts and authentication APIs', () async {
    final repo = PreviewRepository(previewPersonas.first);
    final api = PreviewApiService(repo);
    addTearDown(api.dispose);
    expect(api.chatAccountId, 'synthetic-0');
    await expectLater(
        repo.send(http.Request(
            'GET', Uri.parse('https://production.invalid/profile/me'))),
        throwsStateError);
    await expectLater(api.requestOtp('+9779800000000'), throwsException);
    expect((await api.searchPersons()).length, 3);
  });
  test('calendar mutations and notification settings persist only in memory',
      () async {
    final repo = PreviewRepository(previewPersonas.first);
    final api = PreviewApiService(repo);
    addTearDown(api.dispose);
    final event =
        await api.createCalendarEvent({'title': 'Changed synthetic event'});
    expect((await api.getCalendarEvents()).length, 2);
    await api.requestJson('/calendar/events/${event['id']}/rsvp',
        method: 'POST', data: {'response': 'GOING'});
    expect((await api.requestJson('/calendar/events/${event['id']}'))['myRsvp'],
        'GOING');
    await api.requestJson('/notifications/preferences',
        method: 'PATCH', data: {'inAppEnabled': false});
    expect(
        (await api.requestJson('/notifications/preferences'))['inAppEnabled'],
        false);
    expect(PreviewRepository(previewPersonas.first).events.length, 1);
    expect(PreviewRepository(previewPersonas.first).preferences['inAppEnabled'],
        true);
  });
  test('preview privacy round-trip and empty-community recovery stay local',
      () async {
    final repo = PreviewRepository(previewPersonas.first);
    final api = PreviewApiService(repo);
    addTearDown(api.dispose);
    await api.updateProfilePrivacy(
        profileVisibility: 'PRIVATE',
        contactVisibility: 'PRIVATE',
        addressVisibility: 'PRIVATE');
    expect(
        (await api.getMyProfile())['privacy']['profileVisibility'], 'PRIVATE');
    await api.requestJson('/community/posts/preview-post', method: 'DELETE');
    await api.requestJson('/community/posts',
        method: 'POST',
        data: {'title': 'New synthetic post', 'content': 'Local only'});
    expect((await api.requestJson('/community/posts') as List).single['title'],
        'New synthetic post');
    await expectLater(
        api.requestJson('/notifications/push-registration', method: 'POST'),
        throwsException);
  });
  test('synthetic messages use in-memory frames', () async {
    final repo = PreviewRepository(previewPersonas.first);
    final api = PreviewApiService(repo);
    addTearDown(api.dispose);
    final socket = await api.openChatConnection();
    final frames = <Map<String, dynamic>>[];
    final subscription = socket.frames.listen(frames.add);
    await Future<void>.delayed(Duration.zero);
    socket.send({'type': 'subscribe'});
    await api.requestJson(
        '/chat/conversations/${repo.conversation()['id']}/messages',
        method: 'POST',
        data: {'content': 'Local only'});
    await Future<void>.delayed(Duration.zero);
    expect(frames.first['type'], 'authenticated');
    expect(frames.last['messages'].last['content'], 'Local only');
    await subscription.cancel();
    await socket.close();
  });
  testWidgets(
      'synthetic inbox renders message, retains read state and opens sample notice',
      (tester) async {
    final api = PreviewApiService(PreviewRepository(previewPersonas.first));
    addTearDown(api.dispose);
    await tester.pumpWidget(
        MaterialApp(home: NotificationInboxScreen(apiService: api)));
    await tester.pumpAndSettle();
    final notice = find.text('Synthetic notification — offline only');
    expect(notice, findsOneWidget);
    await tester.tap(notice);
    await tester.pumpAndSettle();
    expect(find.text('Synthetic announcement'), findsWidgets);
    expect(api.repository.inbox.single['readAt'], isNotNull);
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.byTooltip('Mark unread'), findsOneWidget);
    await tester.tap(find.byTooltip('Mark unread'));
    await tester.pumpAndSettle();
    expect(api.repository.inbox.single['readAt'], isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });
  testWidgets(
      'entry opens dashboard, calendar, persona reset and exit without OTP',
      (tester) async {
    await tester.pumpWidget(const DevelopmentPreviewApp());
    await tester.pumpAndSettle();
    if (!devPreviewRequested) {
      expect(find.textContaining('Development preview is disabled'),
          findsOneWidget);
      return;
    }
    final entry = find.byKey(const Key('enter-development-preview'));
    await tester.ensureVisible(entry);
    await tester.tap(entry);
    await tester.pumpAndSettle();
    expect(
        find.text('OFFLINE SYNTHETIC PREVIEW · नमूना मात्र'), findsOneWidget);
    expect(find.textContaining('नमूना सदस्य'), findsWidgets);
    await tester.tap(find.byKey(const Key('preview-catalog')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Calendar').last);
    await tester.pumpAndSettle();
    expect(find.text('Synthetic family gathering'), findsOneWidget);
    await tester.tap(find.byKey(const Key('preview-switch-persona')));
    await tester.pumpAndSettle();
    expect(find.text('New / Unclaimed Member'), findsOneWidget);
    await tester.tap(find.byKey(const Key('preview-exit')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('enter-development-preview')), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
  });
  testWidgets(
      'catalog opens main synthetic screens without layout or contract exceptions',
      (tester) async {
    if (!devPreviewRequested) return;
    await tester.binding.setSurfaceSize(const Size(411, 731));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(const DevelopmentPreviewApp());
    await tester.pumpAndSettle();
    final entry = find.byKey(const Key('enter-development-preview'));
    await tester.ensureVisible(entry);
    await tester.tap(entry);
    await tester.pumpAndSettle();
    for (final name in [
      'Family tree',
      'Member profile',
      'Calendar',
      'Calendar month/day/agenda',
      'Community',
      'Messaging',
      'Notifications',
      'Official notices',
      'Account and settings',
      'Privacy form',
      'Claim form',
      'My claims',
      'Change proposal form',
      'My change requests',
      'Approved cultural content',
      'Administration / role inspection',
      'Locations and maps'
    ]) {
      await tester.tap(find.byKey(const Key('preview-catalog')));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(find.text(name), 220,
          scrollable: find.byType(Scrollable).last);
      final destination = find.text(name);
      await Scrollable.ensureVisible(tester.element(destination), alignment: 0.5);
      await tester.pumpAndSettle();
      expect(destination.hitTestable(), findsOneWidget, reason: name);
      await tester.tap(destination.hitTestable());
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull, reason: name);
      await tester.pageBack();
      await tester.pumpAndSettle();
      await tester.pageBack();
      await tester.pumpAndSettle();
    }
    await tester.pumpWidget(const SizedBox.shrink());
  });
}
