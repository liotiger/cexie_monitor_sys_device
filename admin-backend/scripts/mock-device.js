const net = require('net');

const imei = process.env.MOCK_DEVICE_IMEI || '123456789012345';
const port = Number(process.env.MOCK_DEVICE_PORT || 8899);
const host = process.env.MOCK_DEVICE_HOST || '127.0.0.1';
const measurementDelayMs = Number(process.env.MOCK_DEVICE_DELAY_MS || 500);
let registered = false;
let sentMeasurement = false;

const client = net.createConnection({ host, port }, () => {
  console.log(`mock device connected to ${host}:${port}`);
  client.write(`ZC+${imei}\n`);
});

client.on('data', buffer => {
  const text = buffer.toString('utf8').trim();
  console.log(`mock device received: ${text}`);

  if (!registered && text.includes('ZC+OK')) {
    registered = true;
    return;
  }

  if (!registered || sentMeasurement) {
    return;
  }

  sentMeasurement = true;
  setTimeout(() => {
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = `SJ+${imei},1.5,100,98,${timestamp}\n`;
    console.log(`mock device send data: ${payload.trim()}`);
    client.write(payload);
  }, measurementDelayMs);
});

client.on('error', error => {
  console.error('mock device error:', error.message);
});

setInterval(() => {
  client.write(`HB+${imei}\n`);
}, 10000);
