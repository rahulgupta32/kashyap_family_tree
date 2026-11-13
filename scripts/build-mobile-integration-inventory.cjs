'use strict';
// AST inventory of every Nest REST route; static candidates are not runtime proof.
const fs=require('fs'),path=require('path'),ts=require('../services/api/node_modules/typescript');
const root=path.resolve(__dirname,'..');
const files=(dir,ext)=>fs.readdirSync(path.join(root,dir),{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(`${dir}/${e.name}`,ext):e.name.endsWith(ext)?[`${dir}/${e.name}`]:[]);
const decorators=n=>(ts.canHaveDecorators(n)?ts.getDecorators(n)||[]:[]).map(d=>d.expression);
const decoName=d=>ts.isCallExpression(d)?d.expression.getText():d.getText();
const args=d=>ts.isCallExpression(d)?[...d.arguments]:[];
const literal=n=>!n?['']:ts.isStringLiteral(n)?[n.text]:ts.isArrayLiteralExpression(n)?n.elements.flatMap(literal):[n.getText()];
const clean=p=>('/'+p).replace(/\/+/g,'/').replace(/\/$/,'')||'/';
const line=(sf,n)=>sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1;
const dart=files('apps/mobile/lib','.dart').filter(file=>!file.includes('/dev_preview/')&&!file.endsWith('/main_dev_preview.dart')).map(file=>({file,text:fs.readFileSync(path.join(root,file),'utf8')}));
const tests=[...files('services/api/test','.ts'),...files('apps/mobile/test','.dart'),...files('apps/mobile/integration_test','.dart')].map(file=>({file,text:fs.readFileSync(path.join(root,file),'utf8')}));
const normalize=s=>s.replace(/\$\{[^}]*\}/g,':id').replace(/\$baseUrl/g,'').replace(/\$[\w]+/g,':id').split('?')[0].replace(/([A-Za-z-]):id$/,'$1').replace(/\/+/g,'/');
const segments=s=>normalize(s).split('/').filter(Boolean);
function matches(route,candidate){const a=segments(route),b=segments(candidate);return a.length===b.length&&a.every((x,i)=>x.startsWith(':')||b[i].startsWith(':')||x===b[i]);}
const calls=[];
for(const {file,text} of dart){
 let simplified=text.replace(/\$\{[^}]*\}/g,':id');
 const builders=[...simplified.matchAll(/String\s+get\s+(\w+)\s*=>\s*'([^']+)'/g)];
 for(const b of builders)simplified=simplified.replaceAll('$'+b[1],b[2]);
 const re=/(['"])((?:\$baseUrl)?\/[\w\/$:{}?=&.\-]*?)\1/g;let m;
 while((m=re.exec(simplified))){
  const before=simplified.slice(0,m.index);const method=[...before.matchAll(/(?:Future<[^\n]+>|Future|void|Widget)\s+(\w+)\s*\(/g)].at(-1)?.[1]||'build/request helper';
  calls.push({file,line:before.split('\n').length,path:normalize(m[2]),method});
 }
}
const config=ts.readConfigFile(path.join(root,'services/api/tsconfig.json'),ts.sys.readFile);
const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,path.join(root,'services/api'));
const program=ts.createProgram(parsed.fileNames,parsed.options);const checker=program.getTypeChecker();
const routes=[];
for(const file of files('services/api/src','.controller.ts')){
 const text=fs.readFileSync(path.join(root,file),'utf8');const sf=program.getSourceFile(path.join(root,file))||ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);
 for(const c of sf.statements.filter(ts.isClassDeclaration)){
  const ds=decorators(c);const controller=ds.find(d=>decoName(d)==='Controller');if(!controller)continue;
  const prefixes=literal(args(controller)[0]);
  const security=ds.filter(d=>/Guard|Roles|Mfa|Public|Auth/.test(decoName(d))).map(d=>d.getText(sf));
  for(const n of c.members.filter(ts.isMethodDeclaration)){
   const md=decorators(n);for(const d of md.filter(d=>/^(Get|Post|Put|Patch|Delete|Head|Options|All)$/.test(decoName(d)))){
    for(const prefix of prefixes)for(const suffix of literal(args(d)[0])){
     const route=clean(prefix+'/'+suffix),module=prefix.split('/')[0];
     const params=n.parameters.map(p=>({name:p.name.getText(sf),type:p.type?.getText(sf)||'inferred',binding:decorators(p).map(x=>x.getText(sf)).join(' ')}));
     const linked=calls.filter(x=>matches(route,x.path));
     const apiMethods=[...new Set(linked.filter(x=>x.file.endsWith('genealogy_api_service.dart')).map(x=>x.method))];
     const screens=[...new Set([...linked.filter(x=>x.file.includes('/screens/')).map(x=>x.file),...dart.filter(x=>x.file.includes('/screens/')&&apiMethods.some(m=>new RegExp('\\.'+m+'\\s*\\(').test(x.text))).map(x=>x.file)])];
     const base='/'+segments(route).filter(x=>!x.startsWith(':')).slice(0,2).join('/');
     const evidence=tests.filter(t=>t.text.includes(route)||t.text.includes(base)||t.text.includes(c.name.text)).map(t=>t.file);
     const adminOnly=/^(audit|genealogy-import|media-inventory|admin)/.test(prefix)||(/auth\/(otp\/verify|refresh)$/.test(route));
     const fixture=/\/auth\/test-|\/health/.test(route);
     const status=linked.length&&screens.length?'partial':'unverified';
     const serviceCalls=[];if(n.body){const visit=node=>{if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.expression.getText(sf).startsWith('this.'))serviceCalls.push(node.expression.getText(sf));ts.forEachChild(node,visit);};visit(n.body);}
     routes.push({verb:decoName(d).toUpperCase(),route,feature:`${c.name.text}.${n.name.getText(sf)}`,controller:`${file}:${line(sf,n)}`,request:params,response:(n.type?.getText(sf)||(checker.getSignatureFromDeclaration(n)?checker.typeToString(checker.getReturnTypeOfSignature(checker.getSignatureFromDeclaration(n)),n,ts.TypeFormatFlags.NoTruncation):'Inferred service response; no declared DTO')).replaceAll(root+'/',''),authorization:[...security,...md.filter(x=>/Guard|Roles|Mfa|Public|Auth/.test(decoName(x))).map(x=>x.getText(sf))].join('; ')||'No route decorator; inspect service/global policy (not an authorization conclusion)',serviceCalls:[...new Set(serviceCalls)],flutterApiMethods:apiMethods,flutterCandidates:linked.map(x=>`${x.file}:${x.line} ${x.method} -> ${x.path}`),screens,tests:evidence,status,scope:fixture?'test/system; not a member feature':adminOnly?'administration/browser or system surface; no automatic mobile parity requirement':'member/mobile candidate',requiredAction:fixture?'Keep isolated test/system gates; do not add OTP-reader UI':adminOnly?'Verify through authorized admin/system workflow; preserve MFA/branch/privacy checks':screens.length?'Run exact-contract PostgreSQL/Redis and native journey; static references/test discovery do not prove operation':'Review dynamic client helpers and native requirement; connect existing authorized route only if member-facing',runtimeEvidence:'Not established per endpoint by this static inventory; see audit findings and retained CI logs'});
    }
   }
  }
 }
}
for(const r of routes) {
 if (/^\/(admin|audit|media-operations)\b/.test(r.route) || /^\/auth\/roles\//.test(r.route) || /\/(tier[12]-review|correction-request|escalate|review|resolve|merge|archive)$/.test(r.route) && !r.route.startsWith('/calendar/') || /^\/genealogy\/(duplicates|export)/.test(r.route) || /^\/cultural\/(content\/documents|rule-proposals)/.test(r.route)) {
  r.scope='authorized administration; existing web portal rather than automatic member parity';
  r.requiredAction='Verify authorized web/API journey, MFA, branch and recusal policy; native administration is not automatically required';
 }
 if (/^\/me(?:\/|$)/.test(r.route)) {r.scope='compatibility alias; canonical profile/auth/preferences UI uses other existing routes';r.requiredAction='Retain compatibility tests; no duplicate mobile UI needed';}
 if (/^\/cultural\/(jutho|tithi|marriage|kinship)/.test(r.route)) {r.scope='authority-gated cultural capability';r.requiredAction='Preserve approval/unavailable responses; do not invent calculations or imply activation';}
 if (/^\/change-requests(?:\/:[^/]+)?$/.test(r.route) && r.verb==='GET' || /^\/change-requests\/:[^/]+\/resubmit$/.test(r.route)) {
  r.status=r.screens.length?'partial':'missing';r.scope='member lifecycle';r.requiredAction='Verify own proposal discovery/detail and supported edit correction; non-edit correction forms remain incomplete; retain requester/state guards';
 }
 if(r.route==='/auth/logout-all') {r.status='partial';r.requiredAction='Verify explicit global sign-out acknowledgement, session clearing and denial/race cases on real services';}
}
routes.sort((a,b)=>(a.route+a.verb).localeCompare(b.route+b.verb));
const folder=path.join(root,'docs/integration');fs.mkdirSync(folder,{recursive:true});
fs.writeFileSync(path.join(folder,'api-mobile-matrix.json'),JSON.stringify({scope:'All Nest REST route decorators, including aliases. Dynamic routing candidates require review. No runtime pass is inferred.',nonRest:[{path:'/chat/socket',controller:'services/api/src/modules/chat/chat.gateway.ts',request:'auth(token); subscribe(conversationId); typing; delivered(messageIds); read(sequence); ping',response:'authenticated; snapshot(conversationId,messages,typingUserIds); pong; authorization close codes',authorization:'JWT/session/member validation before subscribe and repeated access checks; browser origin policy; no query tokens',flutter:['apps/mobile/lib/services/chat_connection.dart','apps/mobile/lib/screens/chat_screen.dart'],status:'partial',tests:['services/api/test/chat-http.integration.spec.ts','apps/mobile/test/chat_screen_test.dart','apps/mobile/integration_test/m4_live_api_device_test.dart'],requiredAction:'Verify reconnect, revoked membership/session, receipts and real-device transport; static source is not delivery acceptance'}],dependencies:{migrations:files('database/migrations','.sql').filter(x=>!x.endsWith('.down.sql')),workers:files('services/api/src','.ts').filter(x=>/worker|dispatcher|delivery|scheduler|outbox/.test(x)),contracts:files('packages/contracts/src','.ts'),guards:files('services/api/src','.ts').filter(x=>/guard|policy/.test(x))},controllers:files('services/api/src','.controller.ts'),routes},null,2)+'\n');
const cell=x=>String(x??'').replace(/\|/g,'\\|').replace(/\n/g,' ');
const csvCell=x=>'"'+String(x??'').replace(/"/g,'""')+'"';
const rows=routes.map(r=>[`${r.verb} ${r.route}`,r.feature,r.controller,r.request.map(p=>`${p.binding} ${p.name}:${p.type}`).join('; '),r.response,r.authorization,r.flutterApiMethods.join('; ')||'requestJson/dynamic helper or no static match',r.screens.join('; ')||'No proven native entry',r.tests.join('; ')||'No static candidate',r.status,r.scope,r.requiredAction]);
const headers=['Endpoint','Feature','Controller','Request contract','Response contract','Authentication/authorization','Flutter API method','Flutter screen/interaction','Coverage candidates (not execution proof)','Status','Scope','Required action'];
fs.writeFileSync(path.join(folder,'api-mobile-matrix.csv'),[headers,...rows].map(r=>r.map(csvCell).join(',')).join('\n')+'\n');
fs.writeFileSync(path.join(folder,'API_MOBILE_MATRIX.md'),'# API → Flutter source inventory\n\nGenerated from all '+files('services/api/src','.controller.ts').length+' Nest controller files; '+routes.length+' method/path entries including aliases. **No row is marked working from source existence.** `partial` means a static client/screen candidate exists, not that its contract or behavior passed. `unverified` includes dynamic helpers and deliberate admin/system surfaces. Request `any`, inferred responses and service-level authorization remain explicit contract-review gaps.\n\nSee the CSV/JSON for all eight requested traceability dimensions, exact request types, decorators, service calls and candidate tests. Read [audit findings](AUDIT_FINDINGS.md) for reviewed calendar contracts, actual fixes, runtime evidence and incomplete work.\n\n| Endpoint | Feature / contract source | Flutter interaction candidates | Coverage candidates | Status / next action |\n|---|---|---|---|---|\n'+routes.map(r=>'| '+[`${r.verb} ${r.route}`,`${r.feature} (${r.controller})`,r.screens.join(', ')||r.scope,r.tests.map(x=>path.basename(x)).join(', ')||'None discovered',r.status+': '+r.requiredAction].map(cell).join(' | ')+' |').join('\n')+'\n');
console.log(JSON.stringify({controllers:files('services/api/src','.controller.ts').length,endpoints:routes.length,partial:routes.filter(r=>r.status==='partial').length,unverified:routes.filter(r=>r.status==='unverified').length,missing:routes.filter(r=>r.status==='missing').length,working:0}));
