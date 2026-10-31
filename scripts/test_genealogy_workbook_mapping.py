import copy
import json
import unittest
from validate_genealogy_workbook_mapping import INVENTORY, ROOT, validate


class WorkbookInventoryTest(unittest.TestCase):
    def setUp(self):
        self.inventory = json.loads(INVENTORY.read_text())
        self.workbook = ROOT / self.inventory['sourceWorkbook']

    def test_complete_baseline(self):
        self.assertEqual(validate(self.inventory, self.workbook), 195)

    def test_missing_sheet_or_column_is_rejected(self):
        for kind in ['sheet', 'column']:
            changed = copy.deepcopy(self.inventory)
            if kind == 'sheet':
                changed['sheets'].pop()
            else:
                changed['sheets'][2]['columns'].pop()
            with self.assertRaises(AssertionError):
                validate(changed, self.workbook)

    def test_training_records_cannot_become_importable(self):
        self.inventory['sheets'][12]['columns'][0]['disposition'] = 'PARTIAL_ADAPTER_REQUIRES_APPROVED_TRANSFORM'
        with self.assertRaises(AssertionError):
            validate(self.inventory, self.workbook)

    def test_approval_and_promotion_cannot_be_implied_by_inventory(self):
        self.inventory['productionImportAllowed'] = True
        with self.assertRaises(AssertionError):
            validate(self.inventory, self.workbook)

    def test_changed_source_fingerprint_is_rejected(self):
        self.inventory['sourceSha256'] = '0' * 64
        with self.assertRaises(AssertionError):
            validate(self.inventory, self.workbook)


if __name__ == '__main__':
    unittest.main()
