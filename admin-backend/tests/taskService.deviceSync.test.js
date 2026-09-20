const assert = require('node:assert/strict');
const test = require('node:test');

const TaskService = require('../src/taskService');

test('returns only sold lower devices assigned to the current customer with calibration fields', async () => {
  const queries = [];
  const db = {
    async query(sql, params) {
      queries.push({ sql, params });
      return [{
        id: 8,
        device_code: 'LOWER-008',
        k_value: 12345.678901,
        beta_value: 0.123456,
        calibration_date: new Date('2026-01-02T00:00:00Z'),
        calibration_org: '测试机构',
        valid_until: new Date('2027-01-02T00:00:00Z'),
        calibration_status: 'valid'
      }];
    }
  };
  const service = new TaskService({ db, gatewayDb: null, config: {}, logger: { error() {} } });

  const devices = await service.getLowerDevicesForCustomer(23);

  assert.deepEqual(queries[0].params, [23]);
  assert.match(queries[0].sql, /di\.inventory_status = 'sold'/);
  assert.match(queries[0].sql, /di\.customer_id = \?/);
  assert.equal(devices[0].k_value, 12345.678901);
  assert.equal(devices[0].beta_value, 0.123456);
  assert.equal(devices[0].calibration_date, '2026-01-02');
  assert.equal(devices[0].calibration_org, '测试机构');
  assert.equal(devices[0].valid_until, '2027-01-02');
});
