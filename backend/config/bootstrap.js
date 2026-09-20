async function ensureColumn(datastore, tableName, columnName, alterSql) {
  const result = await datastore.sendNativeQuery(
    `SELECT COUNT(*) AS total
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = $1
       AND COLUMN_NAME = $2`,
    [tableName, columnName]
  );
  const total = Number(result.rows[0]?.total || 0);
  if (total === 0) {
    await datastore.sendNativeQuery(alterSql);
  }
}

async function ensureDecimalPrecision(datastore, tableName, columnName, precision, scale, alterSql) {
  const result = await datastore.sendNativeQuery(
    `SELECT NUMERIC_PRECISION AS numeric_precision, NUMERIC_SCALE AS numeric_scale
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = $1
       AND COLUMN_NAME = $2
     LIMIT 1`,
    [tableName, columnName]
  );
  const column = result.rows[0];
  if (!column) {
    return;
  }

  const currentPrecision = Number(column.numeric_precision || 0);
  const currentScale = Number(column.numeric_scale || 0);
  if (currentPrecision < precision || currentScale < scale) {
    await datastore.sendNativeQuery(alterSql);
  }
}

async function ensureRuntimeSchema() {
  const datastore = sails.getDatastore();

  await ensureColumn(
    datastore,
    'monitoring_holes',
    'upper_device_id',
    'ALTER TABLE monitoring_holes ADD COLUMN upper_device_id INT NULL COMMENT "Associated upper device ID" AFTER collection_method'
  );

  await ensureColumn(
    datastore,
    'upper_devices',
    'wire_change_mileage',
    'ALTER TABLE upper_devices ADD COLUMN wire_change_mileage DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT "Wire change warning mileage (m)" AFTER signal_strength'
  );
  await ensureColumn(
    datastore,
    'upper_devices',
    'total_mileage',
    'ALTER TABLE upper_devices ADD COLUMN total_mileage DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT "Upper device total mileage (m)" AFTER wire_change_mileage'
  );
  await ensureColumn(
    datastore,
    'upper_devices',
    'inspection_mileage',
    'ALTER TABLE upper_devices ADD COLUMN inspection_mileage DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT "Inspection warning mileage (m)" AFTER total_mileage'
  );
  await ensureColumn(
    datastore,
    'monitoring_holes',
    'warning_yellow_threshold',
    'ALTER TABLE monitoring_holes ADD COLUMN warning_yellow_threshold DECIMAL(10,2) NULL COMMENT "Yellow warning threshold" AFTER warning_standard'
  );
  await ensureColumn(
    datastore,
    'monitoring_holes',
    'warning_red_threshold',
    'ALTER TABLE monitoring_holes ADD COLUMN warning_red_threshold DECIMAL(10,2) NULL COMMENT "Red warning threshold" AFTER warning_yellow_threshold'
  );
  await ensureColumn(
    datastore,
    'monitoring_holes',
    'initial_pipe_batch_number',
    'ALTER TABLE monitoring_holes ADD COLUMN initial_pipe_batch_number VARCHAR(50) NULL COMMENT "Initial pipe batch number" AFTER warning_count'
  );
  await ensureColumn(
    datastore,
    'monitoring_holes',
    'initial_measurement_distance',
    'ALTER TABLE monitoring_holes ADD COLUMN initial_measurement_distance DECIMAL(6,3) DEFAULT 0.05 COMMENT "Initial measurement distance (m)" AFTER measurement_interval'
  );

  await ensureColumn(
    datastore,
    'raw_measurement_data',
    'node',
    'ALTER TABLE raw_measurement_data ADD COLUMN node INT NULL COMMENT "Node number" AFTER batch_number'
  );
  await ensureColumn(
    datastore,
    'raw_measurement_data',
    'y_average',
    'ALTER TABLE raw_measurement_data ADD COLUMN y_average DECIMAL(12,6) NULL COMMENT "Y average" AFTER negative_value'
  );
  await ensureColumn(
    datastore,
    'raw_measurement_data',
    'inclination_angle',
    'ALTER TABLE raw_measurement_data ADD COLUMN inclination_angle DECIMAL(12,8) NULL COMMENT "Inclination angle" AFTER y_average'
  );
  await ensureColumn(
    datastore,
    'raw_measurement_data',
    'depth_offset',
    'ALTER TABLE raw_measurement_data ADD COLUMN depth_offset DECIMAL(12,6) NULL COMMENT "Depth offset" AFTER inclination_angle'
  );
  await ensureColumn(
    datastore,
    'raw_measurement_data',
    'pipe_shape_value',
    'ALTER TABLE raw_measurement_data ADD COLUMN pipe_shape_value DECIMAL(12,6) NULL COMMENT "Pipe shape value" AFTER depth_offset'
  );

  await ensureDecimalPrecision(
    datastore,
    'lower_devices',
    'k_value',
    18,
    6,
    'ALTER TABLE lower_devices MODIFY COLUMN k_value DECIMAL(18,6) NULL COMMENT "K calibration value"'
  );
}

module.exports.bootstrap = function(done) {
  ensureRuntimeSchema()
    .then(() => done())
    .catch(done);
};
