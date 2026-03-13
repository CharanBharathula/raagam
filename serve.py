import http.server
import socketserver
import os
import signal
import sys

os.chdir('/home/azureuser/.openclaw/workspace/raagam')
PORT = 8888

class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # silent

with socketserver.TCPServer(('0.0.0.0', PORT), Handler) as httpd:
    print(f"Serving on port {PORT}", flush=True)
    with open('/tmp/raagam.pid', 'w') as f:
        f.write(str(os.getpid()))
    httpd.serve_forever()
