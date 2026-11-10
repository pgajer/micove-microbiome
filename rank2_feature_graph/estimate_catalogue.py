"""Validate a separately distributed catalogue of exploratory color fields.

This module performs no statistical estimation, admission or imputation. The
caller supplies a trusted identity receipt for the existing dataset release.
"""
import argparse
import array
import base64
import hashlib
import json
import math
from pathlib import Path, PurePosixPath
import re
import sys


HASH = re.compile(r'[a-f0-9]{64}')
IDENTITY_FIELDS = ('datasetId', 'datasetRevision', 'analysisRevision',
                   'sampleCount', 'sampleOrderSha256', 'featureOrderSha256')
STATUS_CODES = {
    'ok': 'Estimate available',
    'outside_scope': 'Outside the declared estimation scope',
    'unknown_participant': 'Participant identity is unavailable',
    'insufficient_neighbors': 'Too few eligible neighbors',
    'insufficient_cases': 'Too few eligible case participants',
    'invalid_input': 'Input is not valid for this estimate',
    'unsupported_transform': 'Transformation is undefined',
}
SERIES_DEFAULT_FIELDS = {
    'geometryId', 'estimatorId', 'estimatorLabel', 'k', 'kMeaning', 'scopeId',
    'resultKind', 'quantityLabel', 'unit', 'valueDomain', 'estimationId',
}
POLICY_FIELDS = ('trainingPopulation', 'queryPopulation', 'weighting', 'queryExclusion',
                 'participantExclusion', 'tiePolicy')


def require(condition, message):
    if not condition:
        raise ValueError('Estimate catalogue: ' + message)


def text(value):
    return isinstance(value, str) and bool(value.strip())


def number(value):
    return type(value) in (int, float) and math.isfinite(value)


def integer(value, minimum=0):
    return type(value) is int and value >= minimum


def order_hash(strings):
    require(all(text(s) and '\n' not in s and '\r' not in s for s in strings),
            'invalid identity string')
    return hashlib.sha256(('\n'.join(strings) + '\n').encode()).hexdigest()


def read_json(raw):
    def unique(pairs):
        value = {}
        for key, item in pairs:
            require(key not in value, 'duplicate JSON key: ' + key)
            value[key] = item
        return value

    def invalid(value):
        raise ValueError('Estimate catalogue: non-finite JSON constant ' + value)

    def finite_float(value):
        result = float(value)
        require(math.isfinite(result), 'non-finite JSON number')
        return result

    return json.loads(raw, object_pairs_hook=unique, parse_constant=invalid,
                      parse_float=finite_float)


def indexed(rows, label):
    require(isinstance(rows, list), label + ' must be a list')
    result = {}
    for row in rows:
        require(isinstance(row, dict) and text(row.get('id')), label + ' needs an ID')
        require(row['id'] not in result, 'duplicate ' + label + ' ID: ' + row['id'])
        result[row['id']] = row
    return result


def estimation_policy(policy):
    require(isinstance(policy, dict), 'estimation policy must be an object')
    resolved = dict(policy)
    for alias, canonical in (('observationWeighting', 'weighting'), ('ties', 'tiePolicy')):
        if alias in resolved:
            require(canonical not in resolved or resolved[canonical] == resolved[alias],
                    'ambiguous estimation policy alias')
            resolved[canonical] = resolved[alias]
    require(all(text(resolved.get(k)) for k in POLICY_FIELDS), 'estimation policy is incomplete')
    return resolved


def checked_file(folder, descriptor):
    require(isinstance(descriptor, dict), 'file descriptor is missing')
    name, checksum, size = (descriptor.get(k) for k in ('file', 'sha256', 'bytes'))
    require(text(name) and '\\' not in name and not PurePosixPath(name).is_absolute()
            and all(p not in ('', '.', '..') for p in name.split('/')),
            'file path must stay inside the export directory')
    require(isinstance(checksum, str) and HASH.fullmatch(checksum) is not None
            and integer(size, 1), 'invalid file checksum or byte count')
    path = (folder / name).resolve()
    require(path.is_relative_to(folder.resolve()) and path.is_file(),
            'file is missing or escapes the export directory')
    raw = path.read_bytes()
    require(len(raw) == size and hashlib.sha256(raw).hexdigest() == checksum,
            'file integrity mismatch: ' + name)
    return raw


