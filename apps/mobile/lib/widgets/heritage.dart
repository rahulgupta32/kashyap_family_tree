import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

class HeritageHeading extends StatelessWidget {
  final String title;
  final String? subtitle;
  final IconData? icon;
  final Widget? action;
  const HeritageHeading(this.title,
      {super.key, this.subtitle, this.icon, this.action});
  @override
  Widget build(BuildContext context) => Padding(
      padding: const EdgeInsets.only(top: 20, bottom: 12),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        if (icon != null)
          Padding(
              padding: const EdgeInsets.only(right: 8, top: 3),
              child: Icon(icon, size: 19, color: AppTheme.saffron)),
        Expanded(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(title, style: Theme.of(context).textTheme.titleMedium),
          if (subtitle != null)
            Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(subtitle!,
                    style: Theme.of(context).textTheme.bodySmall)),
        ])),
        if (action != null) action!,
      ]));
}

class HeritageAvatar extends StatelessWidget {
  final String name;
  final double size;
  final bool deceased;
  const HeritageAvatar(
      {super.key, required this.name, this.size = 52, this.deceased = false});
  @override
  Widget build(BuildContext context) => Semantics(
      label: name,
      child: Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
              color:
                  deceased ? const Color(0xFFEEEDEF) : const Color(0xFFF4E8D8),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: AppTheme.outline)),
          child: Icon(
              deceased ? Icons.person_outline : Icons.person_outline_rounded,
              color: deceased ? AppTheme.deceasedSlate : AppTheme.heritageBrown,
              size: size * .52)));
}

class HeritageEmpty extends StatelessWidget {
  final IconData icon;
  final String message;
  final Widget? action;
  const HeritageEmpty(
      {super.key, required this.icon, required this.message, this.action});
  @override
  Widget build(BuildContext context) => Card(
      child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(children: [
            Icon(icon, size: 32, color: AppTheme.textMuted),
            const SizedBox(height: 12),
            Text(message,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodySmall),
            if (action != null) action!
          ])));
}

/// Fine lines echo the paper/mandala motifs in the supplied design.
class HeritagePaper extends StatelessWidget {
  final Widget child;
  const HeritagePaper({super.key, required this.child});
  @override
  Widget build(BuildContext context) =>
      CustomPaint(painter: _PaperLines(), child: child);
}

class _PaperLines extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = AppTheme.heritageBrown.withValues(alpha: .035)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1;
    final center = Offset(size.width * .88, size.height * .28);
    for (var radius = 45.0; radius < size.longestSide; radius += 35) {
      canvas.drawCircle(center, radius, paint);
    }
  }

  @override
  bool shouldRepaint(_PaperLines oldDelegate) => false;
}

class HeritageNavigation extends StatelessWidget {
  final int selected;
  final ValueChanged<int> onSelect;
  const HeritageNavigation(
      {super.key, required this.selected, required this.onSelect});
  @override
  Widget build(BuildContext context) => DecoratedBox(
      decoration: const BoxDecoration(
          border: Border(top: BorderSide(color: AppTheme.outline))),
      child: NavigationBar(
          selectedIndex: selected,
          onDestinationSelected: onSelect,
          destinations: const [
            NavigationDestination(
                icon: Icon(Icons.home_outlined),
                selectedIcon: Icon(Icons.home),
                label: 'Home'),
            NavigationDestination(
                icon: Icon(Icons.account_tree_outlined), label: 'Tree'),
            NavigationDestination(
                icon: Icon(Icons.calendar_month_outlined), label: 'Calendar'),
            NavigationDestination(
                icon: Icon(Icons.groups_outlined), label: 'Community'),
            NavigationDestination(
                icon: Icon(Icons.person_outline), label: 'Profile'),
          ]));
}
