const assert = require('node:assert/strict');
const test = require('node:test');

const TaskService = require('../src/taskService');

test('home move reads axis position from the gateway monitor status snapshot', async () => {
  const gatewayQueries = [];
  const service = new TaskService({
    db: {},
    gatewayDb: {
      async query(sql, params) {
        gatewayQueries.push({ sql, params });
        return [{
          imei: 'TEST-IMEI',
          status_json: {
            sys: { axisPosMM: 12.5 }
          },
          sampled_at: '2026-07-26T08:00:00.000Z',
          updated_at: '2026-07-26T08:00:01.000Z'
        }];
      }
    },
    config: {},
    logger: console
  });

  const result = await service.getHomeMoveMonitorStatus({ imei: 'TEST-IMEI' });

  assert.equal(result.status, 'success');
  assert.equal(result.sourceField, 'status_json.sys.axisPosMM');
  assert.equal(result.axisPosMM, 12.5);
  assert.equal(result.message, '当前设备实时监测轴位置为12.5(毫米)。');
  assert.deepEqual(gatewayQueries[0].params, ['TEST-IMEI']);
});

test('home move treats zero as a valid axis position', async () => {
  const service = new TaskService({
    db: {},
    gatewayDb: {
      async query() {
        return [{ status_json: JSON.stringify({ sys: { axisPosMM: 0 } }) }];
      }
    },
    config: {},
    logger: console
  });

  const result = await service.getHomeMoveMonitorStatus({ imei: 'TEST-IMEI' });
  assert.equal(result.axisPosMM, 0);
  assert.equal(result.message, '当前设备实时监测轴位置为0(毫米)。');
});

test('home move rejects snapshots without axisPosMM', async () => {
  const service = new TaskService({
    db: {},
    gatewayDb: {
      async query() {
        return [{ status_json: { sys: {} } }];
      }
    },
    config: {},
    logger: console
  });

  await assert.rejects(
    service.getHomeMoveMonitorStatus({ imei: 'TEST-IMEI' }),
    /axisPosMM/
  );
});

test('status check reads the three battery percentages from the monitor status snapshot', async () => {
  const service = new TaskService({
    db: {},
    gatewayDb: {
      async query() {
        return [{
          status_json: JSON.stringify({
            monitor: { batteryVoltPC0: 96 },
            sensor: { batteryVoltPA0: 88, batteryVoltPA1: 91 }
          })
        }];
      }
    },
    config: {},
    logger: console
  });

  const result = await service.getStatusCheckMonitorStatus({ imei: 'TEST-IMEI' });

  assert.equal(result.status, 'success');
  assert.equal(result.batteryVoltPC0, 96);
  assert.equal(result.batteryVoltPA0, 88);
  assert.equal(result.batteryVoltPA1, 91);
  assert.equal(
    result.message,
    '上部电池电压百分比：96%；下部备用电池电压百分比：88%；下部主电池电压百分比：91%。'
  );
  assert.deepEqual(result.fields.map(field => field.field), [
    'batteryVoltPC0',
    'batteryVoltPA0',
    'batteryVoltPA1'
  ]);
});
