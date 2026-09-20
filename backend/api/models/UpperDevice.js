module.exports = {
  datastore: 'default',
  tableName: 'upper_devices',
  attributes: {
    imei: {
      type: 'string',
      required: true,
      unique: true,
      maxLength: 20
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
    firmware_version: {
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
    signal_strength: {
      type: 'number',
      allowNull: true
    },
    wire_change_mileage: {
      type: 'number',
      defaultsTo: 0
    },
    total_mileage: {
      type: 'number',
      defaultsTo: 0
    },
    inspection_mileage: {
      type: 'number',
      defaultsTo: 0
    },
    status: {
      type: 'string',
      isIn: ['idle', 'active', 'fault', 'calibration_expired'],
      defaultsTo: 'idle'
    },
    created_by: {
      type: 'number',
      allowNull: true
    },
    created_at: false,
    updated_at: false
  }
};
