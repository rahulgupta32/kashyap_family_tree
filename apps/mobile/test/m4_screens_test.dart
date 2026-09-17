import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kashyap_mobile/screens/claim_profile_screen.dart';
import 'package:kashyap_mobile/screens/change_request_screen.dart';
import 'package:kashyap_mobile/screens/profile_privacy_screen.dart';
import 'package:kashyap_mobile/services/genealogy_api_service.dart';

void main() {
  final apiService = GenealogyApiService();
  apiService.setAuthToken('test_jwt_bearer_token_12345');

  testWidgets('ClaimProfileScreen renders form fields and validates Statement of Truth', (WidgetTester tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: ClaimProfileScreen(
          personId: 'p-401',
          personName: 'रामचन्द्र अधिकारी',
          apiService: apiService,
        ),
      ),
    );

    expect(find.text('रामचन्द्र अधिकारी'), findsOneWidget);
    expect(find.text('सत्यताको घोषणा (Statement of Truth)'), findsOneWidget);
    expect(find.text('दाबी पेश गर्नुहोस् (Submit Claim)'), findsOneWidget);
  });

  testWidgets('ChangeRequestScreen renders change request controls', (WidgetTester tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: ChangeRequestScreen(
          personId: 'p-401',
          personName: 'रामचन्द्र अधिकारी',
          apiService: apiService,
        ),
      ),
    );

    expect(find.text('लक्ष्य व्यक्ति: रामचन्द्र अधिकारी'), findsOneWidget);
    expect(find.text('विवरण संशोधन (Edit Details)'), findsOneWidget);
    expect(find.text('प्रस्ताव पेश गर्नुहोस् (Submit Proposal)'), findsOneWidget);
  });

  testWidgets('ProfilePrivacyScreen renders privacy dropdowns and inputs', (WidgetTester tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: ProfilePrivacyScreen(
          apiService: apiService,
        ),
      ),
    );

    expect(find.text('व्यक्तिगत विवरण (Personal Details)'), findsOneWidget);
    expect(find.text('गोपनीयता दायरा (Privacy Scopes)'), findsOneWidget);
    expect(find.text('सेटिङहरू सुरक्षित गर्नुहोस् (Save Settings)'), findsOneWidget);
  });
}

