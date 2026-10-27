"""Desktop preview host only. OCR itself runs inside the browser, not Python."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import argparse
import threading
import urllib.parse
import webbrowser

ROOT = Path(__file__).resolve().parents[1]


class AppFiles(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def send_head(self):
        path = urllib.parse.unquote(urllib.parse.urlsplit(self.path).path).lstrip('/')
        allowed = path in ('', 'index.html', 'styles.css', 'sw.js', 'manifest.webmanifest') or path.startswith(('js/', 'styles/', 'icons/', 'vendor/'))
        resolved = (ROOT / path).resolve()
        if not allowed or not resolved.is_relative_to(ROOT):
            self.send_error(404)
            return
        return super().send_head()

    def list_directory(self, path):
        self.send_error(404)

    def log_message(self, *args):
        pass


if __name__ == '__main__':
    args = argparse.ArgumentParser(description='Open the MenuMargin test build on this Mac.')
    args.add_argument('--port', type=int, default=8789)
    args.add_argument('--no-open', action='store_true')
    options = args.parse_args()
    try:
        server = ThreadingHTTPServer(('127.0.0.1', options.port), AppFiles)
    except OSError as error:
        print(f'Could not start the preview: {error}. Close an older preview window and try again.')
        raise SystemExit(1)
    url = f'http://127.0.0.1:{server.server_port}/'
    print(f'MenuMargin scanner TEST BUILD: {url}\nKeep this window open while using the preview. Press Control+C to stop.\nInvoices and developer files are not served by this preview host.', flush=True)
    if not options.no_open:
        threading.Timer(.5, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