def validate_manifest(manifest, expected):
    require(isinstance(manifest, dict) and manifest.get('format') == 'micove-estimate-catalogue'
            and manifest.get('version') == 1, 'unsupported manifest format')
    require(all(k in expected and manifest.get(k) == expected[k] for k in IDENTITY_FIELDS),
            'dataset identity differs from the reviewed population')
    n = manifest['sampleCount']
    require(integer(n, 1) and text(manifest.get('revision')), 'missing count or revision')
    categories = indexed(manifest.get('categories'), 'category')
    geometries = indexed(manifest.get('geometries'), 'geometry')
    features = indexed(manifest.get('features'), 'feature')
    raw_series = indexed(manifest.get('series'), 'series')
    defaults = manifest.get('seriesDefaults', {})
    require(isinstance(defaults, dict) and set(defaults) <= SERIES_DEFAULT_FIELDS,
            'unknown series default')
    series = {key: {**defaults, **item} for key, item in raw_series.items()}
    shards = indexed(manifest.get('shards'), 'shard')
    require(bool(categories and geometries and features and series and shards), 'empty catalogue')
    for category in categories.values():
        require(text(category.get('label')) and text(category.get('description')),
                'category needs a label and description')
    for geometry in geometries.values():
        require(all(text(geometry.get(k)) for k in ('label', 'normalization', 'distance')),
                'geometry needs normalization and distance definitions')
        if 'profileRepresentationId' in geometry:
            descriptor = next((d for d in manifest.get('profileEmbeddings', [])
                               if d['id'] == geometry['profileRepresentationId']), None)
            require(descriptor and descriptor.get('exclusionPolicyId')
                    and descriptor.get('weighting') in ('features', 'groups'),
                    'profile outcome geometry needs an outcome-excluded representation')
            require(isinstance(geometry.get('inputMatrixSha256'), str)
                    and re.fullmatch(r'[0-9a-f]{64}', geometry['inputMatrixSha256']),
                    'profile outcome geometry needs its input matrix checksum')
    transformations = {}
    for feature in features.values():
        require(feature.get('categoryId') in categories, 'unknown feature category')
        require(all(text(feature.get(k)) for k in ('label', 'description', 'unit'))
                and feature.get('valueType') in ('continuous', 'binary'), 'incomplete feature definition')
        if 'featureIndex' in feature:
            require(integer(feature['featureIndex']) and feature['featureIndex'] < expected['featureCount'],
                    'taxon feature index is outside the dictionary')
        transforms = indexed(feature.get('transformations'), 'transformation')
        require(bool(transforms), 'feature has no transformations')
        for transform in transforms.values():
            require(all(text(transform.get(k)) for k in
                        ('label', 'formulaTex', 'description', 'outputUnit', 'zeroPolicy'))
                    and isinstance(transform.get('parameters'), dict),
                    'incomplete transformation definition')
            if 'responseReference' in transform:
                ref = transform['responseReference']
                require(isinstance(ref, dict) and integer(ref.get('participants'))
                        and integer(ref.get('records')) and ref['participants'] <= ref['records'] <= manifest['sampleCount']
                        and ref.get('relativeMode') in ('ratio', 'difference')
                        and text(ref.get('weighting')) and text(ref.get('population')),
                        'invalid response reference definition')
                mean = ref.get('mean')
                require((mean is None and ref['participants'] == 0) or
                        (isinstance(mean, (float, int)) and not isinstance(mean, bool) and math.isfinite(mean)
                         and ref['participants'] > 0), 'invalid response reference mean')
                require(ref['relativeMode'] != 'ratio' or mean is None or mean >= 0,
                        'signed response reference cannot use ratio')
        transformations[feature['id']] = transforms
    statuses = dict(STATUS_CODES)
    extra = manifest.get('statusCodes', {})
    require(isinstance(extra, dict) and all(text(k) and text(v) for k, v in extra.items()),
            'invalid status definitions')
    require(not any(k in statuses and v != statuses[k] for k, v in extra.items()),
            'built-in status meaning cannot be changed')
    statuses.update(extra)
    policies = {key: estimation_policy(policy) for key, policy in
                indexed(manifest.get('estimationPolicies', []), 'estimation policy').items()}
    assignments = indexed(manifest.get('anchorAssignments', []), 'anchor assignment')
    for key in assignments:
        checksum = expected.get('anchorOrderSha256', {}).get(key)
        require(isinstance(checksum, str) and HASH.fullmatch(checksum) is not None,
                'anchor assignment needs an independently reviewed order hash')
    if assignments:
        require(integer(expected.get('featureCount'), 1), 'anchor assignments need a feature count')
    scopes = indexed(manifest.get('scopes', []), 'scope')
    require('all' not in scopes, 'all is a reserved scope ID')
    for scope in scopes.values():
        require(text(scope.get('description')), 'scope needs a description')
        if scope.get('type') == 'query-anchor':
            require(scope.get('anchorAssignmentId') in assignments
                    and type(scope.get('excludeFeatureAnchor')) is bool,
                    'invalid query-anchor scope')
            continue
        require(scope.get('type', 'records') == 'records', 'unknown scope type')
        indices = scope.get('recordIndices')
        require(isinstance(indices, list)
                and all(integer(i) and i < n for i in indices)
                and len(set(indices)) == len(indices), 'invalid scope membership')
    support = manifest.get('supportDefinitions', {})
    require(isinstance(support, dict) and all(text(k) and text(v) for k, v in support.items()),
            'invalid support definitions')
    combinations = set()
    for item in series.values():
        require(item.get('featureId') in features and item.get('geometryId') in geometries
                and item.get('shardId') in shards, 'unknown series feature, geometry or shard')
        require(item.get('transformationId') in transformations[item['featureId']],
                'unknown series transformation')
        require(item.get('scopeId') == 'all' or item.get('scopeId') in scopes, 'undefined series scope')
        require(all(text(item.get(k)) for k in
                    ('estimatorId', 'estimatorLabel', 'resultKind', 'quantityLabel', 'unit')),
                'incomplete series description')
        require(integer(item.get('k'), 1) and item.get('kMeaning') in ('neighbors', 'case_participants'),
                'k needs a positive integer and an explicit counting unit')
        require(item.get('valueDomain') in ('probability', 'nonnegative', 'real'), 'unknown value domain')
        if geometries[item['geometryId']].get('profileRepresentationId'):
            require(features[item['featureId']]['valueType'] == 'binary'
                    and item['valueDomain'] == 'probability' and item['k'] in (5, 10, 20, 40)
                    and item['kMeaning'] == 'case_participants'
                    and item['estimatorId'] == 'nearest-case-raw',
                    'profile outcome fields require binary nearest-case k in 5, 10, 20, 40')
        if 'referenceValue' in item:
            require(number(item['referenceValue']) and text(item.get('referenceLabel')),
                    'reference value needs a finite value and label')
        if 'estimationId' in item:
            require('estimation' not in item and item['estimationId'] in policies,
                    'unknown or ambiguous estimation policy')
            item['estimation'] = policies[item['estimationId']]
        item['estimation'] = estimation_policy(item.get('estimation', {}))
        counts = item.get('counts', {})
        require(isinstance(counts, dict) and all(integer(counts.get(k)) for k in
                ('trainingObservations', 'queryCount', 'availableEstimateCount'))
                and counts['availableEstimateCount'] <= counts['queryCount'] <= n,
                'invalid series counts')
        for field in ('trainingParticipants', 'positiveObservations', 'positiveParticipants'):
            if field in counts:
                require(counts[field] is None or integer(counts[field]), 'invalid count: ' + field)
        for smaller, larger in (('trainingParticipants', 'trainingObservations'),
                                ('positiveObservations', 'trainingObservations'),
                                ('positiveParticipants', 'trainingParticipants')):
            if counts.get(smaller) is not None and counts.get(larger) is not None:
                require(counts[smaller] <= counts[larger], 'inconsistent training/case counts')
        key = tuple(item[k] for k in ('featureId', 'transformationId', 'geometryId', 'estimatorId',
                                     'k', 'scopeId', 'resultKind'))
        require(key not in combinations, 'ambiguous duplicate selector combination')
        combinations.add(key)
        scope = scopes.get(item['scopeId'], {})
        if scope.get('type') == 'query-anchor' and scope['excludeFeatureAnchor']:
            require(integer(features[item['featureId']].get('featureIndex')),
                    'query-anchor exclusion needs the target taxon feature index')
    require(set(shards) == {s['shardId'] for s in series.values()}, 'unreferenced shard')
    extension = manifest.get('supplementaryEstimates')
    if extension is not None:
        require(isinstance(extension, dict) and extension.get('version') == 1
                and text(extension.get('policy')), 'invalid supplementary estimate policy')
        queries, reference = extension.get('queryRecordIndices'), extension.get('colorReferenceIndices')
        require(isinstance(queries, list) and isinstance(reference, list)
                and queries and reference
                and all(integer(i) and i < manifest['sampleCount'] for i in queries+reference)
                and queries == sorted(set(queries)) and reference == sorted(set(reference))
                and not set(queries).intersection(reference)
                and set(queries+reference) == set(range(manifest['sampleCount'])),
                'supplementary estimate references must partition the records')
        require(extension.get('existingEstimatesUnchanged') is True
                and extension.get('embeddingsUnchanged') is True
                and extension.get('referencePopulationsUnchanged') is True,
                'supplementary estimates must preserve the frozen reference')
    return dict(series=series, shards=shards, statuses=statuses, scopes=scopes, support=support,
                features=features, assignments=assignments)


