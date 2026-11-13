"""Validate the frozen workbook's complete field inventory. Does not import records."""
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]
INVENTORY = ROOT / 'docs/execution/GENEALOGY_WORKBOOK_MAPPING_INVENTORY.json'


def validate(inventory, workbook):
    assert inventory['version'] == 1
    assert inventory['approval'] == 'OPEN' and inventory['productionImportAllowed'] is False
    assert hashlib.sha256(workbook.read_bytes()).hexdigest() == inventory['sourceSha256'], 'Frozen workbook changed'
    with zipfile.ZipFile(workbook) as archive:
        book = ET.fromstring(archive.read('xl/workbook.xml'))
        actual_sheets = book.findall('{*}sheets/{*}sheet')
        assert len(actual_sheets) == len(inventory['sheets']) == 14, 'Incomplete sheet coverage'
        relations = ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))
        targets = {r.attrib['Id']: r.attrib['Target'] for r in relations}
        strings = []
        if 'xl/sharedStrings.xml' in archive.namelist():
            strings = [''.join(t.text or '' for t in s.findall('.//{*}t'))
                       for s in ET.fromstring(archive.read('xl/sharedStrings.xml'))]
        for ordinal, (actual, expected) in enumerate(zip(actual_sheets, inventory['sheets']), 1):
            assert expected['ordinal'] == ordinal and actual.attrib['name'] == expected['name'], 'Sheet order/name mismatch'
            rel_id = actual.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']
            target = targets[rel_id]
            filename = target.lstrip('/') if target.startswith('/') else 'xl/' + target
            sheet = ET.fromstring(archive.read(filename))
            row = next(r for r in sheet.findall('{*}sheetData/{*}row') if r.attrib['r'] == str(expected['headerRow']))
            headers = []
            for cell in row.findall('{*}c'):
                value = cell.find('{*}v')
                if cell.attrib.get('t') == 's':
                    text = strings[int(value.text)]
                elif cell.attrib.get('t') == 'inlineStr':
                    text = ''.join(t.text or '' for t in cell.findall('.//{*}t'))
                else:
                    text = value.text if value is not None else ''
                if text:
                    headers.append(text)
            assert headers == [c['sourceColumn'] for c in expected['columns']], f"Column coverage mismatch: {expected['name']}"
            for index, column in enumerate(expected['columns'], 1):
                assert column['ordinal'] == index and column['required'] == column['sourceColumn'].endswith('*')
                assert column['approval'] == 'OPEN'
                allowed = {'RECORDS': {'PARTIAL_ADAPTER_REQUIRES_APPROVED_TRANSFORM', 'REQUIRES_SCHEMA_AND_GOVERNANCE'},
                           'TRAINING_ONLY': {'NEVER_IMPORT_TRAINING'},
                           'REFERENCE_ONLY': {'GOVERNANCE_METADATA_ONLY'},
                           'MAPPING_GOVERNANCE': {'GOVERNANCE_METADATA_ONLY'}}
                assert column['disposition'] in allowed[expected['role']]
                assert bool(column['adapterTarget']) == (column['disposition'] == 'PARTIAL_ADAPTER_REQUIRES_APPROVED_TRANSFORM')
    assert 'persons[].generation' in inventory['unrepresentedAdapterInputs'], 'Generation cannot be inferred from this template'
    return sum(len(s['columns']) for s in inventory['sheets'])


if __name__ == '__main__':
    data = json.loads(INVENTORY.read_text())
    count = validate(data, ROOT / data['sourceWorkbook'])
    print(f'PASS: 14 frozen workbook sheets, {count} inventoried columns; mapping approvals OPEN, promotion blocked')
