const http = require('http');
const fs = require('fs');
const path = require('path');

const port = Number(process.env.MOCK_CALLBACK_PORT || 3010);
const outputFile = path.join(__dirname, '..', 'callback-log.json');

http.createServer((req, res) => {
  let body = '';
  req.on('data', chunk => {
    body += chunk.toString();
  });
  req.on('end', () => {
    fs.writeFileSync(outputFile, body);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
  });
}).listen(port, '127.0.0.1', () => {
  console.log(`mock callback listening on http://127.0.0.1:${port}`);
  console.log(`callback output file: ${outputFile}`);
});
