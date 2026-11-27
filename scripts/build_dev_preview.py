#!/usr/bin/env python3
"""Build an offline debug APK and retain source/identity/hash evidence."""
import base64, hashlib, json, os, re, shutil, subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[1]
mobile=root/'apps/mobile'
out=root/'test-results/dev-preview'
out.mkdir(parents=True,exist_ok=True)
env={**os.environ,'KASHYAP_DEV_PREVIEW':'true'}
command=['flutter','build','apk','--debug','--target=lib/main_dev_preview.dart','--dart-define=ENABLE_DEV_PREVIEW=true']
subprocess.run(command,cwd=mobile,env=env,check=True)
apk=out/'nepali-bansawali-offline-preview.apk'
shutil.copy2(mobile/'build/app/outputs/flutter-apk/app-debug.apk',apk)
sdk=Path(os.environ.get('ANDROID_HOME') or os.environ['ANDROID_SDK_ROOT'])
tools=sorted((sdk/'build-tools').glob('*/aapt'),key=lambda p:tuple(int(x) for x in p.parent.name.split('.') if x.isdigit()))
assert tools
badging=subprocess.check_output([str(tools[-1]),'dump','badging',str(apk)],text=True)
assert "name='com.example.kashyap_mobile.devpreview'" in badging
assert "application-label:'Nepali Bansawali — Offline Preview'" in badging
assert 'application-debuggable' in badging
signature=subprocess.check_output([str(tools[-1].with_name('apksigner')),'verify','--print-certs',str(apk)],text=True)
from android_signing import verified_certificate_digests
cert=verified_certificate_digests(signature)
assert len(cert)==1
# Exercise the real Android build guard, including unexpected production-entry flags.
negative=[]
for task,target,defines in [(':app:preReleaseBuild','lib/main.dart','ENABLE_DEV_PREVIEW=true'),(':app:preReleaseBuild','lib/main_dev_preview.dart',''),(':app:preProfileBuild','lib/main.dart','ENABLE_DEV_PREVIEW=true')]:
 args=['./gradlew',task,'-Ptarget='+target,'-Pdart-defines='+base64.b64encode(defines.encode()).decode(),'--console=plain']
 attempt=subprocess.run(args,cwd=mobile/'android',text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,env={**os.environ,'KASHYAP_DEV_PREVIEW':'false'})
 (out/f'guard-{len(negative)}.log').write_text(attempt.stdout)
 assert attempt.returncode!=0 and 'Development preview is debug-only' in attempt.stdout, 'Native preview guard did not reject before release signing'
 negative.append({'task':task,'target':target,'defines':defines,'rejected':True})
evidence={'sourceCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'sourceTree':subprocess.check_output(['git','rev-parse','HEAD^{tree}'],cwd=root,text=True).strip(),'filename':apk.name,'sha256':hashlib.sha256(apk.read_bytes()).hexdigest(),'applicationId':'com.example.kashyap_mobile.devpreview','buildCommand':command,'buildEnvironment':{'KASHYAP_DEV_PREVIEW':'true'},'signing':'Android debug; offline inspection only','certificateSha256':cert[0],'offlineSyntheticData':True,'networkTransport':'In-memory HTTP and chat fixtures; no network delegate or server credentials','releaseGuardChecks':negative,'physicalDeviceVerified':False,'backendPersistenceVerified':False,'productionAcceptance':False}
(out/'evidence.json').write_text(json.dumps(evidence,indent=2)+'\n')
print('Offline preview APK SHA256:',evidence['sha256'])
