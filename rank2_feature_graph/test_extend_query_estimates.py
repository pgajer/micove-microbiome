"""Query-only estimation uses the same people, scopes and stopping rules."""
import unittest
import numpy as np
from extend_query_estimates import answering_people, estimate


class QueryEstimates(unittest.TestCase):
    def test_nearest_answering_visit_not_nearest_positive_visit(self):
        groups = np.array([-1, 1, 1, 2, 3, 3, 4])
        y = np.array([1., np.nan, 0., 1., 0., 1., 1.])
        selected = answering_people(np.arange(7), groups, y)
        self.assertEqual(selected.tolist(), [2, 3, 4, 6])
        raw = estimate(selected, np.arange(7), y, True, 'nearest-case-raw', 2)
        corrected = estimate(selected, np.arange(7), y, True, 'nearest-case-corrected', 2)
        self.assertEqual(raw['value'], 2/4)
        self.assertEqual(corrected['value'], 1/3)
        self.assertEqual(raw['support']['radius'], 6)
        self.assertEqual(estimate(selected, np.arange(7), y, True, 'knn', 3)['value'], 1/3)

    def test_known_query_excludes_every_visit_and_scope_stays_fixed(self):
        groups = np.array([0, 1, 1, 2, -1])
        y = np.arange(5.)
        anchors = np.array([0, 0, 1, 1, 1])
        selected = answering_people(np.arange(5), groups, y, 1, anchors, 1)
        self.assertEqual(selected.tolist(), [3])
        outside = estimate(selected, np.arange(5), y, False, 'knn', 10, outside=True)
        self.assertEqual(outside['status'], 'outside_scope')
        self.assertTrue(all(v is None for v in outside['support'].values()))

    def test_insufficient_support_is_not_filled_or_resized(self):
        y = np.array([0., 1.])
        for method, status in [('knn', 'insufficient_neighbors'), ('nearest-case-raw', 'insufficient_cases')]:
            r = estimate(np.arange(2), np.arange(2.), y, True, method, 5)
            self.assertIsNone(r['value'])
            self.assertEqual(r['status'], status)
            self.assertEqual(r['support']['participantCount'], 2)
            self.assertEqual(r['support']['caseParticipantCount'], 1)
            self.assertIsNone(r['support']['radius'])


if __name__ == '__main__':
    unittest.main()
