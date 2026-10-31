"""Render/validate the additive production matrix; never amend frozen acceptance.

Default is read-only validation. --generate renders from the reviewed context JSON
and exact controlled documents. Only the standard library is required.
"""
import argparse
import csv
import hashlib
import io
import json
import re
import xml.etree.ElementTree as ET
import zipfile
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTROL = ROOT / 'docs/development-control'
BASE = 'docs/baseline/v1.1/'
MASTER = BASE + 'Kashyap_Adhikari_Master_Requirements_SDLC_Specification.docx'
SDLC = BASE + 'Kashyap_Adhikari_Final_SDLC_Execution_Governance_Specification_v1.0.docx'
PRIVACY = BASE + 'Kashyap_Adhikari_Privacy_Data_Retention_Policy_v1.0.docx'
FREEZE = BASE + 'Kashyap_Adhikari_Documentation_Baseline_Freeze_Record_v1.0.docx'
BRD = BASE + 'Kashyap_Adhikari_Business_Requirements.docx'
CATALOGUE = BASE + 'Kashyap_Adhikari_Edge_Case_Exception_Negative_Test_Traceability_Catalogue_v1.0.xlsx'
BEHAVIOR = BASE + 'Kashyap_Adhikari_Detailed_Behaviour_Edge_Case_Exception_Negative_Test_Specification_v1.0.docx'
CLASSES = [
    'Verified complete', 'Implemented but verification pending',
    'Partially implemented', 'Not implemented',
    'Blocked by external dependencies', 'Awaiting owner approval',
]
AREA_CLASS = {
    'COMPLETED': CLASSES[1], 'PARTIALLY_COMPLETED': CLASSES[2],
    'MISSING': CLASSES[3], 'EXTERNAL_GATE': CLASSES[4],
}
EC_AREAS = {
    'Installation & Compatibility': 'NFR;AUTH;NOT',
    'Registration, OTP & Sessions': 'AUTH',
    'Profiles, Claims & Privacy': 'PROF;CLAIM;PRIV',
    'Genealogy Person & Relationships': 'GEN;CHG',
    'Duplicate Detection & Merge': 'DUP;GEN',
    'Search, Tree & Relationship Paths': 'SRCH;GEN;REL',
    'Nata/Saino Engine': 'REL',
    'Calendar, Tithi, Jutho & Shraddha': 'CAL;JUT',
    'Content, Rituals & Localization': 'CUL;I18N',
    'Events, Invitations & RSVP': 'INV;CAL',
    'Community Posts & Moderation': 'COM',
    'Map & Location': 'MAP;PRIV',
    'Chat, Groups & Presence': 'CHAT',
    'Notifications & Background Jobs': 'NOT',
    'Media & Files': 'MEDIA',
    'Administration, Roles & Audit': 'ADM;AUD;AUTH',
    'Offline, Sync & Concurrency': 'CHAT;AUTH;CHG',
    'API, Integrations & Errors': 'NFR;AUTH;NOT',
    'Migration & Import': 'ADM;GEN',
    'Security, Abuse & Privacy Incidents': 'PRIV;AUTH;AUD',
    'Operations, Release & Retirement': 'NFR;AUD',
    'Accessibility & User Experience': 'I18N;NFR',
}


def read_csv(path):
    with (ROOT / path).open(encoding='utf-8-sig', newline='') as stream:
        return list(csv.DictReader(stream))


def tables(path):
    w = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
    with zipfile.ZipFile(ROOT / path) as archive:
        doc = ET.fromstring(archive.read('word/document.xml'))
    return [[[
        ' '.join(''.join(''.join(node.itertext()) for node in paragraph.findall('.//' + w + 't'))
                 for paragraph in cell.findall('.//' + w + 'p')).strip()
        for cell in row.findall(w + 'tc')
    ] for row in table.findall(w + 'tr')] for table in doc.findall('.//' + w + 'tbl')]


