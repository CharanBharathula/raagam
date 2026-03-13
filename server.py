#!/usr/bin/env python3
"""Raagam Backend — User auth + data persistence"""
import http.server, json, os, hashlib, time, urllib.parse, signal

DATA_DIR = "/home/azureuser/.openclaw/workspace/raagam/userdata"
STATIC_DIR = "/home/azureuser/.openclaw/workspace/raagam"
os.makedirs(DATA_DIR, exist_ok=True)
signal.signal(signal.SIGHUP, signal.SIG_IGN)

def hash_pw(pw, salt="raagam"):
    return hashlib.sha256(f"{salt}:{pw}".encode()).hexdigest()

def simple_hash(s):
    """Match the JS simpleHash function"""
    h = 0
    for c in s:
        h = ((h << 5) - h) + ord(c)
        h = h & 0xFFFFFFFF  # 32-bit
        if h >= 0x80000000: h -= 0x100000000
    return format(abs(h), 'x').zfill(8)

def verify_token(user, token):
    """Accept sessionToken (from login/signup) or legacy tokens"""
    if token == user.get('sessionToken', ''): return True
    pw_hash = user.get('passwordHash', '')
    return token == hash_pw(pw_hash) or token == pw_hash

def user_path(username):
    safe = hashlib.md5(username.lower().encode()).hexdigest()
    return os.path.join(DATA_DIR, f"{safe}.json")
    safe = hashlib.md5(username.lower().encode()).hexdigest()
    return os.path.join(DATA_DIR, f"{safe}.json")

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=STATIC_DIR, **kwargs)

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        body = json.loads(self.rfile.read(length)) if length else {}
        
        if self.path == '/api/signup':
            return self._signup(body)
        elif self.path == '/api/login':
            return self._login(body)
        elif self.path == '/api/sync':
            return self._sync_save(body)
        else:
            self._json(404, {"error": "not found"})

    def do_GET(self):
        if self.path.startswith('/api/sync'):
            return self._sync_load()
        # Serve static files for everything else
        super().do_GET()

    def _signup(self, body):
        username = (body.get('username') or '').strip().lower()
        password = body.get('password') or ''
        display = body.get('displayName') or username
        if not username or len(username) < 3:
            return self._json(400, {"error": "Username must be 3+ characters"})
        if not password or len(password) < 4:
            return self._json(400, {"error": "Password must be 4+ characters"})
        
        path = user_path(username)
        if os.path.exists(path):
            return self._json(409, {"error": "Username already taken"})
        
        session_token = simple_hash(f"raagam:{password}")
        user = {
            "username": username,
            "displayName": display,
            "passwordHash": hash_pw(password),
            "sessionToken": session_token,
            "createdAt": int(time.time()),
            "likedSongs": [],
            "recentSongs": [],
            "profile": {}
        }
        with open(path, 'w') as f:
            json.dump(user, f)
        
        self._json(200, {"ok": True, "username": username, "displayName": display})

    def _login(self, body):
        username = (body.get('username') or '').strip().lower()
        password = body.get('password') or ''
        path = user_path(username)
        
        if not os.path.exists(path):
            return self._json(401, {"error": "User not found"})
        
        with open(path) as f:
            user = json.load(f)
        
        if user.get('passwordHash') != hash_pw(password):
            return self._json(401, {"error": "Wrong password"})
        
        # Store/update session token
        user['sessionToken'] = simple_hash(f"raagam:{password}")
        with open(path, 'w') as f:
            json.dump(user, f)
        
        self._json(200, {
            "ok": True,
            "username": username,
            "displayName": user.get('displayName', username),
            "likedSongs": user.get('likedSongs', []),
            "recentSongs": user.get('recentSongs', []),
            "profile": user.get('profile', {})
        })

    def _sync_save(self, body):
        username = (body.get('username') or '').strip().lower()
        token = body.get('token') or ''
        if not username:
            return self._json(401, {"error": "Not logged in"})
        
        path = user_path(username)
        if not os.path.exists(path):
            return self._json(401, {"error": "User not found"})
        
        with open(path) as f:
            user = json.load(f)
        
        # Verify token
        if not verify_token(user, token):
            return self._json(401, {"error": "Invalid session"})
        
        # Update data
        if 'likedSongs' in body: user['likedSongs'] = body['likedSongs']
        if 'recentSongs' in body: user['recentSongs'] = body['recentSongs']
        if 'profile' in body: user['profile'] = body['profile']
        user['lastSync'] = int(time.time())
        
        with open(path, 'w') as f:
            json.dump(user, f)
        
        self._json(200, {"ok": True, "synced": user['lastSync']})

    def _sync_load(self):
        qs = urllib.parse.urlparse(self.path).query
        params = urllib.parse.parse_qs(qs)
        username = (params.get('username', [''])[0]).strip().lower()
        token = params.get('token', [''])[0]
        
        if not username:
            return self._json(401, {"error": "Not logged in"})
        
        path = user_path(username)
        if not os.path.exists(path):
            return self._json(401, {"error": "User not found"})
        
        with open(path) as f:
            user = json.load(f)
        
        if not verify_token(user, token):
            return self._json(401, {"error": "Invalid session"})
        
        self._json(200, {
            "ok": True,
            "likedSongs": user.get('likedSongs', []),
            "recentSongs": user.get('recentSongs', []),
            "profile": user.get('profile', {})
        })

    def _json(self, code, data):
        self.send_response(code)
        self._cors()
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, format, *args):
        if '/api/' in str(args[0]):
            super().log_message(format, *args)

if __name__ == '__main__':
    from socketserver import ThreadingMixIn, TCPServer
    class ThreadedServer(ThreadingMixIn, TCPServer):
        allow_reuse_address = True
        daemon_threads = True
    with ThreadedServer(("0.0.0.0", 8888), Handler) as httpd:
        print(f"Raagam server on :8888")
        httpd.serve_forever()
