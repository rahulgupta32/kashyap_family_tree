import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';
import 'package:kashyap_mobile/models/person.dart';
import 'package:kashyap_mobile/screens/home_dashboard.dart';
import 'package:kashyap_mobile/screens/person_search_screen.dart';
import 'package:kashyap_mobile/screens/sign_in_screen.dart';
import 'package:kashyap_mobile/services/genealogy_api_service.dart';
import 'package:kashyap_mobile/theme/app_theme.dart';
import 'package:kashyap_mobile/widgets/heritage.dart';
import 'native_session_test.dart' show jsonResponse;
import 'tree_navigation_test.dart' show TreeApi;
import 'package:kashyap_mobile/screens/read_only_tree_screen.dart';

const snapshots = String.fromEnvironment('UI_SNAPSHOT_DIR');
Future<void> capture(WidgetTester tester, String name) async {
  if (snapshots.isEmpty) return;
  await tester.pumpAndSettle();
  final boundary = tester.renderObject<RenderRepaintBoundary>(find.byKey(const Key('capture')));
  await tester.runAsync(() async {
    final image = await boundary.toImage(pixelRatio: 2);
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    await Directory(snapshots).create(recursive: true);
    await File('$snapshots/$name.png').writeAsBytes(bytes!.buffer.asUint8List());
    image.dispose();
  });
}
Widget shell(Widget screen) => RepaintBoundary(key: const Key('capture'), child: MaterialApp(debugShowCheckedModeBanner: false, theme: AppTheme.theme, home: screen));

void main() {
  setUpAll(() async {
    await (FontLoader('MaterialIcons')..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'))).load();
    for (final family in ['Inter', 'PlayfairDisplay', 'NotoSansDevanagari']) {
      await (FontLoader(family)..addFont(rootBundle.load('assets/fonts/$family.ttf'))).load();
    }
  });
  testWidgets('heritage sign-in fits narrow screens and enlarged text', (tester) async {
    final api = GenealogyApiService(client: MockClient((_) async => jsonResponse({})));
    addTearDown(api.dispose);
    await tester.binding.setSurfaceSize(const Size(390, 844));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(shell(SignInScreen(apiService: api, onSignedIn: () {}, onBrowsePublic: () {})));
    await tester.runAsync(() async {
      await precacheImage(const AssetImage('assets/heritage/tree.png'), tester.element(find.byType(SignInScreen)));
    });
    await tester.pumpAndSettle();
    await capture(tester, 'sign-in');
    expect(tester.takeException(), isNull);
    await tester.tap(find.byKey(const Key('sign-in-email-method')));
    await tester.pumpAndSettle();
    await capture(tester, 'email-login');
    await tester.binding.setSurfaceSize(const Size(320, 568));
    await tester.pumpWidget(shell(MediaQuery(data: const MediaQueryData(textScaler: TextScaler.linear(2)),
      child: SignInScreen(apiService: api, onSignedIn: () {}, onBrowsePublic: () {}))));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const Key('sign-in-submit')));
    expect(find.byKey(const Key('sign-in-submit')).hitTestable(), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
  testWidgets('dashboard uses API records and bottom navigation opens governed destinations', (tester) async {
    final paths = <String>[];
    final api = GenealogyApiService(client: MockClient((request) async {
      paths.add(request.url.path);
      return switch (request.url.path) {
        '/genealogy/search' => jsonResponse({'items': [
          {'id':'synthetic-1','primaryNameNepali':'परीक्षण सदस्य','primaryNameEnglish':'Synthetic member','gender':'OTHER','livingStatus':'LIVING','generation':3},
          {'id':'synthetic-2','primaryNameNepali':'परीक्षण परिवार','primaryNameEnglish':'Synthetic relative','gender':'OTHER','livingStatus':'LIVING','generation':2}
        ], 'total': 2, 'page': 1, 'limit': 20}),
        '/profile/me' => jsonResponse({'personId': null, 'person': {'primaryNameEnglish': 'Synthetic member'}}),
        '/calendar/events' => jsonResponse([{'id':'event','title':'Synthetic family gathering','startsAt':'2026-11-15T09:00:00Z','lifecycleState':'ACTIVE'}]),
        '/notifications/broadcasts' => jsonResponse([{'id':'notice','title':'Synthetic community notice'}]),
        '/community/posts' => jsonResponse([]),
        _ => jsonResponse({}),
      };
    }))..setAuthToken('synthetic-ui-test');
    addTearDown(api.dispose);
    await tester.binding.setSurfaceSize(const Size(390, 844));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(shell(PersonSearchScreen(apiService: api)));
    await tester.pumpAndSettle();
    await capture(tester, 'dashboard');
    expect(find.textContaining('Synthetic member'), findsOneWidget);
    expect(paths.where((p) => p == '/profile/me'), hasLength(1));
    await tester.tap(find.descendant(of: find.byType(HeritageNavigation), matching: find.text('Calendar')));
    await tester.pumpAndSettle();
    await capture(tester, 'calendar');
    await tester.tap(find.descendant(of: find.byType(HeritageNavigation), matching: find.text('Profile')));
    await tester.pumpAndSettle();
    await capture(tester, 'profile');
    await tester.tap(find.descendant(of: find.byType(HeritageNavigation), matching: find.text('Tree')));
    await tester.pumpAndSettle();
    expect(find.text('Explore your family tree'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
  testWidgets('dashboard rejects late private data after session replacement', (tester) async {
    final pending = Completer<Map<String, dynamic>>();
    final api = _PendingProfileApi(pending.future)..setAuthToken('member-a');
    addTearDown(api.dispose);
    await tester.pumpWidget(shell(SingleChildScrollView(child: HomeDashboard(api: api, directory: const <PersonSummary>[],
      onPerson: (_) {}, onTree: (_) {}, onCalendar: () {}, onNotices: () {}, onCulture: () {}, onProfile: () {}, onMessages: () {}))));
    await tester.pump();
    api.setAuthToken('member-b');
    pending.complete({'personId': null, 'person': {'primaryNameEnglish': 'Private A'}});
    await tester.pumpAndSettle();
    expect(find.textContaining('Private A'), findsNothing);
    expect(tester.takeException(), isNull);
  });
  testWidgets('tree controls render on the heritage canvas', (tester) async {
    final api = TreeApi();
    addTearDown(api.dispose);
    await tester.binding.setSurfaceSize(const Size(390, 844));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(shell(ReadOnlyTreeScreen(rootPersonId: 'root', apiService: api)));
    await tester.pumpAndSettle();
    await capture(tester, 'tree');
    await tester.tap(find.byTooltip('Zoom out'));
    await tester.pump();
    expect(tester.takeException(), isNull);
  });
}
class _PendingProfileApi extends GenealogyApiService {
  final Future<Map<String, dynamic>> profile;
  _PendingProfileApi(this.profile) : super(client: MockClient((_) async => jsonResponse([])));
  @override
  Future<Map<String, dynamic>> getMyProfile() => profile;
}
