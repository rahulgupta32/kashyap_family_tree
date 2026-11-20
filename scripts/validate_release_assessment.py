"""Validate the implementation assessment without changing release acceptance."""
import csv
from collections import Counter, defaultdict
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(name):
    with (ROOT / 'docs/execution' / name).open(newline='', encoding='utf-8') as stream:
        return list(csv.DictReader(stream))


def main():
    original = read('RELEASE_ACCEPTANCE_LEDGER.csv')
    assessment = read('RELEASE_IMPLEMENTATION_ASSESSMENT.csv')
    assert len(original) == len(assessment) == 260, 'Expected 260 mandatory requirements'
    assert len({r['requirement_id'] for r in assessment}) == 260, 'Duplicate requirements'
    assert {r['requirement_id'] for r in original} == {r['requirement_id'] for r in assessment}, 'Requirement set changed'
    indexed = {r['requirement_id']: r for r in assessment}
    allowed = {'COMPLETED', 'PARTIALLY_COMPLETED', 'MISSING', 'EXTERNAL_GATE'}
    for row in original:
        reviewed = indexed[row['requirement_id']]
        for key, value in row.items():
            assert reviewed[key] == value, f'{row["requirement_id"]}: original field changed: {key}'
        assert reviewed['implementation_status'] in allowed
        assert reviewed['release_scope'] == 'MANDATORY_RELEASE_1'
        assert reviewed['review_findings'] and len(reviewed['reviewed_commit']) == 40
        for key in ('source_evidence', 'test_suite_context'):
            for path in reviewed[key].split(';'):
                assert (ROOT / path).is_file(), f'{row["requirement_id"]}: nonexistent evidence: {path}'
    master = (ROOT / 'docs/baseline/extracted_text/Kashyap_Adhikari_Master_Requirements_SDLC_Specification.txt').read_text().splitlines()
    nfrs = [r for r in assessment if r['requirement_id'].startswith('NFR-')]
    assert len(nfrs) == 31
    for row in nfrs:
        i = master.index(row['requirement_id'])
        assert row['frozen_nfr_target'] == master[i + 2], f'{row["requirement_id"]}: frozen target changed'
    counts = Counter(r['implementation_status'] for r in assessment)
    report = (ROOT / 'docs/execution/RELEASE_IMPLEMENTATION_ASSESSMENT.md').read_text()
    for status, count in counts.items():
        assert f'| {status} | {count} | {count / 260:.1%} |' in report, 'Summary count is stale'
    execution_map = (ROOT / 'docs/execution/PRODUCTION_COMPLETION_EXECUTION_MAP.md').read_text()
    partial_by_area = defaultdict(set)
    for row in assessment:
        if row['implementation_status'] == 'PARTIALLY_COMPLETED':
            partial_by_area[row['requirement_id'].split('-')[0]].add(row['requirement_id'])
    mapped = {}
    for area, count, ids in re.findall(r'^- \*\*([A-Z0-9]+) \((\d+)\)\*\*: (.+)$', execution_map, re.M):
        listed = ids.split(', ')
        assert len(listed) == int(count) == len(set(listed)), f'{area}: execution map count differs'
        mapped[area] = set(listed)
    assert mapped == dict(partial_by_area), 'Execution map partial rows differ from assessment'
    print(f'PASS: all 260 requirements preserved; 31 exact frozen NFR targets; evidence paths exist; {dict(counts)}')


if __name__ == '__main__':
    main()
