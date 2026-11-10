"""Numerical invariants of query-only estimation and fixed-map placement."""
import unittest
import numpy as np
from scipy.spatial.distance import cdist
from extend_profile_maps import (nearest_people, midpoint_percentiles,
    weighted_median, supplementary_position, evaluate)


class QueryPlacementTests(unittest.TestCase):
    def test_nearest_answering_people_and_unknown_queries(self):
        groups = np.array([-1, 0, 0, 1, 2, 3])
        y = np.array([1., np.nan, 4., 5., 6., 7.])
        self.assertEqual(nearest_people(range(6), groups, -1, y, 3).tolist(), [2, 3, 4])
        self.assertEqual(nearest_people(range(6), groups, 0, y, 3).tolist(), [3, 4, 5])

    def test_frozen_midpoint_percentiles_and_group_weighting(self):
        # Participant 0 has two visits; participant 1 has one.
        result = midpoint_percentiles(np.array([0., 2., 2.]), np.array([-1., 0., 1., 2., 3.]), [0, 0, 1])
        np.testing.assert_allclose(result, [0., 12.5, 25., 62.5, 100.])
        self.assertEqual(weighted_median(np.array([1., 3., 8.]), np.array([.25, .25, .5])), 5.5)

    def test_exact_supplementary_recovery_without_reference_motion(self):
        fixed = np.array([[0., 0., 0.], [1., 0., 0.], [0., 2., 0.], [0., 0., 3.], [2., 3., 4.]])
        copy = fixed.copy()
        truth = np.array([.2, .4, .7])
        position, diagnostic = supplementary_position(cdist([truth], fixed)[0], fixed)
        np.testing.assert_allclose(position, truth, atol=1e-9)
        np.testing.assert_array_equal(fixed, copy)
        self.assertLess(diagnostic['relativeRms'], 1e-10)

    def test_exact_duplicate_and_zero_distance_evaluation(self):
        fixed = np.array([[0., 0., 0.], [1., 0., 0.], [0., 1., 0.]])
        point, diagnostic = supplementary_position(cdist(fixed[:1], fixed)[0], fixed)
        np.testing.assert_array_equal(point, fixed[0])
        self.assertEqual(diagnostic['method'], 'exact duplicate')
        repeated = np.vstack([fixed, fixed[0]])
        result = evaluate(repeated, repeated, 'euclidean')
        self.assertEqual(result['zeroPairs'], 1)
        self.assertEqual(result['relativeRms'], 0)


if __name__ == '__main__':
    unittest.main()
