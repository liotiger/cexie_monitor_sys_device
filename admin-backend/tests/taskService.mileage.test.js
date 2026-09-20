const assert = require('node:assert/strict');
const test = require('node:test');

const TaskService = require('../src/taskService');

function createService() {
  return new TaskService({
    db: {},
    gatewayDb: null,
    config: {},
    logger: { error() {} }
  });
}

test('calculates mileage from each depth change', () => {
  const service = createService();
  const mileage = service.calculateMeasurementMileage([
    { depth: 0.5 },
    { depth: 1 },
    { depth: 1.5 },
    { depth: 2 }
  ]);

  assert.equal(mileage, 2);
});

test('calculates mileage for both increasing and decreasing depth', () => {
  const service = createService();
  const mileage = service.calculateMeasurementMileage([
    { depth: 1 },
    { depth: 2 },
    { depth: 1.25 }
  ]);

  assert.equal(mileage, 2.75);
});

test('only creates warnings for enabled thresholds that are reached', () => {
  const service = createService();
  const warnings = service.buildMileageWarnings(120, 100, 0);

  assert.deepEqual(warnings.map(item => item.type), ['wire_change']);
  assert.equal(warnings[0].threshold, 100);
  assert.equal(service.buildMileageWarnings(99.99, 100, 150).length, 0);
});

test('updates upper and lower device statistics independently', async () => {
  const executions = [];
  const service = createService();
  service.db = {
    async execute(sql, params) {
      executions.push({ sql, params });
      return { affectedRows: 1 };
    },
    async query(sql) {
      if (sql.includes('FROM upper_devices')) {
        return [{ total_mileage: 101, wire_change_mileage: 100, inspection_mileage: 200 }];
      }
      if (sql.includes('FROM lower_devices')) {
        return [{ total_measurement_count: 2, total_measurement_depth: 1.5 }];
      }
      throw new Error(`Unexpected query: ${sql}`);
    }
  };

  const result = await service.updateDeviceMileageStats(
    { upper_device_id: 1, lower_device_id: 2 },
    [
      { depth: 0.5, mileage_delta: 0.5 },
      { depth: 1, mileage_delta: 0.5 }
    ]
  );

  assert.equal(executions.length, 2);
  assert.deepEqual(executions[0].params, [1, 1]);
  assert.deepEqual(executions[1].params, [2, 1.5, 2]);
  assert.equal(result.upperDevice.addedMileage, 1);
  assert.equal(result.lowerDevice.addedCount, 2);
  assert.deepEqual(result.upperDevice.warnings.map(item => item.type), ['wire_change']);
});
