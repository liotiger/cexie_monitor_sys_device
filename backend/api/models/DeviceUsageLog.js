module.exports = {
  datastore: 'default',
  tableName: 'device_usage_logs',
  attributes: {
    device_id: {
      type: 'number',
      required: true
    },
    user_id: {
      type: 'number',
      required: true
    },
    project_id: {
      type: 'number',
      required: true
    },
    hole_id: {
      type: 'number',
      required: true
    },
    start_time: {
      type: 'ref',
      columnType: 'datetime',
      required: true
    },
    end_time: {
      type: 'ref',
      columnType: 'datetime'
    },
    measurement_count: {
      type: 'number',
      defaultsTo: 0
    },
    total_measurement_depth: {
      type: 'number',
      allowNull: true
    },
    total_measurement_time: {
      type: 'number',
      allowNull: true
    },
    average_depth_per_measurement: {
      type: 'number',
      allowNull: true
    },
    start_battery_level: {
      type: 'number',
      allowNull: true
    },
    end_battery_level: {
      type: 'number',
      allowNull: true
    },
    start_temperature: {
      type: 'number',
      allowNull: true
    },
    end_temperature: {
      type: 'number',
      allowNull: true
    },
    start_signal_strength: {
      type: 'number',
      allowNull: true
    },
    end_signal_strength: {
      type: 'number',
      allowNull: true
    },
    updated_at: false
  }
};
