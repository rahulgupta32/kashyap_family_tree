#!/usr/bin/env python3
"""Record the actual ordinary emulator APK; no staging/distribution acceptance."""
from android_signing import verified_certificate_digests
import hashlib,json,os,re,subprocess,sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]
apk=root/'test-results/nepali-bansawali-debug.apk'
defines=json.loads((root/'test-results/m4-device-defines.json').read_text())
assert defines['API_BASE_URL']=='http://10.0.2.2:3010'
sdk=Path(os.environ.get('ANDROID_HOME') or os.environ['ANDROID_SDK_ROOT'])
tools=sorted((sdk/'build-tools').glob('*/apksigner'),key=lambda p:tuple(int(x) for x in p.parent.name.split('.') if x.isdigit()))
assert tools,'Android signature tools required'
signature=subprocess.check_output([str(tools[-1]),'verify','--print-certs',str(apk)],text=True)
badging=subprocess.check_output([str(tools[-1].with_name('aapt')),'dump','badging',str(apk)],text=True)
package=re.search(r"^package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'",badging,re.M)
minimum=re.search(r"^sdkVersion:'(\d+)'",badging,re.M)
label=re.search(r"^application-label:'([^']+)'",badging,re.M)
cert=verified_certificate_digests(signature)
assert package and package[1]=='com.example.kashyap_mobile' and label and label[1]=='Nepali Bansawali'
assert minimum, 'Missing minimum SDK in aapt badging: '+badging
assert len(cert)==1, 'Expected one certificate digest: '+signature
assert 'application-debuggable' in badging, 'Expected debuggable emulator APK: '+badging
info={'sourceCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),
 'sourceTree':subprocess.check_output(['git','rev-parse','HEAD^{tree}'],cwd=root,text=True).strip(),
 'filename':apk.name,'sha256':hashlib.sha256(apk.read_bytes()).hexdigest(),'applicationId':package[1],
 'version':package[3],'versionCode':package[2],'minimumAndroidApi':int(minimum[1]),'displayName':label[1],
 'apiOrigin':defines['API_BASE_URL'],'buildWorkingDirectory':'apps/mobile','buildCommand':'flutter build apk --debug --dart-define-from-file=../../test-results/m4-device-defines.json',
 'signingType':'Android debug / emulator evaluation','certificateSha256':cert[0].lower(),
 'persistentBackend':False,'physicalDeviceVerified':False,'productionAcceptance':False,
 'requires':'Synthetic backend on emulator host port3010; hosted CI services end after the job'}
if '--calendar-verified' in sys.argv:
 log=(root/'test-results/android-calendar-integration.log').read_text()
 assert '[CALENDAR DEVICE] Real UI AD/BS month/create/detail/update/RSVP/cancel/history and unauthorized mutation/history verified' in log and 'All tests passed!' in log
 assert os.environ.get('USE_REAL_POSTGRES')=='true' and os.environ.get('DB_NAME','').startswith('kashyap_test_')
 verified={('GET','/calendar/events'),('POST','/calendar/events'),('GET','/calendar/events/:id'),('PATCH','/calendar/events/:id'),('GET','/calendar/events/:id/history'),('POST','/calendar/events/:id/rsvp'),('POST','/calendar/events/:id/cancel'),('GET','/calendar/period')}
 routes=json.loads((root/'docs/integration/api-mobile-matrix.json').read_text())['routes']
 overlay={'sourceCommit':info['sourceCommit'],'sourceTree':info['sourceTree'],'scope':'One synthetic Android emulator UI journey using actual NestJS/PostgreSQL/Redis; not signed/full requirement acceptance',
  'evidence':'android-calendar-integration.log','logSha256':hashlib.sha256(log.encode()).hexdigest(),
  'routes':[{'verb':r['verb'],'route':r['route'],'status':'working','scope':'Bounded lifecycle/month/denial assertions in calendar_live_api_test.dart'} for r in routes if (r['verb'],r['route']) in verified],
  'realEmailDeliveryVerified':False,'physicalDeviceVerified':False,'productionAcceptance':False}
 assert len(overlay['routes'])==8
 (root/'test-results/android-calendar-traceability.json').write_text(json.dumps(overlay,indent=2)+'\n')
 info['emulatorCalendarVerified']=True
(root/'test-results/android-apk-evidence.json').write_text(json.dumps(info,indent=2)+'\n')
print('Verified APK metadata and SHA256:',info['sha256'])
