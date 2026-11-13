#!/usr/bin/env python3
"""Conservative source-derived tracker; never grants runtime acceptance."""
import csv,json,re,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[1]
inventory=json.loads((root/'docs/integration/api-mobile-matrix.json').read_text())
fields=['Module','Feature','Backend','Frontend','Database','Authorization','Testing','Status','Priority','Evidence','Next action']
rows=[]
for route in inventory['routes']:
 controller=root/route['controller'].split(':')[0]
 source='\n'.join(p.read_text() for p in controller.parent.glob('*.ts'))
 tables=sorted(set(re.findall(r'\b(?:FROM|INTO|UPDATE|JOIN)\s+([a-z_][a-z_0-9]+)',source,re.I)))
 tables=[t for t in tables if t.lower() not in {'set','select','the','this'}]
 module=controller.parent.name
 fixture='test/system' in route['scope']
 rows.append(dict(zip(fields,[module,route['feature'].split('.')[-1],route['verb']+' '+route['route']+'; '+route['controller'], '; '.join(route['screens']) or route['scope'], 'Source table candidates (not workflow proof): '+', '.join(tables),route['authorization']+'; service-level policy review required','; '.join(route['tests']) or 'No discovered dedicated test','Partial','P2' if fixture else 'P1',route['runtimeEvidence'],route['requiredAction']])))
rows.extend([dict(zip(fields,['development','Offline synthetic UI inspection','No backend; PreviewRepository','main_dev_preview.dart; existing screens','Memory only; reset on persona change/restart','Debug + explicit flag; no credentials; no network delegate','dev_preview_test.dart; test_preview_build.py','Partial','P0','Local preview navigation/transport/reset tests passed; native APK pending','Inspect source-bound preview APK artifact and native runtime screenshots'])),dict(zip(fields,['development','Full-stack persona testing','Existing OTP/session/role guards; no new bypass endpoint','Normal authenticated application','Isolated PostgreSQL/Redis required','Real authenticated seeded personas; existing MFA and branch policies','Existing live API/emulator workflows','Blocked','P0','No physical device or approved persistent staging supplied','Provision isolated local test stack and five synthetic personas; retain real auth evidence']))])
out=root/'docs/integration/FEATURE_TRACKER.csv'
with out.open('w',newline='') as f:
 w=csv.DictWriter(f,fieldnames=fields);w.writeheader();w.writerows(rows)
print(len(rows),'conservative source capability rows; zero complete claims')
