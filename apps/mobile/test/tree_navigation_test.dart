import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';
import 'package:kashyap_mobile/models/person.dart';
import 'package:kashyap_mobile/models/tree_node.dart';
import 'package:kashyap_mobile/screens/read_only_tree_screen.dart';
import 'package:kashyap_mobile/services/genealogy_api_service.dart';

TreeNode node(String id, {List<TreeNode> ancestors = const [], List<TreeNode> children = const [],
  List<TreeNode> spouses = const [], bool moreAncestors = false, bool moreDescendants = false}) => TreeNode(
    id: id, nameNepali: id, gender: Gender.other, livingStatus: LivingStatus.living,
    ancestors: ancestors, children: children, spouses: spouses,
    hasMoreAncestors: moreAncestors, hasMoreDescendants: moreDescendants,
  );

class TreeApi extends GenealogyApiService {
  TreeApi() : super(client: MockClient((request) async => throw StateError('Unexpected test HTTP: ${request.url}')));
  final calls = <({String id, int ancestors, int descendants})>[];
  final details = <String>[];
  Future<TreeNode> Function(String id)? response;
  @override
  Future<TreeNode> getTree(String id, {int ancestors = 2, int descendants = 2}) async {
    calls.add((id: id, ancestors: ancestors, descendants: descendants));
    if (response != null) return response!(id);
    if (id == 'parent') return node('parent', children: [node('root'), node('sibling')]);
    if (id == 'grandparent') return node('grandparent', ancestors: [node('great-grandparent')]);
    return node(id, ancestors: [node('parent', ancestors: [node('grandparent', moreAncestors: true)])],
      children: [node('child', children: [node('grandchild', moreDescendants: true)])], spouses: [node('spouse')]);
  }
  @override
  Future<PersonDetail> getPerson(String id) async {
    details.add(id);
    return PersonDetail(id: id, primaryNameNepali: id, gender: Gender.other, livingStatus: LivingStatus.living);
  }
}

Widget screen(TreeApi api, {String root = 'root', double scale = 1}) => MaterialApp(home: MediaQuery(
  data: MediaQueryData(textScaler: TextScaler.linear(scale)),
  child: ReadOnlyTreeScreen(rootPersonId: root, apiService: api),
));

Future<void> listView(WidgetTester tester) async {
  await tester.tap(find.byTooltip('सूची दृश्य (List view)'));
  await tester.pumpAndSettle();
}

Future<void> tapNode(WidgetTester tester, String key) async {
  final control = find.byKey(ValueKey(key));
  await tester.scrollUntilVisible(control, 180,
    scrollable: find.descendant(of: find.byType(ListView), matching: find.byType(Scrollable)).first);
  // ensureVisible can jump the scroll position without laying out the next
  // frame. Complete that layout before deriving the control's tap position.
  await tester.pumpAndSettle();
  expect(control.hitTestable(), findsOneWidget);
  await tester.tap(control);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('nested grandparents render, bounded refocus reaches siblings, history and profile remain usable', (tester) async {
    final api = TreeApi();
    await tester.pumpWidget(screen(api));
    await tester.pumpAndSettle();
    expect(find.text('grandparent'), findsOneWidget);
    expect(find.text('grandchild'), findsOneWidget);
    expect(find.text('spouse'), findsOneWidget);
    expect(api.calls, [(id: 'root', ancestors: 2, descendants: 2)]);
    await listView(tester);
    await tapNode(tester, 'tree-focus-parent');
    expect(find.text('sibling'), findsOneWidget);
    expect(api.calls.last, (id: 'parent', ancestors: 2, descendants: 2));
    await tapNode(tester, 'tree-detail-sibling');
    expect(api.details, ['sibling']);
    await tester.pageBack();
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('अघिल्लो केन्द्र (Previous focus)'));
    await tester.pumpAndSettle();
    expect(api.calls.last.id, 'root');
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('more ancestors requests only the selected bounded context and list supports scaled text', (tester) async {
    final api = TreeApi();
    await tester.pumpWidget(screen(api, scale: 2));
    await tester.pumpAndSettle();
    await listView(tester);
    await tapNode(tester, 'tree-ancestors-grandparent');
    await tester.scrollUntilVisible(find.text('great-grandparent'), 180,
      scrollable: find.descendant(of: find.byType(ListView), matching: find.byType(Scrollable)).first);
    expect(find.text('great-grandparent'), findsOneWidget);
    expect(api.calls.length, 2);
    expect(api.calls.last, (id: 'grandparent', ancestors: 2, descendants: 2));
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('short viewport keeps scaled-text guidance and list navigation scrollable', (tester) async {
    await tester.binding.setSurfaceSize(const Size(360, 240));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final api = TreeApi();
    await tester.pumpWidget(screen(api, scale: 2));
    await tester.pumpAndSettle();
    await listView(tester);
    await tapNode(tester, 'tree-focus-parent');
    expect(api.calls.last.id, 'parent');
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('failed bounded expansion clears prior content, supports retry and previous focus', (tester) async {
    final api = TreeApi();
    await tester.pumpWidget(screen(api));
    await tester.pumpAndSettle();
    await listView(tester);
    var failing = true;
    api.response = (id) async {
      if (failing) throw StateError('private source detail must not be shown');
      return node(id, children: [node('fresh-child')]);
    };
    await tapNode(tester, 'tree-descendants-grandchild');
    expect(find.text('root'), findsNothing);
    expect(find.textContaining('private source detail'), findsNothing);
    expect(api.calls.last.id, 'grandchild');
    failing = false;
    await tester.tap(find.text('फेरि प्रयास (Retry)'));
    await tester.pumpAndSettle();
    expect(find.text('fresh-child'), findsOneWidget);
    await tester.tap(find.byTooltip('अघिल्लो केन्द्र (Previous focus)'));
    await tester.pumpAndSettle();
    expect(api.calls.last.id, 'root');
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('replacement root discards late responses and dispose does not update state', (tester) async {
    final api = TreeApi();
    final pending = Completer<TreeNode>();
    api.response = (id) => id == 'old' ? pending.future : Future.value(node(id));
    await tester.pumpWidget(screen(api, root: 'old'));
    await tester.pumpWidget(screen(api, root: 'new'));
    await tester.pumpAndSettle();
    pending.complete(node('old-private-content'));
    await tester.pumpAndSettle();
    expect(find.text('new'), findsOneWidget);
    expect(find.text('old-private-content'), findsNothing);
    final disposed = Completer<TreeNode>();
    api.response = (_) => disposed.future;
    await tester.pumpWidget(screen(api, root: 'disposed'));
    await tester.pumpWidget(const SizedBox());
    disposed.complete(node('disposed'));
    await tester.pump();
    expect(tester.takeException(), isNull);
  });

  testWidgets('session replacement discards pending results and clears already displayed private context', (tester) async {
    final api = TreeApi();
    final pending = Completer<TreeNode>();
    api.response = (_) => pending.future;
    await tester.pumpWidget(screen(api));
    api.setAuthToken('replacement');
    pending.complete(node('private-before-switch'));
    await tester.pumpAndSettle();
    expect(find.text('private-before-switch'), findsNothing);
    expect(find.textContaining('Session changed'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    api.response = (_) async => node('private-loaded');
    await tester.pumpWidget(screen(api));
    await tester.pumpAndSettle();
    expect(find.text('private-loaded'), findsOneWidget);
    api.setAuthToken(null);
    await tester.pump(const Duration(milliseconds: 600));
    expect(find.text('private-loaded'), findsNothing);
    expect(find.textContaining('Session changed'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });
}