def frozen_cases():
    x = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
    with zipfile.ZipFile(ROOT / CATALOGUE) as archive:
        strings = [''.join(''.join(t.itertext()) for t in item.findall('.//' + x + 't'))
                   for item in ET.fromstring(archive.read('xl/sharedStrings.xml')).findall(x + 'si')]
        sheet = ET.fromstring(archive.read('xl/worksheets/sheet2.xml'))
    rows = []
    for row in sheet.findall('.//' + x + 'sheetData/' + x + 'row'):
        cells = [''] * 17
        for cell in row.findall(x + 'c'):
            col = 0
            for letter in re.match(r'[A-Z]+', cell.attrib['r']).group():
                col = col * 26 + ord(letter) - 64
            value = cell.find(x + 'v')
            text = value.text if value is not None and value.text else ''
            if cell.attrib.get('t') == 's':
                text = strings[int(text)]
            elif cell.attrib.get('t') == 'inlineStr':
                text = ''.join(''.join(t.itertext()) for t in cell.findall('.//' + x + 't'))
            cells[col - 1] = text
        rows.append(cells)
    header = rows[2]
    return [dict(zip(header, row)) for row in rows[3:] if row[0].startswith('EC-')]


def unique(items):
    return list(dict.fromkeys(item for item in items if item))


def joined_context(config, areas, kind):
    return ';'.join(unique(path for area in areas for path in config['modules'][area][kind]))


def layer_status(paths, scope, classification):
    if not paths:
        return 'No dedicated ' + scope + ' surface mapped; server/policy control may apply. Applicability and acceptance OPEN.'
    if classification == CLASSES[3]:
        return 'Supporting ' + scope + ' source only; complete frozen workflow/target is not implemented or demonstrated.'
    return 'Relevant ' + scope + ' source present; per-requirement end-to-end completeness and independent acceptance OPEN.'