def load_anchors(folder, manifest, expected, context):
    """Check query-dependent scopes without recomputing states or fitting models."""
    anchors = {}
    for key, descriptor in context['assignments'].items():
        data = read_json(checked_file(folder, descriptor))
        require(isinstance(data, dict) and data.get('datasetId') == manifest['datasetId']
                and data.get('sampleOrderSha256') == manifest['sampleOrderSha256'],
                'anchor assignment identity differs')
        ids = data.get('anchorFeatureIds')
        require(isinstance(ids, list) and len(ids) == manifest['sampleCount']
                and all(i is None or integer(i, 1) and i <= expected['featureCount'] for i in ids),
                'invalid anchor feature IDs')
        # The literal string "null" preserves missing anchors in the ordered hash.
        require(order_hash(['null' if i is None else str(i) for i in ids])
                == expected['anchorOrderSha256'][key], 'anchor order differs from reviewed assignments')
        anchors[key] = ids
    return anchors


def query_scope(metadata, context):
    if metadata['scopeId'] == 'all':
        return None
    scope = context['scopes'][metadata['scopeId']]
    if scope.get('type') != 'query-anchor':
        return set(scope['recordIndices'])
    excluded = (context['features'][metadata['featureId']]['featureIndex'] + 1
                if scope['excludeFeatureAnchor'] else None)
    return {i for i, anchor in enumerate(context['anchors'][scope['anchorAssignmentId']])
            if anchor is not None and anchor != excluded}


