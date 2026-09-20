const assert = require('node:assert/strict');
const test = require('node:test');

const TaskService = require('../src/taskService');

function createService({ hole = {}, fetchImpl } = {}) {
  const executedStatements = [];
  const queriedStatements = [];
  const holeRow = {
    id: 12,
    hole_number: 'CX-01',
    hole_name: 'Hole 1',
    depth: 4.55,
    measurement_interval: 0.5,
    initial_measurement_distance: 0.05,
    ...hole
  };

  const service = new TaskService({
    db: {
      async query(sql, params) {
        queriedStatements.push({ sql, params });
        if (sql.includes('FROM monitoring_holes')) {
          return [holeRow];
        }
        throw new Error(`Unexpected admin query: ${sql}`);
      },
      async execute(sql, params) {
        executedStatements.push({ sql, params });
        return { affectedRows: 1 };
      }
    },
    gatewayDb: { async query() { return []; } },
    config: {
      tcpApi: { baseUrl: 'http://gateway.test', timeoutMs: 1000 },
      tasks: { defaultPollIntervalMs: 1000, maxPollIntervalMs: 5000 }
    },
    fetchImpl,
    logger: { error() {} }
  });

  service.executedStatements = executedStatements;
  service.queriedStatements = queriedStatements;
  return service;
}

test('monitor start derives monitorNodesNum from hole depth, interval and initial distance', () => {
  const service = createService();

  const conversion = service.buildMonitorDeviceParams({
    id: 12,
    hole_number: 'CX-01',
    depth: 4.55,
    measurement_interval: 0.5,
    initial_measurement_distance: 0.05
  });

  // 孔深 4.55m=4550mm，测量间隔 0.5m=500mm，初始距离 0.05m=50mm
  // 节点数 = (4550 - 50) / 500 + 1 = 10
  assert.deepEqual(conversion.params, {
    monitorNodesNum: 10,
    monitorTestDis: 500,
    monitorFromStartDis: 50
  });
  assert.equal(conversion.deviceDepthM, 4.55);
  assert.equal(conversion.holeDepthM, 4.55);
});

test('monitor start rounds monitorNodesNum and reports the resulting device depth', () => {
  const service = createService();

  const conversion = service.buildMonitorDeviceParams({
    id: 12,
    hole_number: 'CX-02',
    depth: 4.6,
    measurement_interval: 0.5,
    initial_measurement_distance: 0.05
  });

  // (4600 - 50) / 500 = 9.1 → 四舍五入取 9，节点数 10，设备实际覆盖 4550mm=4.55m
  assert.equal(conversion.params.monitorNodesNum, 10);
  assert.equal(conversion.deviceDepthM, 4.55);
  assert.equal(conversion.holeDepthM, 4.6);
});

test('monitor start defaults a missing initial distance to 0.05m', () => {
  const service = createService();

  const conversion = service.buildMonitorDeviceParams({
    id: 12,
    hole_number: 'CX-03',
    depth: 5,
    measurement_interval: 0.25,
    initial_measurement_distance: null
  });

  // 初始距离缺省按 0.05m 处理：(5000 - 50) / 250 = 19.8 → 20，节点数 21
  assert.equal(conversion.params.monitorFromStartDis, 50);
  assert.equal(conversion.params.monitorTestDis, 250);
  assert.equal(conversion.params.monitorNodesNum, 21);
});

test('monitor start rejects holes whose depth is not greater than the initial distance', () => {
  const service = createService();

  assert.throws(
    () => service.buildMonitorDeviceParams({
      id: 12,
      hole_number: 'CX-04',
      depth: 0.05,
      measurement_interval: 0.5,
      initial_measurement_distance: 0.05
    }),
    /孔深必须大于初始测量距离/
  );
});

test('monitor start rejects holes without a usable measurement interval', () => {
  const service = createService();

  assert.throws(
    () => service.buildMonitorDeviceParams({
      id: 12,
      hole_number: 'CX-05',
      depth: 4.55,
      measurement_interval: 0,
      initial_measurement_distance: 0.05
    }),
    /未配置有效测量间隔/
  );
});

test('monitor start sends derived params through /monitor/set-params', async () => {
  let request;
  const service = createService({
    fetchImpl: async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({ success: true, data: { taskId: 101 } });
        }
      };
    }
  });

  const result = await service.createGatewayMonitorParamsSetTask({
    taskId: 'task-1',
    imei: 'TEST-IMEI',
    metadata: { adminHoleId: 12 }
  });

  assert.equal(result.gatewayTaskId, 101);
  assert.equal(request.url, 'http://gateway.test/monitor/set-params');
  assert.equal(request.options.method, 'POST');
  assert.deepEqual(JSON.parse(request.options.body), {
    imei: 'TEST-IMEI',
    params: {
      monitorNodesNum: 10,
      monitorTestDis: 500,
      monitorFromStartDis: 50
    }
  });
  assert.equal(result.conversion.deviceDepthM, 4.55);

  // 测孔上下文必须按 adminHoleId 从管理端库读取。
  assert.deepEqual(service.queriedStatements[0].params, [12]);
});

test('monitor start fails when the gateway rejects the params task', async () => {
  const service = createService({
    fetchImpl: async () => ({
      ok: false,
      status: 409,
      async text() {
        return JSON.stringify({ success: false, error: 'IMEI TEST-IMEI already has a task in progress' });
      }
    })
  });

  await assert.rejects(
    () => service.createGatewayMonitorParamsSetTask({
      taskId: 'task-1',
      imei: 'TEST-IMEI',
      metadata: { adminHoleId: 12 }
    }),
    /already has a task in progress/
  );
});

test('monitor start dispatches /monitor/start after the params task completes', async () => {
  const service = createService();
  let monitorStartCalled = false;
  service.createGatewayMonitorTask = async () => {
    monitorStartCalled = true;
    return 202;
  };
  service.schedulePoller = () => {};
  service.deliverCallback = async () => {};

  await service.handleMonitorParamsSetCompletion(
    {
      taskId: 'task-2',
      imei: 'TEST-IMEI',
      metadata: { adminHoleId: 12 },
      scheduledTaskId: 101,
      pollIntervalMs: 1000,
      sendResponse: {
        phase: 'set_params',
        monitorParams: {
          monitorNodesNum: 10,
          testDistanceMm: 500,
          fromStartDistanceMm: 50,
          deviceDepthM: 4.55
        }
      },
      resultPayload: null
    },
    { task_id: 101, status: 'SUCCESS' }
  );

  assert.equal(monitorStartCalled, true);
  assert.equal(service.executedStatements.length, 1);

  const [, sendResponseJson, resultPayloadJson] = service.executedStatements[0].params;
  assert.match(sendResponseJson, /"phase":"monitor_start"/);
  assert.match(resultPayloadJson, /monitor_params_set/);
  assert.match(resultPayloadJson, /监测节点数=10/);
});
