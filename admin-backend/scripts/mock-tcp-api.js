const http = require('http');

const port = Number(process.env.MOCK_TCP_API_PORT || 3101);
const sentTasks = new Map();

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, 'http://127.0.0.1');

  if (req.method === 'POST' && requestUrl.pathname === '/send-command') {
    const body = await readBody(req);
    const sentAt = Date.now();
    sentTasks.set(body.imei, {
      imei: body.imei,
      command: body.command,
      format: body.format || 'hex',
      sentAt
    });

    return sendJson(res, 200, {
      success: true,
      message: 'mock tcp api accepted command',
      data: {
        imei: body.imei,
        format: body.format || 'hex',
        normalizedCommand: body.command,
        payloadHex: body.command
      }
    });
  }

  if (req.method === 'GET' && requestUrl.pathname === '/command-logs') {
    const imei = requestUrl.searchParams.get('imei');
    const since = Number(requestUrl.searchParams.get('since') || 0);
    const task = sentTasks.get(imei);
    const list = [];

    if (task && Date.now() - task.sentAt >= 2000) {
      const timestamp = task.sentAt + 2500;
      if (timestamp > since) {
        list.push({
          id: `mock_${timestamp}`,
          imei,
          timestamp,
          createdAt: new Date(timestamp).toISOString(),
          direction: 'recv',
          type: 'device_data',
          payloadHex: '53 4A 2B',
          payloadText: `SJ+${imei}`,
          summary: 'mock device replied'
        });
      }
    }

    return sendJson(res, 200, { success: true, data: { list } });
  }

  return sendJson(res, 404, { success: false, error: 'not found' });
}).listen(port, '127.0.0.1', () => {
  console.log(`mock tcp api listening on http://127.0.0.1:${port}`);
});
