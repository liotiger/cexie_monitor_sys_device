module.exports = {
  datastore: 'default',
  tableName: 'lower_devices',
  attributes: {
    device_code: {
      type: 'string',
      required: true,
      unique: true,
      maxLength: 50
    },
    device_name: {
      type: 'string',
      maxLength: 100,
      allowNull: true
    },
    manufacturer: {
      type: 'string',
      maxLength: 100,
      allowNull: true
    },
    model: {
      type: 'string',
      maxLength: 50,
      allowNull: true
    },
    serial_number: {
      type: 'string',
      maxLength: 100,
      allowNull: true
    },
    k_value: {
      type: 'number',
      allowNull: true
    },
    beta_value: {
      type: 'number',
      allowNull: true
    },
    calibration_date: {
      type: 'string',
      allowNull: true
    },
    calibration_org: {
      type: 'string',
      maxLength: 100,
      allowNull: true
    },
    valid_until: {
      type: 'string',
      allowNull: true
    },
    calibration_status: {
      type: 'string',
      isIn: ['valid', 'expired', 'pending'],
      defaultsTo: 'valid'
    },
    current_hole_id: {
      type: 'number',
      allowNull: true
    },
    current_project_id: {
      type: 'number',
      allowNull: true
    },
    total_measurement_count: {
      type: 'number',
      defaultsTo: 0
    },
    total_measurement_depth: {
      type: 'number',
      defaultsTo: 0
    },
    status: {
      type: 'string',
      isIn: ['idle', 'measuring', 'maintenance', 'fault', 'calibrating'],
      defaultsTo: 'idle'
    },
    created_by: {
      type: 'number',
      allowNull: true
    }
  }
};