def supplement_rows():
    """Inventory every non-FR/NFR frozen table row, not just hand-picked gates.

    Synthetic IDs are document/table/row locators, not invented baseline IDs.
    Blank signature rows and reference tables remain inventory, not acceptance.
    """
    out = []
    for doc, prefix in [(MASTER, 'MASTER'), (SDLC, 'SDLC'), (PRIVACY, 'PRIVACY'), (FREEZE, 'FREEZE'), (BRD, 'BRD'), (BEHAVIOR, 'BEHAVIOR')]:
        for ti, rows in enumerate(tables(doc), 1):
            if not rows:
                continue
            for ri, cells in enumerate(rows[1:], 2):
                if not any(cells):
                    continue
                first = cells[0]
                if re.fullmatch(r'[A-Z0-9]+-FR-\d{3}|NFR-[A-Z0-9]+-\d{3}', first):
                    continue
                identifier = first if re.fullmatch(r'(?:BR-[A-Z]+-\d{3}|BAC-\d{3}|E2E-\d{3}|MOB-\d{3}|ADM-UI-\d{3}|OR-\d{2}|OD-\d{2}|OG-\d{2}|SDLC-P\d{2}|A\d{2}|A-\d{3})', first) else ''
                if re.match(r'^RG-\d{2}\b', first):
                    identifier = first.split()[0]
                out.append({
                    'record_id': f'{prefix}-T{ti:02}-R{ri:03}',
                    'frozen_id': identifier,
                    'source_document': doc,
                    'source_location': f'table {ti}, row {ri} (one-based; header included)',
                    'table_header': json.dumps(rows[0], ensure_ascii=False),
                    'frozen_cells': json.dumps(cells, ensure_ascii=False),
                    'classification': CLASSES[5] if identifier.startswith(('RG-', 'OG-', 'OD-')) else CLASSES[2],
                    'implementation_and_test_context': 'Related module rows and architecture/operational artifacts only; this inventory does not assert every table contract, route, screen or policy control has been implemented or tested.',
                    'security_privacy_acceptance': 'OPEN; apply stronger frozen privacy/security requirement; named authority and legal sign-off not invented.',
                    'remaining_work': 'Independently map this exact frozen control/contract to source, test/procedure and source-bound result; resolve missing behavior or approved disposition through formal change control.',
                    'production_evidence': 'Named accountable owner, per-control acceptance, exact release-candidate evidence and applicable RG/OG approvals. Table inventory is not signed acceptance.',
                })
        # Body prose includes binding non-table controls (for example Privacy 4.1).
        # Inventory every nonempty paragraph so normative prose cannot disappear
        # through an incomplete keyword heuristic. These contextual records are
        # deliberately unscored and never represent independent acceptance.
        w = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
        with zipfile.ZipFile(ROOT / doc) as archive:
            body = ET.fromstring(archive.read('word/document.xml')).find(w + 'body')
        for pi, paragraph in enumerate(body.findall(w + 'p'), 1):
            text = ''.join(''.join(t.itertext()) for t in paragraph.findall('.//' + w + 't')).strip()
            if not text:
                continue
            out.append({
                'record_id': f'{prefix}-P{pi:04}', 'frozen_id': '',
                'source_document': doc, 'source_location': f'body paragraph {pi} (one-based; tables excluded)',
                'table_header': '[]', 'frozen_cells': json.dumps([text], ensure_ascii=False),
                'classification': CLASSES[2],
                'implementation_and_test_context': 'Unscored frozen prose inventory; related module rows/artifacts are context, not verified implementation of this paragraph.',
                'security_privacy_acceptance': 'OPEN; frozen precedence and legal/privacy/domain controls apply.',
                'remaining_work': 'Determine normative applicability, map mandatory control to exact source/test/procedure and independent evidence; preserve headings/reference context without counting them as completed requirements.',
                'production_evidence': 'Exact applicable control, source-bound acceptance and required named authority approval; prose inventory alone cannot close any release gate.',
            })
    for path in sorted((ROOT / 'docs/architecture/ADR').glob('*.md')):
        text = path.read_text()
        out.append({
            'record_id': path.stem, 'frozen_id': path.stem.split('-')[0] + '-' + path.stem.split('-')[1],
            'source_document': str(path.relative_to(ROOT)), 'source_location': 'Complete accepted ADR; higher frozen specification/privacy controls prevail',
            'table_header': '[]', 'frozen_cells': json.dumps([text], ensure_ascii=False),
            'classification': CLASSES[2],
            'implementation_and_test_context': 'Architecture choice present in source; ADR performance/operations assertions are not measured acceptance. Relevant module paths and reports provide bounded context.',
            'security_privacy_acceptance': 'OPEN; record precedence conflicts (notably ADR-006 vs Privacy4.1) without allowing prohibited collection.',
            'remaining_work': 'Reconcile architecture assertions and actual runtime/contracts with higher-authority requirements; prove operational/deployment/security behavior and approved deviations.',
            'production_evidence': 'Reviewed ADR/contract, reproducible deployment, measurements, managed keys/provider controls and applicable authority approvals.',
        })
    return out