def validate_shard(shard, descriptor, manifest, context):
    require(isinstance(shard, dict) and shard.get('format') == 'micove-estimate-shard'
            and shard.get('version') == 1, 'unsupported shard format')
    require(shard.get('datasetId') == manifest['datasetId']
            and shard.get('catalogueRevision') == manifest['revision']
            and shard.get('sampleOrderSha256') == manifest['sampleOrderSha256'],
            'shard identity differs')
    rows = shard.get('series')
    selected = {k: v for k, v in context['series'].items() if v['shardId'] == descriptor['id']}
    require(isinstance(rows, dict) and set(rows) == set(selected), 'shard series inventory differs')
    n = manifest['sampleCount']
    for key, metadata in selected.items():
        row = rows[key]
        require(isinstance(row, dict) and set(row) <= {'values', 'status', 'support'},
                'unexpected fields in estimate row')
        values, statuses = row.get('values'), row.get('status')
        require(isinstance(values, list) and isinstance(statuses, list)
                and len(values) == len(statuses) == n, 'estimate/status array length differs')
        scope = query_scope(metadata, context)
        for i, (value, status) in enumerate(zip(values, statuses)):
            require(isinstance(status, str) and status in context['statuses'], 'undefined status code')
            require((number(value) if status == 'ok' else value is None), 'value/status mismatch')
            if scope is not None and i not in scope:
                require(status == 'outside_scope', 'estimate outside declared scope')
            if status == 'ok':
                domain = metadata['valueDomain']
                require(domain != 'probability' or 0 <= value <= 1, 'probability outside [0, 1]')
                require(domain != 'nonnegative' or value >= 0, 'negative value in nonnegative field')
        require(statuses.count('ok') == metadata['counts']['availableEstimateCount'],
                'available-estimate count differs')
        arrays = row.get('support', {})
        require(isinstance(arrays, dict) and set(arrays) <= set(context['support']),
                'support arrays need definitions')
        for name, array in arrays.items():
            require(isinstance(array, list) and len(array) == n, 'support array length differs')
            require(all(v is None or (number(v) and v >= 0) for v in array), 'invalid support value')
            if name in ('neighborCount', 'participantCount', 'caseParticipantCount'):
                require(all(v is None or integer(v) for v in array), 'support count is not an integer')
            require(all(v is None for v, status in zip(array, statuses)
                        if status in ('unknown_participant', 'outside_scope')),
                    'support must be null outside scope or without participant identity')
        for smaller, larger in (('caseParticipantCount', 'participantCount'),
                                ('participantCount', 'neighborCount')):
            if smaller in arrays and larger in arrays:
                require(all(a is None or b is None or a <= b
                            for a, b in zip(arrays[smaller], arrays[larger])),
                        'inconsistent support counts')
    return len(selected)


