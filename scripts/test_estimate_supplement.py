"""Packaging boundary checks using synthetic catalogue and dataset identities."""
import base64
import copy
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

import portable as p
from estimate_supplement import attach, checked_catalogue
sys.path.insert(0, str(p.HERE))
from test_estimate_catalogue import EstimateCatalogueTests


class EstimatePackagingTests(unittest.TestCase):
    def setUp(self):
        self.fixture = EstimateCatalogueTests('test_valid_zeros_and_missing_predictions_remain_distinct')
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.folder = self.fixture.root
        self.web = self.folder / 'web'
        (self.web / 'vme-assets').mkdir(parents=True)
        self.digest = p.sha((self.folder / 'manifest.json').read_bytes())
        (self.folder / 'validation.json').write_text(json.dumps(dict(passed=True,
            manifestSha256=self.digest, revision='catalogue-1', features=2, series=2, sampleCount=6)))
        self.mapping = patch.dict('estimate_supplement.REVIEWED', {self.digest: {**self.fixture.expected, 'releaseStage': 'pilot'}})
        self.mapping.start(); self.addCleanup(self.mapping.stop)
        part = dict(participants={'synthetic': dict(analysisRevision='analysis-1',
            records=[dict(id=s) for s in self.fixture.ids], features=['a', 'b', 'c'])})
        raw = p.encoded(part); sha = p.sha(raw)
        descriptor = dict(url='/vme-assets/'+sha+'.json', sha256=sha, bytes=len(raw))
        p.asset_path(self.web, descriptor).write_bytes(raw)
        self.manifest = dict(version=1, datasets={'synthetic':dict(dataset=dict(revision='release-1'), parts=[descriptor])})
        self.original = copy.deepcopy(self.manifest)
        self.page = self.web / 'index.html'
        self.write()

    def write(self):
        self.page.write_text('<script id="vme-http-manifest" type="application/json">'+json.dumps(self.manifest)+'</script>')

    def test_attach_is_additive_checked_and_repeatable(self):
        self.assertEqual(attach(self.page, self.folder), self.digest)
        manifest = p.read_manifest(self.page)
        entry = manifest['datasets']['synthetic']
        self.assertEqual(entry['parts'][:-1], self.original['datasets']['synthetic']['parts'])
        for descriptor in p.descriptors(entry):
            p.checked_bytes(self.web, descriptor)
        index = json.loads(p.checked_bytes(self.web, entry['parts'][-1]))['estimateCatalogues']['synthetic']
        self.assertEqual(index['sampleIds'], self.fixture.ids)
        self.assertEqual(index['releaseStage'], 'pilot')
        attach(self.page, self.folder)
        self.assertEqual(p.read_manifest(self.page), manifest)

    def report_fixture(self, raw):
        (self.folder / 'report.pdf').write_bytes(raw)
        self.fixture.manifest['documentation'] = [dict(id='report', label='Report PDF',
            file='report.pdf', sha256=p.sha(raw), bytes=len(raw))]
        self.fixture.write()
        digest = p.sha((self.folder / 'manifest.json').read_bytes())
        receipt = self.folder / 'validation.json'
        data = json.loads(receipt.read_text()); data['manifestSha256'] = digest
        receipt.write_text(json.dumps(data))
        return patch.dict('estimate_supplement.REVIEWED', {digest: {**self.fixture.expected, 'releaseStage': 'full'}})

    def test_correlation_banks_are_lazy_checked_assets(self):
        self.fixture.selection_input_fixture()
        digest=p.sha((self.folder/'manifest.json').read_bytes())
        receipt=json.loads((self.folder/'validation.json').read_text())
        receipt['manifestSha256']=digest
        (self.folder/'validation.json').write_text(json.dumps(receipt))
        with patch.dict('estimate_supplement.REVIEWED',{digest:{**self.fixture.expected,'releaseStage':'full'}}):
            attach(self.page,self.folder)
        entry=p.read_manifest(self.page)['datasets']['synthetic']
        descriptor=entry['estimateAssets']['correlations']['2-visits-spearman']
        bank=json.loads(p.checked_bytes(self.web,descriptor))
        self.assertEqual(bank['correlations'],[.3])
        self.assertNotIn(descriptor,entry['parts'])
        index=json.loads(p.checked_bytes(self.web,entry['estimateAssets']['index']))['estimateCatalogues']['synthetic']
        self.assertEqual(index['correlations']['banks'][0]['http'],descriptor)
        self.assertEqual(entry['parts'][:-1],self.original['datasets']['synthetic']['parts'])
        inputs=entry['estimateAssets']['correlations']['selection-2']
        self.assertNotIn(inputs,entry['parts'])
        self.assertEqual(json.loads(p.checked_bytes(self.web,inputs))['participantGroups'],[0,0,1,2,3])

    def test_pdf_report_preserves_binary_bytes(self):
        raw = b'%PDF-1.4\n%\x80\xff binary fixture\n%%EOF'
        with self.report_fixture(raw):
            attach(self.page, self.folder)
        descriptor = p.read_manifest(self.page)['datasets']['synthetic']['estimateAssets']['documents']['report']
        document = json.loads(p.checked_bytes(self.web, descriptor))
        self.assertEqual(document['mimeType'], 'application/pdf')
        self.assertEqual(base64.b64decode(document['base64']), raw)

    def test_invalid_pdf_cannot_replace_page(self):
        before = self.page.read_bytes()
        with self.report_fixture(b'not a PDF'):
            with self.assertRaisesRegex(ValueError, 'PDF signature'):
                attach(self.page, self.folder)
        self.assertEqual(self.page.read_bytes(), before)

    def test_uninstalled_dataset_is_unchanged(self):
        self.manifest['datasets'] = {}; self.write()
        before = self.page.read_bytes()
        self.assertIsNone(attach(self.page, self.folder))
        self.assertEqual(self.page.read_bytes(), before)

    def test_mismatch_cannot_replace_page(self):
        self.manifest['datasets']['synthetic']['dataset']['revision'] = 'changed'; self.write()
        before = self.page.read_bytes()
        with self.assertRaisesRegex(ValueError, 'installed dataset'):
            attach(self.page, self.folder)
        self.assertEqual(self.page.read_bytes(), before)

    def test_unreviewed_or_unvalidated_export_is_rejected(self):
        (self.folder / 'validation.json').write_text('{}')
        with self.assertRaisesRegex(ValueError, 'receipt differs'):
            checked_catalogue(self.folder)
        with (self.folder / 'manifest.json').open('a') as stream:
            stream.write(' ')
        with self.assertRaisesRegex(ValueError, 'not been reviewed'):
            checked_catalogue(self.folder)


if __name__ == '__main__':
    unittest.main()
