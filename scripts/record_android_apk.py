#!/usr/bin/env python3
"""Record the actual ordinary emulator APK; no staging/distribution acceptance."""
import hashlib,json,os,re,subprocess
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
cert=re.findall(r'^Signer #\d+ certificate SHA-256 digest: ([a-fA-F0-9]{64})$',signature,re.M)
assert package and package[1]=='com.example.kashyap_mobile' and label and label[1]=='Nepali Bansawali'
assert minimum and len(cert)==1 and 'application-debuggable' in badging
info={'sourceCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),
 'sourceTree':subprocess.check_output(['git','rev-parse','HEAD^{tree}'],cwd=root,text=True).strip(),
 'filename':apk.name,'sha256':hashlib.sha256(apk.read_bytes()).hexdigest(),'applicationId':package[1],
 'version':package[3],'versionCode':package[2],'minimumAndroidApi':int(minimum[1]),'displayName':label[1],
 'apiOrigin':defines['API_BASE_URL'],'buildCommand':'flutter build apk --debug --dart-define-from-file=test-results/m4-device-defines.json',
 'signingType':'Android debug / emulator evaluation','certificateSha256':cert[0].lower(),
 'persistentBackend':False,'physicalDeviceVerified':False,'productionAcceptance':False,
 'requires':'Synthetic backend on emulator host port3010; hosted CI services end after the job'}
(root/'test-results/android-apk-evidence.json').write_text(json.dumps(info,indent=2)+'\n')
print('Verified APK metadata and SHA256:',info['sha256'])