def validate_correlations(folder, manifest, context):
    """Validate the optional, independently versioned descriptive field banks."""
    item = manifest.get('correlations')
    if item is None:
        return
    require(isinstance(item, dict) and item.get('version') == 1 and text(item.get('revision')),
            'invalid correlation catalogue')
    fields, banks = item.get('fields'), item.get('banks')
    require(isinstance(fields, list) and bool(fields) and isinstance(banks, list) and bool(banks),
            'empty correlations')
    features = {f['id']: f for f in manifest['features']}
    require(len({f.get('featureId') for f in fields}) == len(fields), 'duplicate correlation feature')
    for f in fields:
        source = features.get(f.get('featureId'))
        require(source and source['categoryId'] == f.get('categoryId') and text(f.get('transformationLabel')),
                'unknown correlation feature/group')
        for k, series_id in f.get('seriesIds', {}).items():
            s = context['series'].get(series_id)
            require(s and s['featureId'] == f['featureId'] and s['transformationId'] == f.get('transformationId')
                    and s.get('estimatorId') == 'knn' and str(s.get('k')) == k and s.get('scopeId') in ('global', 'all'),
                    'correlation series differs')
    identities = set()
    for descriptor in banks:
        key = (descriptor.get('k'), descriptor.get('unit'), descriptor.get('method'))
        require(integer(key[0], 1) and key[1] in ('visits', 'participants') and key[2] in ('spearman', 'pearson')
                and key not in identities, 'invalid/duplicate correlation bank')
        identities.add(key)
        require(all(str(key[0]) in f.get('seriesIds', {}) for f in fields), 'correlation series missing')
        bank = read_json(checked_file(folder, descriptor))
        require(bank.get('format') == 'micove-estimate-correlations' and bank.get('version') == 1
                and bank.get('revision') == item['revision'] and bank.get('catalogueRevision') == manifest['revision']
                and bank.get('datasetId') == manifest['datasetId']
                and bank.get('sampleOrderSha256') == manifest['sampleOrderSha256']
                and (bank.get('k'), bank.get('unit'), bank.get('method')) == key,
                'correlation identity differs')
        require(integer(bank.get('records'), 3) and bank['records'] <= manifest['sampleCount']
                and integer(bank.get('participants'), 3) and bank['participants'] <= bank['records']
                and bank['records'] == item.get('records') and bank['participants'] == item.get('participants'),
                'invalid correlation counts')
        indices, excluded = bank.get('featureIndices'), bank.get('excluded')
        require(isinstance(indices, list) and all(integer(i) and i < len(fields) for i in indices)
                and len(indices) == len(set(indices)) and isinstance(excluded, list), 'invalid correlation indices')
        ex = [f.get('featureIndex') for f in excluded]
        require(all(integer(i) for i in ex) and len(set(ex)) == len(ex)
                and not set(indices).intersection(ex) and set(indices + ex) == set(range(len(fields)))
                and all(text(f.get('reason')) for f in excluded), 'incomplete correlation exclusions')
        n = len(indices)
        values, tree, order = bank.get('correlations'), bank.get('linkage'), bank.get('order')
        require(isinstance(values, list) and len(values) == n * (n-1)//2
                and all(number(r) and -1 <= r <= 1 for r in values), 'invalid correlation matrix')
        require(isinstance(order, list) and all(integer(i) for i in order) and sorted(order) == list(range(n)),
                'invalid correlation order')
        require(isinstance(tree, list) and len(tree) == max(0, n-1), 'invalid correlation hierarchy')
        sizes = [1] * n
        used = set()
        for row in tree:
            require(isinstance(row, list) and len(row) == 4 and all(number(v) for v in row), 'invalid linkage row')
            a, b, distance, size = row
            require(a == int(a) and b == int(b) and 0 <= a < len(sizes) and 0 <= b < len(sizes)
                    and a != b and a not in used and b not in used and 0 <= distance <= 2
                    and size == sizes[int(a)] + sizes[int(b)], 'invalid linkage children')
            used.update((a, b)); sizes.append(int(size))
    selection = item.get('selectionInputs')
    if selection is not None:
        require(isinstance(selection, dict) and text(selection.get('revision')), 'invalid correlation input revision')
        descriptors = selection.get('banks')
        require(isinstance(descriptors, list) and len(descriptors) == len({b['k'] for b in banks}), 'incomplete correlation inputs')
        seen = set()
        common = None
        for descriptor in descriptors:
            k = descriptor.get('k')
            require(k in {b['k'] for b in banks} and k not in seen, 'invalid correlation input K')
            seen.add(k)
            data = read_json(checked_file(folder, descriptor))
            require(data.get('format') == 'micove-correlation-inputs' and data.get('version') == 1
                    and data.get('revision') == selection['revision'] and data.get('k') == k
                    and data.get('datasetId') == manifest['datasetId'] and data.get('catalogueRevision') == manifest['revision']
                    and data.get('sampleOrderSha256') == manifest['sampleOrderSha256'], 'correlation input identity differs')
            records, groups = data.get('recordIndices'), data.get('participantGroups')
            require(isinstance(records, list) and len(records) == item['records']
                    and all(integer(i) and i < manifest['sampleCount'] for i in records)
                    and records == sorted(set(records)), 'invalid correlation input records')
            require(isinstance(groups, list) and len(groups) == len(records)
                    and all(integer(g) for g in groups) and len(set(groups)) == item['participants'], 'invalid correlation participants')
            require(common is None or common == (records, groups), 'correlation input support differs')
            common = (records, groups)
            require(data.get('featureIds') == [f['featureId'] for f in fields]
                    and data.get('encoding') == 'float64-le-feature-major', 'correlation input feature order/encoding differs')
            try:
                raw = base64.b64decode(data.get('valuesBase64', ''), validate=True)
            except (ValueError, TypeError) as exc:
                raise ValueError('invalid correlation input encoding') from exc
            require(len(raw) == 8*len(records)*len(fields), 'correlation input dimensions differ')
            values = array.array('d'); values.frombytes(raw)
            if sys.byteorder != 'little': values.byteswap()
            require(all(math.isfinite(v) for v in values), 'nonfinite correlation inputs')
            if 'queryRecords' in data:
                queries = data['queryRecords']
                require(queries and queries == sorted(set(queries))
                        and all(integer(i) and i < manifest['sampleCount'] and i not in records for i in queries)
                        and text(data.get('queryPolicy')), 'invalid supplementary profile queries')
                try:
                    raw = base64.b64decode(data.get('queryValuesBase64', ''), validate=True)
                except (ValueError, TypeError) as exc:
                    raise ValueError('invalid supplementary profile encoding') from exc
                require(len(raw) == 8*len(queries)*len(fields), 'supplementary feature dimensions differ')
                values = array.array('d'); values.frombytes(raw)
                if sys.byteorder != 'little': values.byteswap()
                require(all(math.isfinite(v) for v in values), 'nonfinite supplementary fields')


