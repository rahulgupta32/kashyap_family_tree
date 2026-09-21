import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kashyap_mobile/screens/household_map_screen.dart';
import 'package:kashyap_mobile/services/genealogy_api_service.dart';
import 'native_session_test.dart' show MemorySessionStore;
void main(){
 testWidgets('Mocked map HTTP flow withdraws consent and reloads generalized locations',(tester)async{
  var consent=true;final calls=<String>[];
  final api=GenealogyApiService(sessionStore:MemorySessionStore(),client:MockClient((r)async{
   calls.add('${r.method} ${r.url.path}');expect(r.url.queryParameters.containsKey('isVerified'),isFalse);expect(r.headers['Authorization'],'Bearer map-session');
   if(r.method=='DELETE'){consent=false;return http.Response('{"success":true}',200);}
   if(r.url.path=='/map/mine')return http.Response(jsonEncode({'id':'hh','title':'Fictional locality','status':consent?'APPROVED':'WITHDRAWN','map_consent':consent}),200);
   return http.Response(jsonEncode({'success':true,'data':consent?[{'id':'hh','title':'Fictional locality','district':'Kaski','municipality':'Pokhara','approxLatitude':28.2,'approxLongitude':84.0}]:[]}),200);
  }));api.setAuthToken('map-session');addTearDown(api.dispose);
  await tester.pumpWidget(MaterialApp(home:HouseholdMapScreen(apiService:api)));await tester.pumpAndSettle();expect(find.text('Fictional locality'),findsOneWidget);
  await tester.ensureVisible(find.text('Withdraw map consent'));await tester.tap(find.text('Withdraw map consent'));await tester.pumpAndSettle();
  expect(calls,contains('DELETE /map/mine'));expect(find.text('Fictional locality'),findsNothing);expect(find.text('Review status: WITHDRAWN'),findsOneWidget);
 });
}