def build(config):
    ledger = read_csv('docs/execution/RELEASE_ACCEPTANCE_LEDGER.csv')
    historical = {r['requirement_id']: r for r in read_csv('docs/execution/RELEASE_IMPLEMENTATION_ASSESSMENT.csv')}
    master_lookup = {}
    for ti, rows in enumerate(tables(MASTER), 1):
        for ri, cells in enumerate(rows[1:], 2):
            if cells and re.fullmatch(r'[A-Z0-9]+-FR-\d{3}|NFR-[A-Z0-9]+-\d{3}', cells[0]):
                master_lookup[cells[0]] = (ti, ri, cells)
    reqs = []
    for original in ledger:
        rid = original['requirement_id']
        area = rid.split('-')[0]
        module = config['modules'][area]
        old = historical[rid]
        classification = config['classification_overrides'].get(rid, AREA_CLASS[old['implementation_status']])
        ti, ri, frozen = master_lookup[rid]
        # Retain a historical judgement as history, never silently promote it.
        remaining = config['overrides'].get(rid, old['review_findings'])
        if old['implementation_status'] == 'COMPLETED' and rid not in config['overrides']:
            remaining = 'Bounded implementation was present in the historical assessment; current related source/suites exist. Independently verify the exact frozen acceptance across all applicable clients, privacy and release candidate; legacy COMPLETED is not a signed closure.'
        target = old['frozen_nfr_target']
        row = {
            'requirement_id': rid, 'module': module['name'],
            'frozen_requirement': frozen[2] if rid.startswith('NFR-') else frozen[1],
            'frozen_acceptance': frozen[3],
            'frozen_nfr_target': target,
            'source_document': MASTER, 'source_location': f'table {ti}, row {ri} (one-based; header included)',
            'release_scope': original['release_scope'], 'legacy_acceptance_status': original['status'],
            'classification': classification,
            'classification_basis': 'Conservative static scope reconciliation at reviewed_sha; legacy bounded implementation judgement retained as historical context, exact end-to-end/signature acceptance remains OPEN.',
            'backend_status': layer_status(module['backend'], 'backend', classification),
            'backend_paths': ';'.join(unique(module['backend'] + [p for p in old['source_evidence'].split(';') if p.startswith('services/') or p.startswith('database/')])),
            'mobile_status': layer_status(module['mobile'], 'Flutter', classification),
            'mobile_paths': ';'.join(unique(module['mobile'] + [p for p in old['source_evidence'].split(';') if p.startswith('apps/mobile/')])),
            'admin_status': layer_status(module['admin'], 'admin', classification),
            'admin_paths': ';'.join(unique(module['admin'] + [p for p in old['source_evidence'].split(';') if p.startswith('apps/admin/')])),
            'related_tests': ';'.join(unique(module['tests'] + old['test_suite_context'].split(';'))),
            'test_mapping_status': 'CONTEXT_ONLY; relevant existing suite paths, not independently mapped passing assertion for this entire requirement.',
            'latest_verification': 'CI-C804-PR;CI-C804-PUSH;IOS-C804-PR;IOS-C804-PUSH (see registry for exact source/conclusions/scope); signed requirement acceptance OPEN.',
            'security_privacy_acceptance': module['security_privacy'],
            'integration_dependencies': module['dependencies'],
            'remaining_work': remaining,
            'release_blockers': 'Frozen acceptance remains open; ' + module['dependencies'],
            'required_production_evidence': 'Exact acceptance: ' + frozen[3] + (' Exact target: ' + target if target else '') + ' Independent source-bound cross-layer/security/privacy evidence and applicable named authority approval; current suite context alone is insufficient.',
            'reports': ';'.join(unique(module['reports'] + [p for p in old['source_evidence'].split(';') if p.startswith('docs/')])),
            'reviewed_sha': config['reviewed_sha'],
            'historical_classification': old['implementation_status'],
            'historical_review_sha': old['reviewed_commit'],
            'individually_verified': 'false', 'signed_acceptance_closed': 'false',
        }
        reqs.append(row)
    trace = {r['Edge Case ID']: r for r in read_csv('docs/execution/EDGE_CASE_TRACEABILITY.csv')}
    cases = []
    for frozen in frozen_cases():
        eid = frozen['Edge Case ID']
        legacy = trace[eid]
        areas = EC_AREAS[frozen['Module']].split(';')
        explanation = 'Related module implementation exists; exact case-to-assertion/procedure and every required data/audit/retry/privacy/recovery effect remain unverified. Partial means incomplete case implementation/traceability, not a verified behavioral outcome.'
        if eid in config['edge_context']:
            area_string, explanation = config['edge_context'][eid]
            areas = area_string.split(';')
        classification = CLASSES[2]
        if frozen['Module'] in ['Nata/Saino Engine', 'Calendar, Tithi, Jutho & Shraddha', 'Administration, Roles & Audit']:
            classification = CLASSES[5]
        if frozen['Module'] == 'Operations, Release & Retirement':
            classification = CLASSES[4]
        classification = config.get('edge_classification_overrides', {}).get(eid, classification)
        cases.append({
            'edge_case_id': eid, 'module': frozen['Module'],
            'frozen_requirement_reference': frozen['Requirement'],
            'candidate_requirement_families': ';'.join(area + '-*' for area in areas),
            'requirement_mapping_status': 'Frozen catalogue reference is broad. Candidate families are audit navigation, not a fabricated exact requirement mapping.',
            'frozen_title': frozen['Title / Trigger'],
            'frozen_preconditions': frozen['Preconditions'],
            'frozen_expected_behavior': frozen['Expected Behaviour'],
            'frozen_english_message': frozen['English Message'], 'frozen_nepali_message': frozen['Nepali Message'],
            'frozen_data_effect': frozen['Data Effect'], 'frozen_retry_behavior': frozen['Retry Behaviour'],
            'frozen_audit_requirement': frozen['Audit Requirement'],
            'frozen_security_privacy': frozen['Security / Privacy'],
            'frozen_recovery_route': frozen['Recovery Route'],
            'frozen_priority': frozen['Priority'], 'frozen_given_when_then': frozen['Given / When / Then'],
            'source_document': CATALOGUE, 'source_location': 'Edge Case Catalogue; ' + eid,
            'classification': classification, 'classification_basis': explanation,
            'backend_paths': joined_context(config, areas, 'backend'),
            'mobile_paths': joined_context(config, areas, 'mobile'),
            'admin_paths': joined_context(config, areas, 'admin'),
            'backend_status': 'Relevant module source only; exact scenario completeness and acceptance OPEN.',
            'mobile_status': 'Relevant client context only; exact scenario/device/privacy acceptance OPEN.',
            'admin_status': 'Relevant admin context only; exact scenario/role/privacy acceptance OPEN.',
            'related_tests': joined_context(config, areas, 'tests'),
            'test_mapping_status': 'CONTEXT_ONLY; exact Given/When/Then assertion/procedure mapping OPEN; no individual EC success inferred from CI totals.',
            'latest_verification': 'CI-C804-PR;CI-C804-PUSH;IOS-C804-PR;IOS-C804-PUSH; per-case acceptance OPEN.',
            'security_privacy_acceptance': 'OPEN; independently prove frozen security/privacy, audit, data and recovery effects alongside expected behavior.',
            'integration_dependencies': ' | '.join(config['modules'][area]['dependencies'] for area in areas),
            'remaining_work': explanation + ' Map and execute all frozen expected/retry/data/audit/privacy/recovery effects with professional Nepali review.',
            'release_blockers': 'Mandatory frozen case lacks accepted source-bound full-case evidence. ' + legacy['Human Approval Gate'],
            'human_gate_context': legacy['Human Approval Gate'] + '; historical gate names/numbers are context only; use frozen OG/RG control text if numbering conflicts.',
            'required_production_evidence': frozen['Given / When / Then'] + ' Retain test/procedure, exact source/tree/config, redacted artifact, observed result and named independent acceptance.',
            'reports': joined_context(config, areas, 'reports'),
            'reviewed_sha': config['reviewed_sha'],
            'individually_verified': 'false', 'signed_acceptance_closed': 'false',
        })
    return reqs, cases, supplement_rows()