def validate_correlation_exclusions(data):
    policy = data.get('exclusionPolicy')
    if policy is None:
        return
    require(isinstance(policy, dict) and text(policy.get('id')) and text(policy.get('label')),
            'invalid correlation exclusion policy')
    rows = policy.get('excluded', [])
    ids = {f['featureId'] for f in data['fields']}
    require(isinstance(rows, list) and rows and all(isinstance(r, dict)
            and r.get('featureId') in ids and text(r.get('reason')) for r in rows)
            and len({r['featureId'] for r in rows}) == len(rows), 'invalid excluded features')


def validate_supplementary_positions(data):
    """A map extension cannot silently redefine its original fit or reference."""
    extension = data.get('supplementary')
    if not extension:
        return len(data['recordIndices'])
    reference, queries = extension.get('referenceRecords'), extension.get('recordIndices')
    require(extension.get('version') == 1 and isinstance(reference, list) and reference
            and isinstance(queries, list) and queries
            and data['recordIndices'] == reference+queries and not set(reference).intersection(queries)
            and text(extension.get('policy')) and HASH.fullmatch(str(extension.get('parentSha256', '')))
            and extension.get('method') == 'fixed-reference relative-distance least squares',
            'invalid supplementary placement definition')
    import struct
    def matrix_hash(rows):
        digest = hashlib.sha256()
        for row in rows:
            digest.update(struct.pack('<'+'d'*len(row), *row))
        return digest.hexdigest()
    for key, field in [('coordinates', 'originalCoordinatesSha256'), ('profileScores', 'originalProfilesSha256')]:
        require(matrix_hash(data[key][:len(reference)]) == extension.get(field),
                'supplementary placement changed original '+key)
    require(matrix_hash(data['profileScores']) == extension.get('extendedProfilesSha256'), 'extended profile hash differs')
    original = extension.get('originalEvaluation', {})
    require(original.get('profiles') == len(reference) and number(original.get('relativeRms'))
            and original.get('pairs', -1)+original.get('zeroPairs', -1) == len(reference)*(len(reference)-1)//2,
            'original supplementary evaluation differs')
    diagnostics = extension.get('diagnostics', [])
    require([d.get('record') for d in diagnostics] == queries
            and all(d.get('success') is True and number(d.get('relativeRms')) for d in diagnostics)
            and number(extension.get('referencePairRelativeRms')), 'supplementary placement did not validate')
    return len(reference)


