const fs = require('fs');
const http = require('http');
const path = require('path');

const host = process.env.MOBILE_H5_HOST || '0.0.0.0';
const port = Number(process.env.MOBILE_H5_PORT || 4202);
const apiTarget = new URL(process.env.MOBILE_API_PROXY_TARGET || 'http://127.0.0.1:1337');
const publicDir = path.resolve(__dirname, '..', 'dist', 'build', 'h5');
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

if (!fs.existsSync(path.join(publicDir, 'index.html'))) {
  console.error('H5 build output not found. Run `npm run build:h5` first.');
  process.exit(1);
}

function proxyApi(req, res) {
  const proxy = http.request({
    protocol: apiTarget.protocol,
    hostname: apiTarget.hostname,
    port: apiTarget.port,
    method: req.method,
    path: req.url,
    headers: { ...req.headers, host: apiTarget.host }
  }, upstream => {
    res.writeHead(upstream.statusCode || 502, upstream.headers);
    upstream.pipe(res);
  });

  proxy.on('error', error => {
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: false, message: `API proxy failed: ${error.message}` }));
  });
  req.pipe(proxy);
}

function serveFile(req, res) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch (error) {
    res.writeHead(400);
    res.end('Bad request');
    return;
  }

  const requestedPath = path.resolve(publicDir, `.${pathname}`);
  const safePath = requestedPath.startsWith(publicDir + path.sep) || requestedPath === publicDir;
  let filePath = safePath && fs.existsSync(requestedPath) && fs.statSync(requestedPath).isFile()
    ? requestedPath
    : path.join(publicDir, 'index.html');

  const contentType = mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': contentType });
  fs.createReadStream(filePath).pipe(res);
}

http.createServer((req, res) => {
  if (req.url === '/api' || req.url.startsWith('/api/')) {
    proxyApi(req, res);
    return;
  }
  serveFile(req, res);
}).listen(port, host, () => {
  console.log(`Mobile H5 is running at http://${host}:${port}`);
  console.log(`API proxy target: ${apiTarget.origin}`);
});
