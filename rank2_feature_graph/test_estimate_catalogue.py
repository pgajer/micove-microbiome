"""Synthetic boundary checks; no private measurements or fitting required."""
import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from estimate_catalogue import checked_file, load_catalogue, order_hash, read_json, validate_manifest


class EstimateCatalogueTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.ids = ['specimen-' + str(i) for i in range(6)]
        self.expected = dict(datasetId='synthetic', datasetRevision='release-1',
                             analysisRevision='analysis-1', sampleCount=6, featureCount=3,
                             sampleOrderSha256=order_hash(self.ids),
                             featureOrderSha256=order_hash(['taxon-a', 'taxon-b', 'taxon-c']))
        transformation = dict(id='raw', label='Untransformed', formulaTex='T(y)=y',
                              description='Average the untransformed target.', outputUnit='fraction',
                              zeroPolicy='Zero is an observed value.', parameters={})
        features = [dict(id=name, categoryId='assay', label=name, description='Synthetic target',
                         unit='fraction', valueType=kind, transformations=[copy.deepcopy(transformation)])
                    for name, kind in [('signal', 'continuous'), ('detection', 'binary')]]
        estimation = dict(trainingPopulation='Eligible linked observations', queryPopulation='All records',
                          weighting='One vote per participant', queryExclusion='Query is excluded',
                          participantExclusion='All records of the query participant are excluded',
                          tiePolicy='Deterministic frozen ID hash order')
        counts = dict(trainingObservations=5, trainingParticipants=4, queryCount=6,
                      availableEstimateCount=5)
        self.series = [dict(id='series-' + f, featureId=f, transformationId='raw', geometryId='l1-euclidean',
                            estimatorId='knn', estimatorLabel='k-nearest-neighbor mean', k=2,
                            kMeaning='neighbors', scopeId='all', resultKind='leave-participant-out field',
                            quantityLabel='Estimated ' + f, unit='fraction', shardId=f,
                            valueDomain=d, estimation=copy.deepcopy(estimation), counts=copy.deepcopy(counts))
                       for f, d in [('signal', 'real'), ('detection', 'probability')]]
        self.manifest = dict(format='micove-estimate-catalogue', version=1, **self.expected,
                             revision='catalogue-1', categories=[dict(id='assay', label='Assays', description='Synthetic assays')],
                             geometries=[dict(id='l1-euclidean', label='L1-normalized Euclidean',
                                              normalization='Divide counts by their taxon sum', distance='Euclidean in full coordinates')],
                             features=features, series=self.series, shards=[],
                             supportDefinitions={'participantCount': 'Number of distinct eligible neighbors'})
        self.shards = {}
        for feature in ['signal', 'detection']:
            self.shards[feature] = dict(format='micove-estimate-shard', version=1,
                datasetId='synthetic', catalogueRevision='catalogue-1',
                sampleOrderSha256=self.expected['sampleOrderSha256'],
                series={'series-' + feature: dict(values=[0, .2, .6, 1, .4, None],
                    status=['ok'] * 5 + ['unknown_participant'],
                    support={'participantCount': [2] * 5 + [None]})})
        self.write()

    def descriptor(self, filename, data):
        raw = json.dumps(data, separators=(',', ':'), allow_nan=False).encode()
        (self.root / filename).parent.mkdir(exist_ok=True, parents=True)
        (self.root / filename).write_bytes(raw)
        return dict(file=filename, sha256=hashlib.sha256(raw).hexdigest(), bytes=len(raw))

    def write(self):
        self.manifest['sampleOrder'] = self.descriptor('sample-order.json', {'sampleIds': self.ids})
        self.manifest['shards'] = [dict(id=k, **self.descriptor('features/' + k + '.json', v))
                                   for k, v in self.shards.items()]
        (self.root / 'manifest.json').write_text(json.dumps(self.manifest, allow_nan=False))

    def load(self):
        return load_catalogue(self.root, self.expected)

    def correlation_fixture(self, change=None):
        bank=dict(format='micove-estimate-correlations', version=1, revision='correlations-1',
                  datasetId='synthetic', catalogueRevision='catalogue-1',
                  sampleOrderSha256=self.expected['sampleOrderSha256'], k=2, unit='visits', method='spearman',
                  records=5, participants=4, featureIndices=[0,1], excluded=[],
                  correlations=[.3], linkage=[[0,1,.7,2]], order=[0,1])
        if change:change(bank)
        self.manifest['correlations']=dict(version=1, revision='correlations-1', records=5, participants=4,
            fields=[dict(featureId=f['id'], categoryId='assay', transformationId='raw', transformationLabel='Raw',
                         seriesIds={'2':'series-'+f['id']}) for f in self.manifest['features']],
            banks=[dict(id='2-visits-spearman',k=2,unit='visits',method='spearman',
                        **self.descriptor('correlations/bank.json',bank))])
        self.write()

    def test_correlation_extension_is_additive(self):
        before=copy.deepcopy(self.shards)
        self.correlation_fixture()
        self.load()
        self.assertEqual(before,self.shards)

    def selection_input_fixture(self, change=None):
        import base64, struct
        self.correlation_fixture()
        data=dict(format='micove-correlation-inputs',version=1,revision='input-1',
                  datasetId='synthetic',catalogueRevision='catalogue-1',sampleOrderSha256=self.expected['sampleOrderSha256'],
                  k=2,encoding='float64-le-feature-major',featureIds=[f['id'] for f in self.manifest['features']],
                  recordIndices=[0,1,2,3,4],participantGroups=[0,0,1,2,3],
                  valuesBase64=base64.b64encode(struct.pack('<10d',*range(10))).decode())
        if change:change(data)
        self.manifest['correlations']['selectionInputs']=dict(revision='input-1',banks=[
            dict(id='selection-2',k=2,**self.descriptor('correlations/input.json',data))])
        self.write()

    def test_selection_inputs_match_identity_order_and_common_support(self):
        self.selection_input_fixture();self.load()
        for change,message in [(lambda d:d.update(recordIndices=[0,0,2,3,4]),'records'),
                               (lambda d:d.update(featureIds=list(reversed(d['featureIds']))),'feature order'),
                               (lambda d:d.update(valuesBase64='AAAA'),'dimensions'),
                               (lambda d:d.update(participantGroups=[0]*5),'participants')]:
            self.selection_input_fixture(change)
            with self.assertRaisesRegex(ValueError,message):self.load()

    def test_correlation_mismatched_population_rejected(self):
        self.correlation_fixture(lambda b:b.update(sampleOrderSha256='0'*64))
        with self.assertRaisesRegex(ValueError,'identity'):self.load()

    def test_correlation_invalid_matrix_rejected(self):
        self.correlation_fixture(lambda b:b.update(correlations=[1.1]))
        with self.assertRaisesRegex(ValueError,'matrix'):self.load()

    def test_correlation_missing_exclusion_rejected(self):
        self.correlation_fixture(lambda b:b.update(featureIndices=[0],correlations=[],linkage=[],order=[0]))
        with self.assertRaisesRegex(ValueError,'exclusions'):self.load()

    def test_correlation_bad_hierarchy_rejected(self):
        self.correlation_fixture(lambda b:b.update(linkage=[[0,2,.7,2]]))
        with self.assertRaisesRegex(ValueError,'children'):self.load()

    def reject(self, message):
        self.write()
        with self.assertRaisesRegex(ValueError, message):
            self.load()

    def row(self, name='signal'):
        return self.shards[name]['series']['series-' + name]

    def test_valid_zeros_and_missing_predictions_remain_distinct(self):
        manifest, summary = self.load()
        self.assertEqual(summary, dict(samples=6, features=2, series=2, shards=2))
        self.assertEqual(manifest['revision'], 'catalogue-1')
        self.assertEqual(self.row()['values'][0], 0)
        self.assertIsNone(self.row()['values'][-1])

    def test_response_reference_validation(self):
        ref = dict(mean=-2., participants=4, records=5, relativeMode='difference',
                   weighting='Equal participants', population='Full eligible reference')
        self.manifest['features'][0]['transformations'][0]['responseReference'] = ref
        self.write(); self.load()
        ref['relativeMode'] = 'ratio'
        self.reject('signed response reference')
        ref['relativeMode'] = 'difference'; ref['mean'] = True
        self.reject('invalid response reference mean')
        ref['mean'] = -2.; ref['participants'] = 7
        self.reject('invalid response reference definition')

    def test_swapped_ids_are_rejected_even_with_resealed_files(self):
        self.ids[0], self.ids[1] = self.ids[1], self.ids[0]
        self.reject('sample order')

    def test_duplicate_sample_ids_are_rejected(self):
        self.ids[-1] = self.ids[0]
        self.reject('sample order')

    def test_wrong_dataset_and_changed_reference_are_rejected(self):
        for key in ['datasetId', 'datasetRevision', 'analysisRevision', 'featureOrderSha256']:
            old = self.manifest[key]
            self.manifest[key] = 'different'
            self.reject('dataset identity')
            self.manifest[key] = old

    def test_missingness_cannot_be_encoded_as_zero(self):
        self.row()['values'][-1] = 0
        self.reject('value/status mismatch')

    def test_probability_domain_is_enforced_without_clipping(self):
        self.row('detection')['values'][0] = 1.01
        self.reject('probability outside')

    def test_negative_continuous_targets_are_supported(self):
        self.row()['values'][0] = -3.2
        self.write()
        self.load()

    def test_boolean_probability_is_not_numeric(self):
        self.row('detection')['values'][0] = True
        self.reject('value/status mismatch')

    def test_statuses_must_be_defined(self):
        self.row()['status'][-1] = 'mystery'
        self.reject('undefined status')
        self.manifest['statusCodes'] = {'mystery': 'An audited unsupported query'}
        self.write()
        self.load()

    def test_array_length_and_availability_counts(self):
        self.row()['values'].pop()
        self.reject('array length')
        self.row()['values'].append(None)
        self.series[0]['counts']['availableEstimateCount'] = 6
        self.reject('available-estimate count')

    def test_sample_counts_do_not_substitute_for_participant_counts(self):
        self.series[0]['counts']['trainingParticipants'] = 6
        self.reject('training/case counts')

    def test_scope_keeps_other_records_null(self):
        self.manifest['scopes'] = [dict(id='anchor', description='Synthetic fixed anchor membership', recordIndices=[0, 1])]
        self.series[0]['scopeId'] = 'anchor'
        self.reject('outside declared scope')
        self.row().update(values=[0, .2, None, None, None, None],
                          status=['ok', 'ok'] + ['outside_scope'] * 4,
                          support={'participantCount': [2, 2] + [None] * 4})
        self.series[0]['counts']['availableEstimateCount'] = 2
        self.write()
        self.load()

    def test_shared_policy_and_defaults_keep_explicit_overrides(self):
        policy = copy.deepcopy(self.series[0]['estimation'])
        policy['observationWeighting'] = policy.pop('weighting')
        policy['ties'] = policy.pop('tiePolicy')
        self.manifest['estimationPolicies'] = [dict(id='excluded', **policy)]
        self.manifest['seriesDefaults'] = dict(geometryId='l1-euclidean', k=3, estimationId='excluded')
        for item in self.series:
            del item['geometryId'], item['estimation']
        self.write()
        self.load()
        context = validate_manifest(self.manifest, self.expected)
        self.assertEqual(context['series']['series-signal']['k'], 2)
        self.assertEqual(context['series']['series-signal']['estimation']['weighting'], policy['observationWeighting'])
        self.manifest['estimationPolicies'][0]['weighting'] = 'A different weighting'
        self.reject('ambiguous estimation policy')

    def test_undefined_shared_policy_and_default_fields_are_rejected(self):
        del self.series[0]['estimation']
        self.series[0]['estimationId'] = 'missing'
        self.reject('unknown or ambiguous estimation policy')
        self.manifest['seriesDefaults'] = dict(sampleIds=['unexpected'])
        self.reject('unknown series default')

    def add_anchor_scope(self):
        anchors = [1, 2, 3, 1, 2, None]
        self.expected['anchorOrderSha256'] = {'pure-1cst': order_hash(['null' if a is None else str(a) for a in anchors])}
        payload = dict(datasetId='synthetic', sampleOrderSha256=self.expected['sampleOrderSha256'],
                       anchorFeatureIds=anchors)
        self.manifest['anchorAssignments'] = [dict(id='pure-1cst', **self.descriptor('pure-anchors.json', payload))]
        self.manifest['scopes'] = [dict(id='within-pure-1cst', type='query-anchor',
            description='Same-anchor neighborhoods, excluding self ratios',
            anchorAssignmentId='pure-1cst', excludeFeatureAnchor=True)]
        self.manifest['features'][0]['featureIndex'] = 0
        self.series[0]['scopeId'] = 'within-pure-1cst'
        return payload

    def test_query_anchor_excludes_self_ratios_without_dropping_records(self):
        self.add_anchor_scope()
        self.reject('outside declared scope')
        self.row().update(values=[None, .2, .6, None, .4, None],
                          status=['outside_scope', 'ok', 'ok', 'outside_scope', 'ok', 'outside_scope'],
                          support={'participantCount': [None, 2, 2, None, 2, None]})
        self.series[0]['counts']['availableEstimateCount'] = 3
        self.write()
        self.load()

    def test_query_anchor_requires_reviewed_assignments(self):
        payload = self.add_anchor_scope()
        payload['anchorFeatureIds'][0] = 2
        self.manifest['anchorAssignments'] = [dict(id='pure-1cst', **self.descriptor('pure-anchors.json', payload))]
        self.reject('anchor order differs')
        self.expected.pop('anchorOrderSha256')
        self.reject('independently reviewed order hash')

    def test_unknown_participants_cannot_have_support_and_case_counts_are_bounded(self):
        self.row()['support']['participantCount'][-1] = 2
        self.reject('support must be null')
        self.row()['support']['participantCount'][-1] = None
        self.manifest['supportDefinitions']['caseParticipantCount'] = 'Distinct positive neighbors'
        self.row()['support']['caseParticipantCount'] = [3] * 5 + [None]
        self.reject('inconsistent support counts')

    def test_extra_records_and_raw_metadata_are_rejected(self):
        self.row()['rawClinicalAnswers'] = [1] * 6
        self.reject('unexpected fields')

    def test_support_needs_definitions_and_valid_counts(self):
        self.row()['support']['unknownSupport'] = [1] * 6
        self.reject('support arrays need definitions')
        del self.row()['support']['unknownSupport']
        self.row()['support']['participantCount'][0] = 1.5
        self.reject('support count')

    def test_silent_duplicate_menu_combinations_are_rejected(self):
        duplicate = copy.deepcopy(self.series[0]); duplicate['id'] = 'duplicate'
        self.series.append(duplicate)
        self.reject('ambiguous duplicate')

    def test_stale_and_missing_shards_are_rejected(self):
        self.shards['signal']['catalogueRevision'] = 'old'
        self.reject('shard identity')
        self.shards['signal']['catalogueRevision'] = 'catalogue-1'
        del self.shards['signal']['series']['series-signal']
        self.reject('series inventory')

    def test_hashes_and_path_confinement(self):
        descriptor = self.manifest['sampleOrder']
        (self.root / descriptor['file']).write_text('modified')
        with self.assertRaisesRegex(ValueError, 'integrity mismatch'):
            self.load()
        for name in ['../outside.json', '/outside.json', 'a/../../outside.json', 'a\\b.json']:
            with self.assertRaisesRegex(ValueError, 'inside the export directory'):
                checked_file(self.root, {**descriptor, 'file': name})
        external = self.root.parent / (self.root.name + '-outside.json')
        external.write_text('{}'); self.addCleanup(external.unlink)
        (self.root / 'link.json').symlink_to(external)
        with self.assertRaisesRegex(ValueError, 'escapes'):
            checked_file(self.root, {**descriptor, 'file': 'link.json'})

    def test_strict_json(self):
        for raw in ['{"id":1,"id":2}', '[NaN]', '[Infinity]', '[1e999]']:
            with self.assertRaises(ValueError):
                read_json(raw)


if __name__ == '__main__':
    unittest.main()