def validate_profile_embeddings(folder, manifest):
    """Validate optional frozen sample representations against estimate identities."""
    validate_correlation_exclusions(manifest.get('correlations', {}))
    descriptors = manifest.get('profileEmbeddings', [])
    require(isinstance(descriptors, list), 'profile embeddings must be a list')
    ids = set()
    for descriptor in descriptors:
        data = read_json(checked_file(folder, descriptor))
        require(data.get('format') == 'micove-joint-profile-embedding'
                and data.get('version') == 1 and text(data.get('id'))
                and data['id'] == descriptor.get('id') and data['id'] not in ids,
                'invalid profile embedding identity')
        ids.add(data['id'])
        require(all(data.get(k) == manifest.get(k) for k in
                    ('datasetId', 'sampleOrderSha256', 'sampleCount'))
                and data.get('catalogueRevision') == manifest['revision']
                and data.get('correlationRevision') == manifest.get('correlations', {}).get('revision'),
                'profile embedding dataset differs')
        for geometry in manifest.get('geometries', []):
            if geometry.get('profileRepresentationId') == data['id']:
                require(geometry['inputMatrixSha256'] == data.get('inputMatrixSha256')
                        and len(data.get('snapshot', {}).get('clusters', [])) == 38,
                        'profile outcome geometry matrix differs')
        records = data.get('recordIndices', [])
        require(records and all(integer(i) and i < manifest['sampleCount'] for i in records)
                and len(set(records)) == len(records), 'invalid profile record mapping')
        snapshot = data.get('snapshot', {})
        clusters = snapshot.get('clusters', [])
        require(clusters and all(integer(c.get('id'), 1) and c.get('members') for c in clusters)
                and len({c['id'] for c in clusters}) == len(clusters), 'invalid frozen clusters')
        fields = manifest['correlations']['fields']
        members = [i for c in clusters for i in c['members']]
        require(all(integer(i) and i < len(fields) for i in members)
                and len(set(members)) == len(members), 'overlapping or invalid profile features')
        if descriptor.get('exclusionPolicyId'):
            policy = manifest['correlations'].get('exclusionPolicy')
            require(policy and descriptor['exclusionPolicyId'] == policy['id']
                    and snapshot.get('exclusionPolicy') == policy, 'profile exclusion policy differs')
            excluded = {r['featureId'] for r in policy['excluded']}
            require(not any(fields[i]['featureId'] in excluded for i in members),
                    'excluded field entered profile embedding')
        reference_count = validate_supplementary_positions(data)
        require(snapshot.get('scope', {}).get('records') == reference_count
                and data.get('excludedRecords') == manifest['sampleCount'] - len(records)
                and data.get('weighting') in ('features', 'groups'), 'profile scope or weighting differs')
        if 'weighting' in descriptor:
            require(descriptor['weighting'] == data['weighting'],
                    'profile descriptor weighting differs')
        for key, width in [('coordinates', 3), ('profileScores', len(clusters))]:
            matrix = data.get(key)
            require(isinstance(matrix, list) and len(matrix) == len(records)
                    and all(isinstance(row, list) and len(row) == width
                            and all(number(v) for v in row) for row in matrix),
                    'invalid profile ' + key)
        require(all(0 <= v <= 100 for row in data['profileScores'] for v in row),
                'profile scores must be percentiles')
        settings, evaluation = data.get('settings', {}), data.get('evaluation', {})
        require(settings.get('dimension') == 3 and settings.get('backend') == 'sgd'
                and settings.get('weighting') == data['weighting']
                and settings.get('matrixSha256') == data.get('inputMatrixSha256'),
                'profile solver definition differs')
        require(number(evaluation.get('relativeRms')) and evaluation['relativeRms'] >= 0
                and evaluation.get('sampled') is False
                and evaluation.get('profiles') == len(records)
                and integer(evaluation.get('pairs'), 1) and integer(evaluation.get('zeroPairs'))
                and evaluation['pairs'] + evaluation['zeroPairs'] == len(records)*(len(records)-1)//2,
                'profile all-pairs evaluation differs')


