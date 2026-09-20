module.exports = {
  datastore: 'default',
  tableName: 'devices',
  attributes: {
    device_id: {
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
    device_type: {
      type: 'string',
      maxLength: 50,
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
    purchase_date: {
      type: 'string',
      allowNull: true
    },
    dtu_id: {
      type: 'string',
      maxLength: 50,
      allowNull: true
    },
    network_status: {
      type: 'string',
      isIn: ['online', 'offline'],
      defaultsTo: 'offline'
    },
    last_online_time: {
      type: 'ref',
      columnType: 'datetime'
    },
    ip_address: {
      type: 'string',
      maxLength: 45,
      allowNull: true
    },
    communication_protocol: {
      type: 'string',
      maxLength: 50,
      allowNull: true
    },
    signal_strength: {
      type: 'number',
      allowNull: true
    },
    K_value: {
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
    status: {
      type: 'string',
      isIn: ['idle', 'measuring', 'maintenance', 'fault', 'calibrating', 'charging'],
      defaultsTo: 'idle'
    },
    battery_level: {
      type: 'number',
      allowNull: true
    },
    temperature: {
      type: 'number',
      allowNull: true
    },
    current_hole_id: {
      type: 'number',
      allowNull: true
    },
    current_project_id: {
      type: 'number',
      allowNull: true
    },
    total_usage_hours: {
      type: 'number',
      allowNull: true
    },
    total_measurement_count: {
      type: 'number',
      allowNull: true
    },
    total_measurement_depth: {
      type: 'number',
      allowNull: true
    },
    created_by: {
      type: 'number',
      allowNull: true
    },
    created_at: {
      type: 'ref',
      columnType: 'datetime'
    },
    updated_at: {
      type: 'ref',
      columnType: 'datetime'
    }
  }
};
