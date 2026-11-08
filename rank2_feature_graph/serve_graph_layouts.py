"""Optional same-origin loopback server for an installed MiCOVE and R graph layouts."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
from urllib.parse import urlsplit


def make_handler(web, service):
    web = Path(web).resolve()

    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(web), **kwargs)

        def local_request(self):
            expected = '127.0.0.1:' + str(self.server.server_port)
            return self.headers.get('Host') == expected and self.headers.get('Origin', 'http://' + expected) == 'http://' + expected

        def send_json(self, status, payload):
            data = json.dumps(payload, allow_nan=False).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            try:self.wfile.write(data)
            except (BrokenPipeError, ConnectionResetError):pass

        def do_GET(self):
            if not self.local_request():return self.send_json(403, {'error':'Local origin required'})
            if urlsplit(self.path).path == '/api/graph-layout':
                try:return self.send_json(200, {'runtimeId':service.runtime_identity()['id'], 'methods':['mds','grip','weighted_grip']})
                except (ValueError, OSError) as e:return self.send_json(503, {'error':str(e)})
            return super().do_GET()

        def do_HEAD(self):
            if not self.local_request():return self.send_error(403)
            return super().do_HEAD()

        def translate_path(self, path):
            target=Path(super().translate_path(path)).resolve()
            if not target.is_relative_to(web):return str(web/'__unavailable__')
            return str(target)

        def list_directory(self, path):
            self.send_error(404)
            return None

        def do_POST(self):
            if not self.local_request():return self.send_json(403, {'error':'Local origin required'})
            if self.path != '/api/graph-layout':return self.send_json(404, {'error':'Unknown endpoint'})
            try:
                size=int(self.headers.get('Content-Length', '0'))
                if not 0 < size <= 2*1024*1024 or self.headers.get_content_type() != 'application/json':
                    return self.send_json(400, {'error':'Expected bounded JSON request'})
                self.connection.settimeout(10)
                request=json.loads(self.rfile.read(size))
                return self.send_json(200, service.fit_graph(request))
            except (ValueError, OSError) as e:return self.send_json(400, {'error':str(e)})

    return Handler


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--web', type=Path, required=True)
    parser.add_argument('--port', type=int, default=43818)
    parser.add_argument('--source-runtime', action='store_true', help='Use a prepared isolated source runtime instead of installed grip')
    args=parser.parse_args()
    if not (args.web/'index.html').is_file():parser.error('No installed MiCOVE web/index.html')
    if not args.source_runtime:
        os.environ['MICOVE_GRIP_INSTALLED']='1'
        os.environ.setdefault('MICOVE_GRAPH_CACHE', str(Path.home()/'Library/Caches/MiCOVE/graph-layouts'))
    import graph_layout_service as service
    # Missing R never prevents the other layouts or sample views from opening.
    try:service.runtime_identity();print('Local grip runtime ready.', flush=True)
    except ValueError as e:print(str(e), flush=True)
    try:server=ThreadingHTTPServer(('127.0.0.1', args.port), make_handler(args.web, service))
    except OSError as e:parser.error(str(e)+'. Stop the regular MiCOVE launcher before starting this one.')
    print('MiCOVE with optional GRIP: http://127.0.0.1:'+str(args.port), flush=True)
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close()


if __name__=='__main__':main()
