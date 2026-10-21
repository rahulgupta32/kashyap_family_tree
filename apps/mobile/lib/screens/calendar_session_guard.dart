import 'package:flutter/material.dart';
import '../services/genealogy_api_service.dart';

const calendarSessionChanged =
    'सत्र बदलियो। पात्रो फेरि खोल्नुहोस् (Session changed; reopen the calendar)';

/// A route belongs to the session which opened it. Access-token rotation does
/// not change that session; replacement sign-in, restore and logout do.
mixin CalendarSessionGuard<T extends StatefulWidget> on State<T> {
  GenealogyApiService get calendarApi;
  void clearCalendarSession();

  late final GenealogyApiService _calendarSessionApi;
  late final int _calendarGeneration;
  bool _calendarExpired = false;

  bool get calendarSessionCurrent => !_calendarExpired &&
      identical(calendarApi, _calendarSessionApi) &&
      calendarApi.authToken != null &&
      calendarApi.pushSessionGeneration == _calendarGeneration;

  @override
  void initState() {
    super.initState();
    _calendarSessionApi = calendarApi;
    _calendarGeneration = calendarApi.pushSessionGeneration;
    _calendarSessionApi.sessionChanges.addListener(_sessionChanged);
  }

  void _sessionChanged() {
    if (!calendarSessionCurrent) checkCalendarSession();
  }

  bool checkCalendarSession() {
    if (!mounted) return false;
    if (calendarSessionCurrent) return true;
    if (!_calendarExpired) {
      _calendarExpired = true;
      setState(clearCalendarSession);
    }
    return false;
  }

  @override
  void didUpdateWidget(covariant T oldWidget) {
    super.didUpdateWidget(oldWidget);
    checkCalendarSession();
  }

  @override
  void dispose() {
    _calendarSessionApi.sessionChanges.removeListener(_sessionChanged);
    super.dispose();
  }
}
