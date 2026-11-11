"""On-demand CAG adapter checks; no fitting or edits to scientific inputs."""
import copy
import csv
import gzip
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import portable as p
import comb_mg_supplement as c


class GuardTests(unittest.TestCase):
    def test_distinct_reviewed_releases(self):
        self.assertEqual(c.release(c.SUM_PIN)['representations'], ['sum_cag', 'sum_other'])
        self.assertEqual(c.release(c.SUM_PIN)['constructions'], ['AZ'])
        self.assertEqual(c.release(c.SOURCE_PIN)['maps'], 54)
        with self.assertRaisesRegex(ValueError, 'Unreviewed'):c.release('0'*64)

    def test_duplicate_and_empty_ids_rejected(self):
        for rows in [[{'sample_id':'a'},{'sample_id':'a'}],[{'sample_id':''}]]:
            with self.assertRaises(ValueError): c.unique(rows,'sample_id')

    def test_file_integrity_and_axis_key(self):
        with tempfile.TemporaryDirectory() as td:
            f=Path(td)/'source';f.write_text('preserve')
            c.checked(f,c.sha_file(f))
            with self.assertRaises(ValueError): c.checked(f,'0'*64)
            self.assertEqual(f.read_text(),'preserve')
        self.assertEqual(c.map_key(dict(dataset='4k',construction='JPO',representation='length_other',normalization='max',target_metric='linf')),
                         '4k|JPO|length_other|max|linf')

    def test_attach_preserves_unrelated_entries_and_is_idempotent(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td); source=root/'package';source.mkdir();(source/'vme-assets').mkdir()
            raw=p.encoded({'combMgPopulation':{'id':'comb-mg','revision':c.REVISION}})
            h=p.sha(raw);desc=dict(url='/vme-assets/'+h+'.json',sha256=h,bytes=len(raw))
            p.asset_path(source,desc).write_bytes(raw)
            entry=dict(capability=c.CAPABILITY,dataset=dict(id=c.ID,title='Combined metagenomes',revision=c.REVISION),parts=[desc],resources=[])
            old=dict(version=1,seed=dict(distributionDatasets=['existing']),families=[],datasets={'existing':dict(dataset=dict(id='existing',title='Existing',revision='unchanged'))})
            page=root/'web/index.html';page.parent.mkdir()
            page.write_text('<script id="vme-http-manifest" type="application/json">'+json.dumps(old)+'</script><script src="/vme-assets/'+'a'*64+'.js"></script>')
            with patch.object(c,'package',return_value=entry):
                first=c.attach(page,source);before=page.read_bytes();self.assertEqual(c.attach(page,source),first);self.assertEqual(before,page.read_bytes())
                m=p.read_manifest(page);self.assertEqual(m['datasets']['existing'],old['datasets']['existing'])
                self.assertEqual(m['seed']['distributionDatasets'],['existing','comb-mg']);self.assertIn('combMgViewer',m)
                for d in p.descriptors(m):p.checked_bytes(page.parent,d)
                changed=copy.deepcopy(entry);changed['dataset']['revision']='wrong'
                with patch.object(c,'package',return_value=changed):
                    with self.assertRaisesRegex(ValueError,'Conflicting'):c.attach(page,source)
                self.assertEqual(before,page.read_bytes())


@unittest.skipUnless(os.environ.get('MICOVE_COMB_MG_PACKAGE'),'Set MICOVE_COMB_MG_PACKAGE for full saved-data checks')
class SavedDataTests(unittest.TestCase):
    def test_all_saved_axes_metrics_and_metadata(self):
        root=Path(os.environ['MICOVE_COMB_MG_PACKAGE']);entry=c.package(root)
        data=json.loads(p.checked_bytes(root,entry['parts'][0]))['combMgPopulation']
        spec=c.release(data['sourceContractSha256'])
        self.assertEqual(len(data['maps']),spec['maps']);self.assertEqual(len(data['tables']),spec['tables'])
        self.assertEqual({k.split('|')[1] for k in data['maps']},set(spec['constructions']))
        self.assertEqual({k.split('|')[2] for k in data['maps']},set(spec['representations']))
        records={key:json.loads(p.checked_bytes(root,desc)) for key,desc in data['samples'].items()}
        self.assertEqual(records['3.5k'],records['4k'][:3544])
        self.assertEqual(len(records['4k']),4014)
        for key,bank in data['maps'].items():
            pop,construction,representation,norm,metric=key.split('|');t=data['tables'][bank['table']]
            xyz=json.loads(p.checked_bytes(root,bank['coordinates']));features=json.loads(p.checked_bytes(root,t['features']))
            self.assertEqual(len(xyz),len(records[pop]));self.assertEqual(len(features),t['featureCount'])
            self.assertEqual(bank['coordinateMetric'],'euclidean');self.assertEqual(bank['targetMetric'],metric)
            self.assertEqual(bank['settings']['normalization'],norm);self.assertEqual(bank['bestEpoch'],200);self.assertIs(bank['converged'],False)
            self.assertEqual(bank['pairs'],len(xyz)*(len(xyz)-1)//2)
        self.assertEqual(sum(r['exploratory_group']=='accepted_inferred_70' for r in records['4k']),70)
        self.assertEqual(sum(r['exploratory_group']=='unresolved_400' for r in records['4k']),400)
        self.assertTrue(all(not r['visit_id'] for r in records['4k']))
        self.assertTrue(all(r['study']=='unresolved' and not r['participant_id'] for r in records['4k'][3544:]))
        self.assertFalse(any(data['capabilities'][k] for k in ['taxonCST','valencia','trajectories','localFits']))
        # Check the full exported TSV axes independently, preserving parent-index gaps.
        for key,t in data['tables'].items():
            features=json.loads(p.checked_bytes(root,t['features']));pop=key.split('|')[0]
            with gzip.open(p.asset_path(root,t['download']),'rt') as f:
                header=next(f).rstrip('\n').split('\t');ids=[line.split('\t',1)[0] for line in f]
            self.assertEqual(header,['sample_id']+[x['feature'] for x in features])
            self.assertEqual(ids,[x['sample_id'] for x in records[pop]])
            if data.get('abundanceKind') == 'sum':
                accounting=json.loads(p.checked_bytes(root,t['accounting']))
                self.assertEqual([x['sample_id'] for x in accounting],ids)
                self.assertEqual(t['residualCount'],647 if key.split('|')[2]=='sum_other' else 0)
                self.assertEqual(sum(f['kind']=='species_other' for f in features),t['residualCount'])
                if t['residualCount']:self.assertEqual(t['medianReadFraction'],1)
                else:self.assertGreater(t['medianReadFraction'],0.60);self.assertLess(t['medianReadFraction'],0.63)
                with gzip.open(p.asset_path(root,t['rawDownload']),'rt') as f:
                    self.assertEqual(next(f).rstrip('\n').split('\t'),header)
                    self.assertEqual([line.split('\t',1)[0] for line in f],ids)


if __name__=='__main__':unittest.main()
