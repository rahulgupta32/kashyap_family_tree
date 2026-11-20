"""Negative integrity checks for the additive audit, without modifying files.

These challenge scope preservation and unsupported success claims. They cannot
authenticate a plausible external CI claim; live retrieval is still mandatory.
"""
import copy
import json
import unittest

import validate_requirements_matrix as matrix


class MatrixIntegrityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.config = json.loads((matrix.CONTROL / 'requirements_matrix_review.json').read_text())
        cls.rows = matrix.build(cls.config)

    def setUp(self):
        self.config = copy.deepcopy(self.config)
        self.requirements, self.cases, self.controls = copy.deepcopy(self.rows)

    def reject(self):
        with self.assertRaises(AssertionError):
            matrix.validate(self.config, self.requirements, self.cases, self.controls)

    def test_complete_reviewed_input_is_accepted(self):
        matrix.validate(self.config, self.requirements, self.cases, self.controls)

    def test_missing_or_duplicated_requirement_is_rejected(self):
        self.requirements.pop()
        self.reject()
        self.requirements = copy.deepcopy(self.rows[0])
        self.requirements[1]['requirement_id'] = self.requirements[0]['requirement_id']
        self.reject()

    def test_missing_or_duplicated_edge_case_is_rejected(self):
        self.cases.pop()
        self.reject()
        self.cases = copy.deepcopy(self.rows[1])
        self.cases[1]['edge_case_id'] = self.cases[0]['edge_case_id']
        self.reject()

    def test_changed_frozen_requirement_acceptance_is_rejected(self):
        self.requirements[0]['frozen_acceptance'] = 'Accept every phone number without validation.'
        self.reject()

    def test_weakened_frozen_nfr_is_rejected(self):
        row = next(row for row in self.requirements if row['requirement_id'] == 'NFR-PERF-001')
        row['frozen_requirement'] = 'p95 <= 5000 ms'
        self.reject()

    def test_changed_case_behavior_privacy_and_nepali_text_are_rejected(self):
        for field in ['frozen_expected_behavior', 'frozen_security_privacy', 'frozen_nepali_message']:
            self.cases = copy.deepcopy(self.rows[1])
            self.cases[0][field] = 'Different frozen text'
            self.reject()

    def test_fabricated_individual_pass_or_signed_closure_is_rejected(self):
        for field in ['individually_verified', 'signed_acceptance_closed']:
            self.cases = copy.deepcopy(self.rows[1])
            self.cases[0][field] = 'true'
            self.reject()
        self.cases = copy.deepcopy(self.rows[1])
        self.requirements[0]['classification'] = 'Verified complete'
        self.reject()

    def test_unknown_classification_or_running_success_label_is_rejected(self):
        self.requirements[0]['classification'] = '95% COMPLETE'
        self.reject()
        self.requirements = copy.deepcopy(self.rows[0])
        self.config['evidence']['CI-C804-PR']['conclusion'] = 'RUNNING_PASSED'
        self.reject()

    def test_nonexistent_evidence_path_is_rejected(self):
        self.requirements[0]['related_tests'] = 'nonexistent-tests/invented-pass.spec.ts'
        self.reject()

    def test_changed_controlled_source_digest_is_rejected(self):
        first = next(iter(self.config['frozen_hashes']))
        self.config['frozen_hashes'][first] = '0' * 64
        self.reject()


if __name__ == '__main__':
    unittest.main()
