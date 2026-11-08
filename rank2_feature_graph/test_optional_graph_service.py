"""On-demand service boundaries; opt in to the separately installed R engine."""
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
import json
import math
import os
from pathlib import Path
import tempfile
from threading import Thread
import unittest
from unittest.mock import Mock
from serve_graph_layouts import make_handler
import graph_layout_service as service


class ServiceTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
        (self.root/'web').mkdir();(self.root/'web/index.html').write_text('viewer')
        (self.root/'secret').write_text('not public');(self.root/'web/link').symlink_to(self.root/'secret')
        self.backend=Mock();self.backend.runtime_identity.return_value={'id':'test'}
        self.server=ThreadingHTTPServer(('127.0.0.1',0),make_handler(self.root/'web', self.backend))
        self.thread=Thread(target=self.server.serve_forever, daemon=True);self.thread.start()

    def tearDown(self):
        self.server.shutdown();self.server.server_close();self.thread.join();self.temp.cleanup()

    def request(self, method, path, body=None, headers=None):
        c=HTTPConnection('127.0.0.1',self.server.server_port)
        c.request(method,path,body,headers or {});r=c.getresponse();result=(r.status,r.read());c.close();return result

    def test_static_and_capability(self):
        self.assertEqual(self.request('GET','/'),(200,b'viewer'))
        self.assertEqual(self.request('GET','/api/graph-layout')[0],200)
        self.assertEqual(self.request('GET','/link')[0],404)
        self.assertEqual(self.request('GET','/../secret')[0],404)
        self.backend.runtime_identity.side_effect=ValueError('Install grip')
        self.assertEqual(self.request('GET','/api/graph-layout')[0],503)
        self.assertEqual(self.request('GET','/')[0],200)

    def test_post_boundaries(self):
        self.assertEqual(self.request('POST','/api/graph-layout','{}',{'Origin':'https://example.com'})[0],403)
        self.assertEqual(self.request('POST','/api/graph-layout','{}',{'Host':'example.com'})[0],403)
        self.assertEqual(self.request('POST','/api/graph-layout','{}')[0],400)
        self.assertEqual(self.request('POST','/api/graph-layout','{',{'Content-Type':'application/json'})[0],400)
        self.backend.fit_graph.assert_not_called()
        self.backend.fit_graph.return_value={'coords':[[0,0]]}
        self.assertEqual(self.request('POST','/api/graph-layout','{}',{'Content-Type':'application/json'})[0],200)

    def test_graph_validation(self):
        request={'method':'weighted_grip','dimension':2,'nodes':[0,1],'edges':[[0,1,.5]],'initial':[[0,0],[1,0]],'context':'test'}
        service.validate_request(request)
        for bad in (0,-1,math.inf,math.nan):
            with self.assertRaises(ValueError):service.validate_request({**request,'edges':[[0,1,bad]]})
        with self.assertRaises(ValueError):service.validate_request({**request,'nodes':list(range(513))})
        with self.assertRaises(ValueError):service.validate_request({**request,'command':'invalid'})


@unittest.skipUnless(os.environ.get('MICOVE_TEST_GRIP')=='1','opt-in installed R engine check')
class RealGripTests(unittest.TestCase):
    def test_weighted_engine_and_cache(self):
        old_mode,old_cache=service.INSTALLED,service.RUNTIME
        with tempfile.TemporaryDirectory() as temp:
            service.INSTALLED=True;service.RUNTIME=Path(temp)
            try:
                # Nonuniform triangle plus a separate pair; exercises true weighted GRIP and packing.
                request={'method':'weighted_grip','dimension':2,'nodes':[0,1,2,3,4],
                         'edges':[[0,1,.5],[1,2,1.5],[0,2,1.4],[3,4,.7]],
                         'initial':[[0,0],[1,0],[0,1],[3,0],[4,0]],'context':'optional-service-test'}
                original=json.dumps(request);a=service.fit_graph(request);b=service.fit_graph(request)
                self.assertEqual(json.dumps(request),original)
                self.assertTrue(b['cached']);self.assertEqual(a['coords'],b['coords'])
                self.assertEqual(a['runtime']['load'],'installed')
                self.assertEqual(a['components'][0]['settings']['metric'],'edge_length')
                self.assertEqual(a['components'][0]['settings']['length.normalization'],'none')
                self.assertAlmostEqual(math.dist(a['coords'][3],a['coords'][4]),.7,places=8)
                self.assertTrue(all(math.isfinite(v) for p in a['coords'] for v in p))
                request['edges'][0][2]=.9;c=service.fit_graph(request)
                self.assertNotEqual(a['requestHash'],c['requestHash'])
            finally:service.INSTALLED,service.RUNTIME=old_mode,old_cache


if __name__=='__main__':unittest.main()