def validate_smoothed_embeddings(folder, manifest):
    """Check separate taxonomic representations without redefining joint profiles."""
    descriptors = manifest.get('smoothedEmbeddings', [])
    require(isinstance(descriptors, list), 'smoothed embeddings must be a list')
    if not descriptors:
        return
    ids = {d['id'] for d in manifest.get('profileEmbeddings', [])}
    taxa = [f for f in manifest['features'] if f['categoryId'] == 'phylotypes']
    require(taxa and all(integer(f.get('featureIndex')) and text(f.get('sourceName')) for f in taxa),
            'smoothed phylotype dictionary is incomplete')
    taxa.sort(key=lambda f: f['featureIndex'])
    for descriptor in descriptors:
        data = read_json(checked_file(folder, descriptor))
        require(data.get('format') == 'micove-smoothed-phylotype-embedding'
                and data.get('version') == 1 and text(data.get('id'))
                and data['id'] == descriptor.get('id') and data['id'] not in ids,
                'invalid smoothed embedding identity')
        ids.add(data['id'])
        require(all(data.get(k) == manifest.get(k) for k in ('datasetId', 'sampleOrderSha256', 'sampleCount'))
                and data.get('catalogueRevision') == manifest['revision'], 'smoothed dataset differs')
        records = data.get('recordIndices', [])
        require(records and all(integer(i) and i < manifest['sampleCount'] for i in records)
                and len(set(records)) == len(records) and integer(data.get('participants'), 1)
                and data.get('excludedRecords') == manifest['sampleCount']-len(records), 'smoothed record mapping differs')
        require(data.get('featureIds') == [f['id'] for f in taxa]
                and data.get('featureNames') == [f['sourceName'] for f in taxa]
                and data.get('filtering') == 'none', 'smoothed phylotype set differs')
        require(data.get('K') == 40 and data.get('normalization') in ('l1', 'max')
                and isinstance(data.get('postMaxNormalization'), bool)
                and data.get('targetMetric') in ('euclidean', 'linf'), 'invalid smoothing definition')
        require(data.get('neighborMetric') == ('ambient-euclidean' if data['normalization'] == 'l1' else 'intrinsic-euclidean-faces'), 'smoothed neighbor metric differs')
        require(data['normalization'] != 'l1' or (not data['postMaxNormalization'] and data['targetMetric'] == 'euclidean'), 'invalid L1 smoothed variant')
        for key, width in [('coordinates', 3), ('profileScores', len(taxa))]:
            matrix = data.get(key)
            require(isinstance(matrix, list) and len(matrix) == len(records)
                    and all(isinstance(row, list) and len(row) == width and all(number(v) for v in row) for row in matrix), 'invalid smoothed '+key)
        validate_supplementary_positions(data)
        require(all(0 <= v <= 1+1e-12 for row in data['profileScores'] for v in row), 'invalid smoothed abundance range')
        if data['normalization'] == 'l1':
            require(all(abs(sum(row)-1) < 1e-10 for row in data['profileScores']), 'smoothed L1 closure differs')
        if data['postMaxNormalization']:
            require(all(abs(max(row)-1) < 1e-12 for row in data['profileScores']), 'smoothed maximum differs')
        settings, evaluation = data.get('settings', {}), data.get('evaluation', {})
        require(settings.get('dimension') == 3 and settings.get('backend') == 'sgd'
                and settings.get('targetMetric') == data['targetMetric']
                and HASH.fullmatch(str(data.get('inputMatrixSha256', '')))
                and settings.get('matrixSha256') == data.get('inputMatrixSha256'), 'smoothed solver definition differs')
        require(number(evaluation.get('relativeRms')) and evaluation['relativeRms'] >= 0
                and evaluation.get('sampled') is False and evaluation.get('profiles') == len(records)
                and integer(evaluation.get('pairs'), 1) and integer(evaluation.get('zeroPairs'))
                and evaluation['pairs']+evaluation['zeroPairs'] == len(records)*(len(records)-1)//2,
                'smoothed all-pairs evaluation differs')


def load_catalogue(folder, expected):
    """Check all assets while retaining only the small catalogue in memory."""
    folder = Path(folder)
    manifest = read_json((folder / 'manifest.json').read_bytes())
    context = validate_manifest(manifest, expected)
    sample_order = read_json(checked_file(folder, manifest.get('sampleOrder')))
    ids = sample_order.get('sampleIds') if isinstance(sample_order, dict) else None
    require(isinstance(ids, list) and all(text(s) for s in ids) and len(ids) == manifest['sampleCount']
            and len(set(ids)) == len(ids) and order_hash(ids) == manifest['sampleOrderSha256'],
            'sample order or identities differ')
    context['anchors'] = load_anchors(folder, manifest, expected, context)
    count = 0
    for descriptor in context['shards'].values():
        count += validate_shard(read_json(checked_file(folder, descriptor)), descriptor, manifest, context)
    validate_correlations(folder, manifest, context)
    validate_profile_embeddings(folder, manifest)
    validate_smoothed_embeddings(folder, manifest)
    return manifest, dict(samples=len(ids), features=len(manifest['features']),
                          series=count, shards=len(context['shards']))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('catalogue', type=Path)
    parser.add_argument('--identity', type=Path, required=True,
                        help='Trusted identity receipt for the existing dataset, not supplied by the catalogue')
    args = parser.parse_args()
    _, summary = load_catalogue(args.catalogue, read_json(args.identity.read_bytes()))
    print(json.dumps(dict(passed=True, **summary)))
