const assert = require('node:assert/strict');
const test = require('node:test');

const TaskService = require('../src/taskService');

// 修复说明：该样本取自网关库 dg_device_params 的真实 params_json。
// 关键点：待写入参数分散在 part2（速度类）与 part3（监测类），只读取单个区段会漏掉速度类参数。
const REAL_PARAMS_JSON = {
  raw: {
    part1: {
      address: 0,
      quantity: 14,
      responseHex: '01 03 1C 01 00 01 00 C0 00 45 5A DC 33 00 01 C0 00 45 5A 7A 96 00 02 00 02 00 00 00 01 00 01 90 4A',
      registersU16: [256, 256, 49152, 17754, 56371, 1, 49152, 17754, 31382, 2, 2, 0, 1, 1]
    },
    part2: {
      address: 128,
      quantity: 20,
      responseHex: '01 03 28 00 00 41 70 00 00 41 A0 00 00 43 FA 00 00 42 48 00 00 43 96 00 00 43 48 00 00 44 16 00 00 00 00 00 00 00 00 00 00 43 96 9B 27',
      registersU16: [0, 16752, 0, 16800, 0, 17402, 0, 16968, 0, 17302, 0, 17224, 0, 17430, 0, 0, 0, 0, 0, 17302]
    },
    part3: {
      address: 256,
      quantity: 28,
      responseHex: '01 03 38 02 01 0B 03 0A 00 00 09 00 0C 00 00 00 00 00 00 00 00 00 00 81 E6 C2 BC 00 03 01 F4 00 C8 00 00 00 00 43 FA 00 00 42 48 47 D9 AF 53 67 EE 3F 47 00 0A 07 D0 00 00 42 48 E6 9B',
      registersU16: [
        513, 2819, 2560, 9, 12, 0, 0, 0, 0, 0, 33254, 49852, 3, 500, 200, 0,
        0, 17402, 0, 16968, 18393, 44883, 26606, 16199, 10, 2000, 0, 16968
      ]
    }
  },
  part1: {
    wMcNo: 1,
    tMactype: 0,
    dwVersion: 16777472,
    tAxisMode: 2,
    fFbMoveDis: 3500,
    dwVersionHex: '0x01000100',
    fAxisMoveDis: 3500,
    wMachineType: 1,
    nAxisSendPuls: 121907,
    nFbReceivePuls: 162454
  },
  part2: {
    fWorkSpd: 200,
    fSpaceSpd: 300,
    fStartSpd: 15,
    fManualSpd: 50,
    fOrgAccSpd: 500,
    fOrgLowSpd: 20,
    fWorkAccSpd: 600,
    fManualAccSpd: 300
  },
  part3: {
    wThreshold: 3,
    nScanOntime: 200,
    wCommDelayMs: 500,
    fMonitorTestDis: 500,
    wMonitorNodesNum: 10,
    fMonitorClosetoDis: 50,
    fMonitorFromStartDis: 50,
    wMonitorNodeOnDelayMs: 2000
  },
  wordOrder: 'low-high'
};

function createService(paramsJson) {
  const gatewayDb = {
    async query() {
      return [{
        imei: '865229085206945',
        unit_id: 1,
        param_version_hex: '0x01000100',
        params_json: paramsJson,
        collected_at: '2026-09-09T08:00:00.000Z'
      }];
    }
  };
  return new TaskService({ db: { async query() { return []; } }, gatewayDb, config: {}, logger: console });
}

test('params fetch maps speed params from part2 and monitor params from part3', async () => {
  const service = createService(REAL_PARAMS_JSON);

  const snapshot = await service.readDeviceParamSnapshot('865229085206945');

  // part2 的速度类参数必须被读到，不能只读 part3。
  assert.equal(snapshot.params.startSpd, 15);
  assert.equal(snapshot.params.orgLowSpd, 20);
  assert.equal(snapshot.params.orgAccSpd, 500);
  assert.equal(snapshot.params.manualSpd, 50);
  assert.equal(snapshot.params.manualAccSpd, 300);
  assert.equal(snapshot.params.workSpd, 200);
  assert.equal(snapshot.params.workAccSpd, 600);
  assert.equal(snapshot.params.spaceSpd, 300);

  // part3 的监测类参数。
  assert.equal(snapshot.params.monitorTestDis, 500);
  assert.equal(snapshot.params.monitorNodesNum, 10);
  assert.equal(snapshot.params.monitorClosetoDis, 50);
  assert.equal(snapshot.params.monitorFromStartDis, 50);
  assert.equal(snapshot.params.monitorNodeOnDelayMs, 2000);

  // 该快照未覆盖 deviceNode 所在寄存器区段，因此不应凭空出现。
  assert.equal(snapshot.params.deviceNode, undefined);

  // raw 区段是寄存器原文，不能被当作参数键混入结果。
  assert.equal(snapshot.rawParams.address, undefined);
  assert.equal(snapshot.rawParams.registersU16, undefined);

  assert.equal(snapshot.sourceTable, 'dg_device_params');
  assert.equal(snapshot.paramVersionHex, '0x01000100');
  assert.equal(snapshot.collectedAt, '2026-09-09T08:00:00.000Z');
});

test('params fetch reads a flat params_json without sections', async () => {
  const service = createService({ fMonitorTestDis: 500, wMonitorNodesNum: 10, fStartSpd: 15 });

  const snapshot = await service.readDeviceParamSnapshot('865229085206945');

  assert.equal(snapshot.params.monitorTestDis, 500);
  assert.equal(snapshot.params.monitorNodesNum, 10);
  assert.equal(snapshot.params.startSpd, 15);
});

test('params fetch ignores non numeric register values', async () => {
  const service = createService({
    part2: { fStartSpd: 'not-a-number' },
    part3: { fMonitorTestDis: null, wMonitorNodesNum: 10 }
  });

  const snapshot = await service.readDeviceParamSnapshot('865229085206945');

  assert.equal(snapshot.params.startSpd, undefined);
  assert.equal(snapshot.params.monitorTestDis, undefined);
  assert.equal(snapshot.params.monitorNodesNum, 10);
});