def csv_text(rows):
    stream = io.StringIO(newline='')
    writer = csv.DictWriter(stream, fieldnames=list(rows[0]), lineterminator='\n')
    writer.writeheader()
    writer.writerows(rows)
    return stream.getvalue()


def escape(value):
    return str(value).replace('|', '\\|').replace('\n', ' ')


def markdown(config, reqs, cases, controls):
    lines = [
        '# Requirement and edge-case production matrix', '',
        'Status: **NOT READY**. Owner/release authority: Jyphra Technology Pvt. Ltd. No scope removal, cultural activation, merge or deployment is authorized by this assessment.', '',
        f'Static reconciliation source: `{config["reviewed_sha"]}`. Evidence observation: `{config["reviewed_at_utc"]}`. New work after that source needs its own exact-source evidence. All existing frozen acceptance/traceability ledgers and baseline files are preserved byte-for-byte.', '',
        'The two independent populations are **260 mandatory requirement rows (229 functional + 31 NFR)** and **260 mandatory EC-0001..EC-0260 cases**. They are not interchangeable. The Master’s 292-control summary is not an exhaustive acceptance denominator: in addition to the 260 FR/NFR rows it contains 20 BR business rules, 20 BAC business acceptance criteria, 12 RG gates and appended governance/journey/screen/decision controls. All remain binding where applicable.', '',
        f'Additional source inventory: **{len(controls)} table/prose/ADR records** across Master, BRD, Final SDLC, Freeze Record, Privacy and Detailed Behaviour documents and accepted ADRs, each with exact source/location and original text. This includes non-normative headings/reference/signature context as well as mandatory controls. It is unscored, not added to a misleading completion denominator; individual implementation/test mapping of these supplemental controls remains OPEN.', '',
        'Full per-row implementation paths, layer status, exact acceptance/NFR target, test context, source-bound result references, security/privacy, dependencies, remaining work, blockers and production evidence are in [REQUIREMENTS_MATRIX.csv](REQUIREMENTS_MATRIX.csv), [EDGE_CASE_MATRIX.csv](EDGE_CASE_MATRIX.csv) and [BASELINE_CONTROL_MATRIX.csv](BASELINE_CONTROL_MATRIX.csv). [requirements_matrix_review.json](requirements_matrix_review.json) records auditable source reconciliation and evidence scope. Run `python scripts/validate_requirements_matrix.py` (read-only); controlled regeneration uses `--generate`.', '',
        '## Classification and evidence rules', '',
        '| Classification | Meaning |', '|---|---|',
        '| Verified complete | Exact frozen acceptance is independently proven on the release candidate, with applicable cross-layer/security/privacy and authority evidence. No row currently qualifies. |',
        '| Implemented but verification pending | Bounded source exists, but full requirement acceptance or its source-bound case mapping remains open. |',
        '| Partially implemented | Behavior, integration, client scope, acceptance or per-case traceability is incomplete; related code is not proof of the entire requirement/case. |',
        '| Not implemented | Required complete workflow or dedicated assurance target is absent; supporting code may exist. |',
        '| Blocked by external dependencies | Real provider/infrastructure/device/operational acceptance is unavailable; coexistence of code gaps is preserved. |',
        '| Awaiting owner approval | Named cultural/legal/governance decision or signed reference evidence is required; this does not excuse remaining engineering. |', '',
        'No arbitrary percentages or fractional partial credit. Signed acceptance closed: **0/260 requirements**. Individually accepted complete frozen cases: **0/260 in this matrix**; existing regression suites may cover behavior, but no case pass is invented. Counts describe conservative static classifications, not application completion.', '',
        '| Classification | Requirements | Edge cases |', '|---|---:|---:|',
    ]
    for status in CLASSES:
        lines.append(f'| {status} | {sum(r["classification"] == status for r in reqs)} | {sum(r["classification"] == status for r in cases)} |')
    lines += ['', '## Exact-source evidence registry', '', '| Ref | Source SHA | Run | Observed result and scope |', '|---|---|---:|---|']
    for key, value in config['evidence'].items():
        lines.append(f'| {key} | `{value["sha"]}` | [{value["run_id"]}](https://github.com/rahulgupta32/kashyap_family_tree/actions/runs/{value["run_id"]}) | **{value["conclusion"]}**; {escape(value["scope"])} |')
    lines += ['', 'Suite success proves only that suite on its recorded source. It does not prove physical push receipt, production signing/PITR, every frozen Given/When/Then, approved real data, or signed release acceptance. Pending is never success. Earlier passing b7ec666 runs do not verify later opt-out or new changes.', '',
        '## Reconciled findings and release order', '',
        'Historical assessment claims of missing native push, required community categories/images/contact fields, groups/delivery receipts/offline outboxes and calendar views are superseded by bounded current source/report evidence. Their broader release scope remains open. Original historical CSV/ledgers were not rewritten.', '',
        '| Priority | Governing rows | Concrete remaining work / acceptance |', '|---|---|---|',
        '| 1 | AUTH-FR-009, NOT-FR-005/007/011 | Verify current exact-source Android/iOS and 13 opt-out regressions; retain any terminal failure. Native calendar account/authority-state change safety requires bounded source/test verification separately. |',
        '| 2 | PRIV-FR-006, ADM-FR-008/012/013, REL-FR-003/009/013 | Close versioned consent acknowledgements, complete status/assignment console, durable cultural-rule governance, full approved workbook target mapping/reconciliation and controlled promotion/recovery. Never activate unapproved rules/imports. |',
        '| 3 | CAL/INV/NOT, CUL/JUT | Finish Person/family/approved-relationship recurrence/follower audiences, signed conversions/reference cases, rich approved cultural content. Obtain named authority source inputs while implementing gated capabilities. |',
        '| 4 | COM/CHAT/MEDIA/MAP/I18N | Complete configurable moderation/retention, full media/gallery and map-provider workflows, broader chat reporting/reconnect/receipt policy and bilingual stable keys/accessibility. |',
        '| 5 | NFR-PERF/SCALE/A11Y/SEC/OBS/DR/COST | Measure exact frozen targets across real API/writes/tree/realtime/supported devices; configure fleet alerts/named routing; managed backups/PITR/RPO/RTO and staging rollback/restore. Existing small benchmark/logical restore is bounded evidence only. |',
        '| 6 | RG-01..12, OG-01..09, frozen privacy launch checklist | Named roles/deputies/recusal, legal/privacy/processor approval, approved real genealogy, commercial/key/cloud/app IDs/signing/store evidence, UAT and explicit Jyphra go/no-go. |', '',
        '## Authority conflicts that must be reconciled', '',
        '- ADR-006 discusses citizenship/passport evidence; higher-authority Privacy §4.1 prohibits such collection absent separately approved necessity, lawful authority and DPIA. Do not treat ADR prose as permission to collect identity documents.',
        '- Historical `OPEN_GATES.md` maps HG-005 to cultural canon while edge traceability labels it named appointments, and uses HG-017 for branch protection while cases refer it to operations/release. This matrix preserves those historical labels as context and uses the frozen named RG/OG closure conditions. An authorized gate-register reconciliation is still needed; no gate is opened here.',
        '- Frozen stricter Master targets govern: APIs ≥99.9% monthly, 1,000,000 Persons, 100,000 registered users and 10,000 simultaneous realtime connections. BRD/ADR summary claims and a four-worker database benchmark do not replace them.', '',
        '## Requirement-by-requirement index', '',
        'Every full acceptance sentence and source path is in the CSV. This compact index shows the frozen behavior and row-specific remaining scope; all security/privacy and signed acceptance are OPEN.', '',
        '| ID | Module | Frozen requirement / exact NFR target | Classification | Remaining work |', '|---|---|---|---|---|',
    ]
    for row in reqs:
        lines.append('| ' + ' | '.join(escape(row[key]) for key in ['requirement_id', 'module', 'frozen_requirement', 'classification', 'remaining_work']) + ' |')
    lines += ['', '## Frozen edge-case index', '',
        'The canonical identities and every frozen precondition, Given/When/Then, bilingual message, data effect, retry rule, audit/privacy and recovery route are retained in EDGE_CASE_MATRIX.csv. Candidate module/test paths are explicitly contextual until mapped to a passing exact assertion. Historical illustrative EC-AUTH/EC-GEN rows do not replace canonical EC-0001..0260.', '',
        '| Case | Module | Trigger | Frozen expected behavior | Classification |', '|---|---|---|---|---|']
    for row in cases:
        lines.append('| ' + ' | '.join(escape(row[key]) for key in ['edge_case_id', 'module', 'frozen_title', 'frozen_expected_behavior', 'classification']) + ' |')
    lines += ['', '## Update protocol', '',
        'Fetch current GitHub HEAD/checks before changing evidence. Update reviewed context only after inspecting changed source and actual results; preserve historical evidence and failures. Generate and validate; review classification changes individually. A row can become Verified complete only with exact assertion/procedure mapping, passing release-candidate evidence and required authority acceptance. Do not infer closure from suite totals or copy stale historical missing claims. Production readiness remains NOT READY until all mandatory controls have accepted evidence or a formally approved disposition.', '']
    return '\n'.join(lines)


