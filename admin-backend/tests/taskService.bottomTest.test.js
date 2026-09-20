const assert = require('node:assert/strict');
const test = require('node:test');

const TaskService = require('../src/taskService');

test('bottom test parameters update bound hole fields and task log values', async () => {
  const executedStatements = [];
  const queriedStatements = [];
  const db = {
    async query(sql, params) {
      queriedStatements.push({ sql, params });
      if (sql.includes('FROM monitoring_holes')) {
        return [{
          id: 12,
          hole_number: 'CX-01',
          hole_name: '一号测孔',
          depth: '3.00',
          measurement_interval: '0.40'
        }];
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
    async execute(sql, params) {
      executedStatements.push({ sql, params });
      return { affectedRows: 1 };
    }
  };
  const gatewayDb = {
    async query() {
      return [{
        imei: 'TEST-IMEI',
        params_json: {
          part3: {
            fMonitorTestDis: 500,
            wMonitorNodesNum: 10,
            fMonitorFromStartDis: 50
          }
        },
        collected_at: '2026-07-25T08:00:00.000Z'
      }];
    }
  };
  const service = new TaskService({ db, gatewayDb, config: {}, logger: console });

  const result = await service.syncBottomTestHoleParameters({
    imei: 'TEST-IMEI',
    metadata: { adminUpperDeviceId: 7, sourceHoleId: 12, holeNumber: 'CX-01' }
  });

  assert.equal(result.status, 'success');
  assert.equal(result.fields[0].field, 'measurement_interval');
  assert.equal(result.fields[0].value, 0.5);
  assert.equal(result.fields[1].field, 'depth');
  assert.equal(result.fields[1].value, 4.55);
  // 修复说明：底部检测同时回写测孔初始测量距离（fMonitorFromStartDis=50mm → 0.05m）。
  assert.equal(result.fields[2].field, 'initial_measurement_distance');
  assert.equal(result.fields[2].value, 0.05);
  assert.match(result.message, /测孔测量间隔\(m\)=0\.5/);
  assert.match(result.message, /测孔深度\(m\)=4\.55/);
  assert.match(result.message, /测孔初始测量距离\(m\)=0\.05/);
  assert.deepEqual(queriedStatements[0].params, [7, 'CX-01']);
  assert.deepEqual(executedStatements[0].params, [0.5, 4.55, 0.05, 7, 'CX-01']);
  assert.equal(result.sourceHoleId, 12);
  assert.equal(result.holeNumber, 'CX-01');
  assert.deepEqual(result.updatedHoles[0].previousValues, {
    measurement_interval: 0.4,
    depth: 3,
    initial_measurement_distance: null
  });
});

test('bottom test parameter sync rejects incomplete gateway snapshots', async () => {
  const service = new TaskService({
    db: {},
    gatewayDb: {
      async query() {
        return [{ params_json: { part3: { fMonitorTestDis: 500 } } }];
      }
    },
    config: {},
    logger: console
  });

  await assert.rejects(
    service.syncBottomTestHoleParameters({ imei: 'TEST-IMEI', metadata: { adminUpperDeviceId: 7 } }),
    /wMonitorNodesNum/
  );
});
