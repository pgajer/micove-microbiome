"""Scientific boundary cases for participant-level nearest-case fields."""
import unittest
import numpy as np
from prepare_profile_outcomes import scan


class ProfileOutcomeTests(unittest.TestCase):
    def test_case_sizes_use_nested_prefixes_and_reveal_rare_targets(self):
        groups = np.arange(81)
        y = (groups % 2 == 1).astype(float)
        order = np.tile(groups, (len(groups), 1))
        distances = np.tile(groups.astype(float), (len(groups), 1))
        previous = 0
        for k in (5, 10, 20, 40):
            row = scan(distances, order, groups, y, k)
            self.assertEqual(row['support']['caseParticipantCount'][0], k)
            self.assertEqual(row['support']['participantCount'][0], 2*k-1)
            self.assertEqual(row['values'][0], k/(2*k-1))
            self.assertGreater(row['support']['radius'][0], previous)
            previous = row['support']['radius'][0]
        # A query case excludes itself: only 39 cases remain at k=40.
        self.assertEqual(row['status'][1], 'insufficient_cases')
        self.assertEqual(scan(distances, order, groups, y, 20)['status'][1], 'ok')

    def test_nearest_answering_visit_and_query_exclusion(self):
        groups = np.array([0, 1, 1, 2, 3, 0, 4, 4, -1])
        y = np.array([1, 0, 1, 1, 0, 1, np.nan, 1, 1])
        d = np.tile(np.arange(len(y)), (len(y), 1))
        order = np.tile(np.arange(len(y)), (len(y), 1))
        row = scan(d, order, groups, y, 2)
        # Person 1 contributes nearest negative, not their farther positive.
        # Query person 0 contributes neither of their two positive visits.
        self.assertEqual(row['values'][0], 2/4)
        self.assertEqual(row['support']['radius'][0], 7)
        self.assertEqual(row['support']['participantCount'][0], 4)
        self.assertEqual(row['status'][-1], 'unknown_participant')
        self.assertIsNone(row['support']['participantCount'][-1])

    def test_missing_not_negative_and_exact_cutoff(self):
        groups = np.arange(5)
        y = np.array([0, np.nan, 0, 1, 1])
        order = np.tile(np.arange(5), (5, 1))
        d = np.zeros((5, 5))
        row = scan(d, order, groups, y, 1)
        self.assertEqual(row['values'][0], .5)
        self.assertEqual(row['support']['radius'][0], 0)
        self.assertEqual(row['support']['caseParticipantCount'][0], 1)

    def test_insufficient_cases_not_fallback(self):
        groups = np.array([0, 1, 1, 2])
        y = np.ones(4)
        row = scan(np.zeros((4, 4)), np.tile(np.arange(4), (4, 1)), groups, y, 3)
        self.assertEqual(row['status'][0], 'insufficient_cases')
        self.assertIsNone(row['values'][0])
        self.assertIsNone(row['support']['radius'][0])
        self.assertEqual(row['support']['caseParticipantCount'][0], 2)
        self.assertEqual(row['support']['participantCount'][0], 2)


if __name__ == '__main__':
    unittest.main()