def outputs(config):
    reqs, cases, controls = build(config)
    return {
        'REQUIREMENTS_MATRIX.csv': csv_text(reqs),
        'EDGE_CASE_MATRIX.csv': csv_text(cases),
        'BASELINE_CONTROL_MATRIX.csv': csv_text(controls),
        'REQUIREMENTS_MATRIX.md': markdown(config, reqs, cases, controls),
    }, reqs, cases, controls


def validate(config, reqs, cases, controls):
    assert len(reqs) == 260 and len({r['requirement_id'] for r in reqs}) == 260
    assert sum(r['requirement_id'].startswith('NFR-') for r in reqs) == 31
    assert [r['edge_case_id'] for r in cases] == [f'EC-{i:04}' for i in range(1, 261)]
    assert len({r['record_id'] for r in controls}) == len(controls)
    for path, digest in config['frozen_hashes'].items():
        assert hashlib.sha256((ROOT / path).read_bytes()).hexdigest() == digest, f'Controlled source/ledger bytes changed: {path}'
    for row in reqs + cases:
        assert row['classification'] in CLASSES and row['classification'] != CLASSES[0]
        assert row['individually_verified'] == row['signed_acceptance_closed'] == 'false'
        assert row['remaining_work'] and row['required_production_evidence']
        assert row['test_mapping_status'].startswith('CONTEXT_ONLY')
        for key in ['backend_paths', 'mobile_paths', 'admin_paths', 'related_tests', 'reports']:
            for path in row[key].split(';'):
                if path:
                    assert (ROOT / path).is_file(), f'Missing {key}: {path}'
    for value in config['evidence'].values():
        assert re.fullmatch(r'[0-9a-f]{40}', value['sha'])
        assert value['run_id'].isdigit() and value['scope']
        assert value['conclusion'] in {'SUCCESS', 'FAILURE', 'PENDING', 'CANCELLED', 'SKIPPED'}
    # The accepted FR/NFR texts must exactly match the frozen DOCX, not only an old CSV.
    original = {r['requirement_id']: r for r in read_csv('docs/execution/RELEASE_ACCEPTANCE_LEDGER.csv')}
    old = {r['requirement_id']: r for r in read_csv('docs/execution/RELEASE_IMPLEMENTATION_ASSESSMENT.csv')}
    for row in reqs:
        rid = row['requirement_id']
        assert row['legacy_acceptance_status'] == original[rid]['status'] == 'ACCEPTANCE_NOT_CLOSED'
        assert row['frozen_nfr_target'] == old[rid]['frozen_nfr_target']
        if rid.startswith('NFR-'):
            assert row['frozen_requirement'] == row['frozen_nfr_target'], rid + ': exact NFR target differs'
        if not rid.startswith('NFR-'):
            assert row['frozen_requirement'] == original[rid]['requirement'], rid + ': frozen requirement differs'
            assert row['frozen_acceptance'] == original[rid]['acceptance'], rid + ': frozen acceptance differs'
    exact_cases = {row['Edge Case ID']: row for row in frozen_cases()}
    frozen_fields = {
        'frozen_title': 'Title / Trigger', 'frozen_preconditions': 'Preconditions',
        'frozen_expected_behavior': 'Expected Behaviour', 'frozen_english_message': 'English Message',
        'frozen_nepali_message': 'Nepali Message', 'frozen_data_effect': 'Data Effect',
        'frozen_retry_behavior': 'Retry Behaviour', 'frozen_audit_requirement': 'Audit Requirement',
        'frozen_security_privacy': 'Security / Privacy', 'frozen_recovery_route': 'Recovery Route',
        'frozen_priority': 'Priority', 'frozen_given_when_then': 'Given / When / Then',
        'frozen_requirement_reference': 'Requirement', 'module': 'Module',
    }
    for row in cases:
        for output_field, source_field in frozen_fields.items():
            assert row[output_field] == exact_cases[row['edge_case_id']][source_field], row['edge_case_id'] + ': frozen ' + source_field + ' changed'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--generate', action='store_true')
    args = parser.parse_args()
    config = json.loads((CONTROL / 'requirements_matrix_review.json').read_text())
    generated, reqs, cases, controls = outputs(config)
    validate(config, reqs, cases, controls)
    if args.generate:
        for name, content in generated.items():
            (CONTROL / name).write_text(content, encoding='utf-8')
    for name, expected in generated.items():
        assert (CONTROL / name).read_text(encoding='utf-8') == expected, f'{name}: stale or unaudited generated matrix'
    print(f'PASS: 260 requirements (229 functional/31 NFR), 260 distinct frozen edge cases, {len(controls)} unscored supplemental source records; exact texts/targets, controlled hashes, paths and conservative evidence scope intact.')


if __name__ == '__main__':
    main()
