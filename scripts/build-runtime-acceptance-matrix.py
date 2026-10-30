#!/usr/bin/env python3
"""Join frozen rows with bounded device evidence; never grant signed acceptance."""
import argparse
import csv
import hashlib
import json
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
MARKERS = (
    '[M4 DEVICE] Persisted RSVP, native refresh and logout passed. Live acceptance complete.',
    '[MFA DEVICE] Used recovery code rejected; separate code and encrypted-session refresh proof passed',
    '[ACCOUNT DELETE DEVICE] Real OTP confirmation, two revoked sessions, cleared secure stores and retained unclaimed genealogy verified',
    '[MEMBER DISPUTE DEVICE] Real Person initiation, independent dismissal/upholding, own private status and retained genealogy verified',
)


def build(log: str, head: str, tree: str) -> dict:
    for marker in (*MARKERS, 'All tests passed!'):
        if marker not in log:
            raise ValueError('Required completed device journey evidence missing: ' + marker)
    matrix_path = ROOT / 'docs/development-control/REQUIREMENTS_MATRIX.csv'
    assessment_path = ROOT / 'docs/execution/RELEASE_IMPLEMENTATION_ASSESSMENT.csv'
    rows = list(csv.DictReader(matrix_path.open(encoding='utf-8-sig')))
    assessed = {r['requirement_id']: r for r in csv.DictReader(assessment_path.open(encoding='utf-8-sig'))}
    if len(rows) != 260 or len({r['requirement_id'] for r in rows}) != 260 or set(assessed) != {r['requirement_id'] for r in rows}:
        raise ValueError('Frozen acceptance inventory mismatch')
    categories = {'COMPLETED': 'IMPLEMENTED_NOT_ACCEPTED',
                  'PARTIALLY_COMPLETED': 'REGISTERED_INCOMPLETE_OR_UNVERIFIED',
                  'MISSING': 'REGISTERED_MISSING_EVIDENCE_OR_IMPLEMENTATION',
                  'EXTERNAL_GATE': 'BLOCKED_INFRASTRUCTURE_DATA_DEVICE_OR_APPROVAL'}
    output = []
    for row in rows:
        item = {k: row[k] for k in ('requirement_id', 'module', 'frozen_requirement', 'frozen_acceptance',
                  'frozen_nfr_target', 'source_document', 'source_location', 'required_production_evidence', 'remaining_work')}
        entry = assessed[row['requirement_id']]
        item.update(status=categories.get(entry['implementation_status'], 'NOT_CURRENTLY_ASSESSED'),
                    implementation_status=entry['implementation_status'], implementation_review_sha=entry['reviewed_commit'],
                    basis='Existing conservative implementation register, not a new full source audit',
                    independently_accepted=False, signed_acceptance_closed=False, current_runtime_evidence=[])
        if row['requirement_id'] in ('PROF-FR-010', 'PROF-FR-011'):
            item.update(status='BOUNDED_RUNTIME_VERIFIED_NOT_ACCEPTED', basis='Actual Android UI and live API/PostgreSQL fixture',
                        current_runtime_evidence=[{'source_sha': head, 'source_tree': tree,
                          'case': 'Member deletes account through real UI, revokes all sessions and preserves genealogy',
                          'path': 'apps/mobile/integration_test/m4_live_api_device_test.dart',
                          'scope': 'OTP reauthentication, explicit confirmation, outcome, two revoked sessions, secure-store cleanup, retained unclaimed Person and tree links',
                          'not_verified': ['approved legal retention policy', 'physical devices', 'independent acceptance', 'full audit/privacy acceptance', 'admin deletion UI']}])
        if row['requirement_id'] in ('CLAIM-FR-008', 'CLAIM-FR-010'):
            item.update(status='BOUNDED_RUNTIME_VERIFIED_NOT_ACCEPTED', basis='Actual Android dispute form with live API/PostgreSQL and independent API adjudicator',
                        current_runtime_evidence=[{'source_sha': head, 'source_tree': tree,
                          'case': 'Member initiates private dispute by Person, sees both terminal decisions and retained genealogy',
                          'path': 'apps/mobile/integration_test/m4_live_api_device_test.dart',
                          'scope': 'Person initiation, member form, own status after dismissal/upholding and preserved Person',
                          'not_verified': ['independent acceptance', 'full appeal/governance acceptance', 'physical devices', 'live providers', 'full privacy review']}])
        output.append(item)
    return dict(kind='SOURCE_BOUND_RUNTIME_ACCEPTANCE_MATRIX', source_sha=head, source_tree=tree,
                android_log_normalized_text_sha256=hashlib.sha256(log.encode()).hexdigest(), requirements=output,
                inputs={str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in (matrix_path, assessment_path)},
                productionAcceptance=False, independentlyAcceptedRequirements=0,
                release_gates={f'RG-{i:02}': 'OPEN' for i in range(1, 13)},
                limitations='Bounded engineering evidence; unchanged frozen acceptance and named approvals remain mandatory.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--log', default='test-results/android-integration.log')
    parser.add_argument('--output', default='test-results/runtime-acceptance-matrix.json')
    args = parser.parse_args()
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    tree = subprocess.check_output(['git', 'rev-parse', 'HEAD^{tree}'], cwd=ROOT, text=True).strip()
    expected = os.environ.get('KASHYAP_SOURCE_HEAD_SHA')
    if expected and expected != head:
        raise ValueError('Checked-out source does not match the workflow source')
    log_path = ROOT / args.log
    result = build(log_path.read_text(), head, tree)
    result['android_log_sha256'] = hashlib.sha256(log_path.read_bytes()).hexdigest()
    result['workflow_run_id'] = os.environ.get('GITHUB_RUN_ID')
    target = ROOT / args.output
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print('Verified 260 frozen rows, four completed device journeys; all release gates remain OPEN.')
