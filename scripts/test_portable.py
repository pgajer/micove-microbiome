"""Portability failure boundaries, independent of private scientific files."""
import copy
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from contextlib import nullcontext
import json
import socket
import portable


class PortableTests(unittest.TestCase):
    def test_partial_edge_bank_rejected_before_output_creation(self):
        from test_unfolded_edge_supplement import fixture, seal
        bank,bundle,participants=fixture();bank['scope']['complete']=False;seal(bank)
        dataset=bank['dataset']
        manifest=dict(seed={},datasets={dataset:dict(parts=[dict(url='fixture')])})
        part=dict(bundles=[bundle],participants={dataset:participants})
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);metadata=root/'metadata.json';output=root/'result'
            metadata.write_text(json.dumps(dict(legendAbundanceTotals={},embeddingStressDiagnostics={},datasetUnfoldedEdgeEmbeddings={dataset:bank})))
            with patch.object(portable,'package_manifest',return_value=manifest), patch.object(portable,'package_views',return_value={}), patch.object(portable,'validate_metadata'), patch.object(portable,'checked_bytes',return_value=json.dumps(part).encode()):
                with self.assertRaisesRegex(ValueError,'partial pilot'):
                    portable.prepare(root,metadata,output)
            self.assertFalse(output.exists())

    def test_original_and_repackaged_launchers_follow_updated_instance(self):
        with tempfile.TemporaryDirectory() as temp:
            package=Path(temp);(package/'web').mkdir()
            source="curl http://127.0.0.1:43817/vme-health | grep -qx 'VME-portable-2026-10-23'"
            (package/'Start VME.command').write_text(source)
            first=portable.updated_launcher(package,'a'*64)
            self.assertIn('43818/vme-instance.txt',first)
            self.assertIn("'"+'a'*64+"'",first)
            (package/'Start VME.command').write_text(first)
            (package/'web/vme-instance.txt').write_text('a'*64)
            second=portable.updated_launcher(package,'b'*64)
            self.assertIn("'"+'b'*64+"'",second)
            self.assertNotIn('a'*64,second)
            self.assertEqual((package/'Start VME.command').read_text(),first)

    def test_asset_identity_and_path_boundary(self):
        with tempfile.TemporaryDirectory() as temp:
            web = Path(temp); (web / 'vme-assets').mkdir()
            raw = b'{"value":1}'; digest = portable.sha(raw)
            desc = dict(url='/vme-assets/' + digest + '.json', sha256=digest, bytes=len(raw))
            path = web / desc['url'].lstrip('/'); path.write_bytes(raw)
            self.assertEqual(portable.checked_bytes(web, desc), raw)
            path.write_bytes(b'{"value":2}')
            with self.assertRaisesRegex(ValueError, 'checksum'):
                portable.checked_bytes(web, desc)
            with self.assertRaisesRegex(ValueError, 'Invalid asset path'):
                portable.asset_path(web, dict(desc, url='/vme-assets/../../secret'))
            external = web / 'outside.json'; external.write_bytes(raw)
            path.unlink(); path.symlink_to(external)
            # Containment is package-wide, not limited to its asset subdirectory.
            self.assertEqual(portable.checked_bytes(web, desc), raw)

    def test_metadata_bindings(self):
        manifest = dict(version=1, datasets={'test': {'dataset': {'revision': 'r1'}}})
        views = {'v': ({'size': 2}, {'coordinateSha256': 'xyz', 'alignment': {'scale': 2}})}
        metadata = dict(version=1, baseManifestSha256=portable.sha(portable.encoded(manifest)),
                        datasetRevisions={'test': 'r1'}, legendAbundanceTotals={'test': {'datasetRevision': 'r1'}},
                        embeddingStressDiagnostics={'v': {'profiles': 2, 'fingerprint': {'coordinateSha256': 'xyz', 'scale': 2}}})
        portable.validate_metadata(metadata, manifest, views)
        bad = copy.deepcopy(metadata); bad['baseManifestSha256'] = 'other'
        with self.assertRaisesRegex(ValueError, 'different data package'):
            portable.validate_metadata(bad, manifest, views)
        bad = copy.deepcopy(metadata); bad['embeddingStressDiagnostics']['v']['fingerprint']['scale'] = 1
        with self.assertRaisesRegex(ValueError, 'coordinates differ'):
            portable.validate_metadata(bad, manifest, views)

    def test_optional_neighborhoods_isolate_duplicate_dataset_id_and_validate_assets(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp); mainweb=root/'main'; oldweb=root/'old'
            mainweb.mkdir(); (oldweb/'vme-assets').mkdir(parents=True)
            raw=b'{"reference":"historical"}'; digest=portable.sha(raw)
            desc=dict(url='/vme-assets/'+digest+'.json',sha256=digest,bytes=len(raw))
            (oldweb/desc['url'].lstrip('/')).write_bytes(raw)
            current=dict(version=1,seed=dict(distributionDatasets=['comb']),families=[],
                datasets={'comb':dict(dataset=dict(id='comb',title='Current',revision='new'),parts=[])},
                application={},validator={},plotly={})
            old=dict(version=1,seed={},families=[dict(id='li-lc-neighborhoods',title='Li / Lc neighborhoods')],
                datasets={'comb':dict(dataset=dict(id='comb',title='Historical',revision='old'),parts=[desc])},
                neighborhoods=dict(datasets=['comb'],parts=[desc]),sensitivity={'old':True})
            def write(web,manifest):
                (web/'index.html').write_text('<script id="vme-http-manifest" type="application/json">'+json.dumps(manifest)+'</script>')
            write(mainweb,current);write(oldweb,old)
            portable.attach_neighborhoods(mainweb/'index.html',oldweb)
            main=portable.read_manifest(mainweb/'index.html')
            self.assertEqual(main['datasets'],current['datasets'])
            self.assertEqual(main['seed']['distributionDatasets'],['comb'])
            import re
            extra=json.loads(re.search(r'<script id="vme-optional-neighborhoods" type="application/json">(.*?)</script>',(mainweb/'index.html').read_text())[1])
            self.assertEqual(extra['datasets']['comb']['dataset']['revision'],'old')
            self.assertEqual(extra['seed']['distributionDatasets'],[])
            self.assertEqual(extra['seed']['optionalDatasetLinks'],[dict(id='comb',title='Current')])
            self.assertNotIn('sensitivity',extra)
            self.assertEqual(portable.checked_bytes(mainweb,desc),raw)
            self.assertEqual(portable.read_manifest(oldweb/'index.html'),old)
            with self.assertRaisesRegex(ValueError,'already installed'):
                portable.attach_neighborhoods(mainweb/'index.html',oldweb)
            # A future local build can reuse the installed optional context.
            preview=root/'preview';preview.mkdir();write(preview,current)
            portable.attach_neighborhoods(preview/'index.html',mainweb)
            write(mainweb,current)
            (oldweb/desc['url'].lstrip('/')).write_bytes(b'corrupted')
            with self.assertRaisesRegex(ValueError,'checksum'):
                portable.attach_neighborhoods(mainweb/'index.html',oldweb)
            self.assertEqual(portable.read_manifest(mainweb/'index.html'),current)

    def test_existing_output_is_preserved(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp); sentinel = output / 'keep'; sentinel.write_text('unchanged')
            with self.assertRaisesRegex(ValueError, 'never overwritten'):
                portable.prepare(Path('absent'), Path('absent'), output)
            self.assertEqual(sentinel.read_text(), 'unchanged')

    def test_copy_accepts_copytree_strings(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); source = root / 'source'; source.write_bytes(b'saved')
            portable.copy_file(str(source), str(root / 'nested/copy'))
            self.assertEqual((root / 'nested/copy').read_bytes(), b'saved')
            self.assertEqual(source.read_bytes(), b'saved')

    def test_finished_candidate_checks_generated_loader_and_application(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp); web = output / 'web'; (web / 'vme-assets').mkdir(parents=True)
            def asset(raw):
                digest = portable.sha(raw); url = '/vme-assets/' + digest + '.js'
                (web / url.lstrip('/')).write_bytes(raw)
                return dict(url=url, sha256=digest, bytes=len(raw))
            app = asset(b'const application = true;')
            loader = asset(b'const loader = true;')
            manifest = dict(version=1, application=app)
            (web / 'index.html').write_text('<script id="vme-http-manifest" type="application/json">' +
                json.dumps(manifest) + '</script><script src="' + loader['url'] + '"></script>')
            (web / 'vme-instance.txt').write_text('a' * 64)
            (output / 'SOURCE_AND_DATA.json').write_text(json.dumps(dict(application=app)))
            (output / 'vme-server').write_text('server'); (output / 'vme-server').chmod(0o755)
            (output / 'Start VME.command').write_text('#!/bin/bash\nexit 0\n')
            portable.validate_prepared(output)
            for desc in (app, loader):
                path = web / desc['url'].lstrip('/'); saved = path.read_bytes()
                path.write_bytes(b'corrupt')
                with self.assertRaisesRegex(ValueError, 'checksum'):
                    portable.validate_prepared(output)
                path.write_bytes(saved)


class UpdateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.output = self.root / 'vme'
        self.package = self.root / 'data'; self.package.mkdir()
        self.metadata = self.root / 'metadata.json'; self.metadata.write_text('{}')
        self.prepared_inputs = []
        self.guard = patch.object(portable, 'stopped_viewer', lambda output: nullcontext())
        self.guard.start(); self.addCleanup(self.guard.stop)

    def prepare(self, package, metadata, output, announce=True):
        self.prepared_inputs.append((package, metadata))
        (output / 'web').mkdir(parents=True)
        for name in ('vme-server', 'Start VME.command', 'web/index.html'):
            (output / name).write_text('new')
        (output / 'SOURCE_AND_DATA.json').write_text(json.dumps(dict(
            dataPackage=str(package), metadataFile=str(metadata))))

    def install_old(self):
        self.prepare(self.package, self.metadata, self.output)
        (self.output / 'personal-note').write_text('preserve me')

    def update(self):
        with patch.object(portable, 'prepare', side_effect=self.prepare), \
                patch.object(portable, 'validate_prepared'):
            portable.update(self.package, self.metadata, self.output)

    def test_first_install_and_repeated_updates_remember_inputs_and_keep_backups(self):
        self.update()
        (self.output / 'personal-note').write_text('preserve me')
        with patch.object(portable, 'prepare', side_effect=self.prepare), \
                patch.object(portable, 'validate_prepared'):
            portable.update(output=self.output)
            portable.update(output=self.output)
        backups = list(self.root.glob('vme-update-*/previous'))
        self.assertEqual(len(backups), 2)
        self.assertTrue(any((p / 'personal-note').exists() for p in backups))
        self.assertTrue(all(pair == (self.package, self.metadata) for pair in self.prepared_inputs))
        self.assertFalse((self.root / '.vme-update.json').exists())

    def test_new_legacy_and_migrated_default_destinations(self):
        current = self.root / 'micove'
        with patch.object(Path, 'home', return_value=self.root):
            self.assertEqual(portable.app_destination(), current)
            self.install_old()
            self.assertEqual(portable.app_destination(), self.output)
            current.mkdir()
            (current / 'SOURCE_AND_DATA.json').write_text('{}')
            with self.assertRaisesRegex(ValueError, 'Choose --output'):
                portable.app_destination()
            self.assertEqual(portable.app_destination(self.output), self.output)
            self.assertEqual(portable.app_destination(current), current)
            (current / 'SOURCE_AND_DATA.json').unlink()
            current.rmdir()
            self.output.rename(current)
            self.output.symlink_to(current.name)
            for destination in (None, self.output, current):
                self.assertEqual(portable.app_destination(destination), current)
            with portable.update_lock(current), self.assertRaisesRegex(ValueError, 'Another update'):
                portable.update(output=self.output)

    def test_dangling_indirect_and_interrupted_app_paths(self):
        current = self.root / 'micove'
        with patch.object(Path, 'home', return_value=self.root):
            journal = self.root / '.vme-update.json'
            journal.touch()
            self.assertEqual(portable.app_destination(), self.output)
            journal.unlink()
            self.output.symlink_to(current.name)
            with self.assertRaisesRegex(ValueError, 'symbolic link'):
                portable.app_destination()
            (self.root / '.micove-update.json').touch()
            self.assertEqual(portable.app_destination(), current)
            current.symlink_to(self.package)
            with self.assertRaisesRegex(ValueError, 'symbolic link'):
                portable.app_destination(self.output)
            self.output.unlink()
            self.output.symlink_to(self.package)
            with self.assertRaisesRegex(ValueError, 'symbolic link'):
                portable.app_destination()

    def test_cosmix_and_two_generation_aliases(self):
        current = self.root / 'micove'
        cosmix = self.root / 'cosmix'
        with patch.object(Path, 'home', return_value=self.root):
            self.prepare(self.package, self.metadata, cosmix)
            self.assertEqual(portable.app_destination(), cosmix)
            cosmix.rename(current)
            cosmix.symlink_to(current.name)
            self.output.symlink_to(cosmix.name)
            for alias in (None, self.output, cosmix, current):
                self.assertEqual(portable.app_destination(alias), current)
            current.rename(self.root / 'saved')
            (self.root / '.micove-update.json').touch()
            self.assertEqual(portable.app_destination(self.output), current)

    def test_canonical_launcher_and_legacy_aliases(self):
        output = self.root / 'launcher-test'
        output.mkdir()
        (output / 'vme-server').write_text('original native server')
        portable.write_launchers(output, '#!/bin/bash\necho MiCOVE\n')
        for name in ('Start MiCOVE.command', 'Start CoSMiX.command', 'Start VME.command'):
            self.assertEqual((output / name).read_text(), '#!/bin/bash\necho MiCOVE\n')
        self.assertEqual((output / 'micove-server').read_text(), 'original native server')
        optional = (output / 'Start MiCOVE with GRIP.command').read_text()
        self.assertIn('exec python3 graph-service/serve_graph_layouts.py', optional)
        self.assertNotIn('install_github', optional)
        self.assertTrue((output / 'GRAPH_LAYOUTS.md').is_file())
        for name in ('serve_graph_layouts.py', 'graph_layout_service.py', 'graph_layout_worker.R'):
            self.assertEqual((output / 'graph-service' / name).read_bytes(), (portable.HERE / name).read_bytes())

    def test_build_and_validation_failures_preserve_old_app(self):
        self.install_old()
        for failure in ('prepare', 'validate_prepared'):
            with self.subTest(failure=failure), \
                    patch.object(portable, 'prepare', side_effect=self.prepare), \
                    patch.object(portable, 'validate_prepared'), \
                    patch.object(portable, failure, side_effect=ValueError('failed check')):
                with self.assertRaisesRegex(ValueError, 'failed check'):
                    portable.update(self.package, self.metadata, self.output)
            self.assertEqual((self.output / 'personal-note').read_text(), 'preserve me')

    def test_failed_install_and_interrupt_restore_previous_app(self):
        self.install_old()
        rename = Path.rename
        for error in (OSError('rename failed'), KeyboardInterrupt()):
            def fail_candidate(path, target):
                if path.name == 'candidate':
                    raise error
                return rename(path, target)
            with patch.object(Path, 'rename', fail_candidate), self.assertRaises(type(error)):
                self.update()
            self.assertEqual((self.output / 'personal-note').read_text(), 'preserve me')
            self.assertFalse((self.root / '.vme-update.json').exists())

    def test_recover_process_killed_between_directory_moves(self):
        self.install_old()
        transaction = self.root / 'vme-update-interrupted'; transaction.mkdir()
        self.output.rename(transaction / 'previous')
        (self.root / '.vme-update.json').write_text(json.dumps(dict(
            transaction=transaction.name, hadPrevious=True)))
        with patch.object(portable, 'prepare', side_effect=ValueError('new build failed')):
            with self.assertRaisesRegex(ValueError, 'new build failed'):
                portable.update(self.package, self.metadata, self.output)
        self.assertEqual((self.output / 'personal-note').read_text(), 'preserve me')

    def test_unrelated_source_symlink_and_overlapping_paths_rejected(self):
        self.output.mkdir(); (self.output / 'keep').write_text('untouched')
        with self.assertRaisesRegex(ValueError, 'not a prepared'):
            self.update()
        self.assertEqual((self.output / 'keep').read_text(), 'untouched')
        with self.assertRaisesRegex(ValueError, 'source clone'):
            portable.update(self.package, self.metadata, portable.ROOT)
        link = self.root / 'alias'; link.symlink_to(self.output)
        with self.assertRaisesRegex(ValueError, 'symbolic link'):
            portable.update(self.package, self.metadata, link)
        self.prepare(self.package, self.metadata, self.output / 'nested')
        with self.assertRaisesRegex(ValueError, 'outside the app'):
            portable.update(self.output / 'nested/data', self.metadata, self.output / 'nested')

    def test_optional_inputs_survive_regular_update(self):
        self.install_old()
        receipt=self.output/'SOURCE_AND_DATA.json'
        data=json.loads(receipt.read_text())
        data['optionalNeighborhoods']=dict(dataPackage=str(self.package),metadataFile=str(self.metadata))
        receipt.write_text(json.dumps(data))
        with patch.object(portable,'prepare',side_effect=self.prepare), patch.object(portable,'validate_prepared'), patch.object(portable,'install_neighborhoods') as install:
            portable.update(output=self.output)
            self.assertEqual(install.call_args.args[1:],(self.package,self.metadata))

    def test_concurrent_updates_rejected(self):
        with portable.update_lock(self.output):
            with self.assertRaisesRegex(ValueError, 'Another update'):
                self.update()

    def test_live_server_rejected(self):
        self.guard.stop()
        with socket.socket() as server:
            server.bind(('127.0.0.1', 0)); server.listen()
            with patch.dict('os.environ', VME_PORT=str(server.getsockname()[1])):
                with self.assertRaisesRegex(ValueError, 'in use'):
                    self.update()
        with patch.object(portable.subprocess, 'check_output', return_value=f'./vme-server {self.output}/web 50000'):
            with self.assertRaisesRegex(ValueError, 'Stop the viewer'):
                self.update()


if __name__ == '__main__':
    unittest.main()
