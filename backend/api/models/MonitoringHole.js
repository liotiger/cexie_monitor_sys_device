module.exports = {
  datastore: 'default',
  tableName: 'monitoring_holes',
  attributes: {
    hole_number: {
      type: 'string',
      required: true,
      maxLength: 50
    },
    project_id: {
      type: 'number',
      required: true
    },
    hole_name: {
      type: 'string',
      maxLength: 100,
      allowNull: true
    },
    hole_type: {
      type: 'string',
      required: true,
      isIn: ['retaining_structure', 'soil_body']
    },
    location_description: {
      type: 'string',
      maxLength: 500,
      allowNull: true
    },
    coordinates: {
      type: 'json'
    },
    depth: {
      type: 'number',
      required: true
    },
    measurement_interval: {
      type: 'number',
      defaultsTo: 0.5
    },
    // 修复说明：初始测量距离（米），对应设备参数 fMonitorFromStartDis，
    // 开始监测前会参与“孔深 = fMonitorTestDis*(wMonitorNodesNum-1) + fMonitorFromStartDis”反算。
    initial_measurement_distance: {
      type: 'number',
      defaultsTo: 0.05
    },
    calculation_reference: {
      type: 'string',
      isIn: ['top', 'bottom'],
      defaultsTo: 'bottom'
    },
    warning_standard: {
      type: 'number',
      allowNull: true
    },
    warning_yellow_threshold: {
      type: 'number',
      allowNull: true
    },
    warning_red_threshold: {
      type: 'number',
      allowNull: true
    },
    collection_method: {
      type: 'string',
      isIn: ['manual', 'auto'],
      defaultsTo: 'manual'
    },
    upper_device_id: {
      type: 'number',
      allowNull: true
    },
    lower_device_id: {
      type: 'number',
      allowNull: true
    },
    timer_enabled: {
      type: 'boolean',
      defaultsTo: false
    },
    timer_type: {
      type: 'string',
      isIn: ['interval', 'fixed_time'],
      defaultsTo: 'interval'
    },
    timer_interval_minutes: {
      type: 'number',
      allowNull: true
    },
    fixed_times: {
      type: 'json'
    },
    timer_start_date: {
      type: 'string',
      allowNull: true
    },
    timer_end_date: {
      type: 'string',
      allowNull: true
    },
    status: {
      type: 'string',
      isIn: ['active', 'inactive', 'completed'],
      defaultsTo: 'active'
    },
    last_measurement_time: {
      type: 'ref',
      columnType: 'datetime'
    },
    next_scheduled_time: {
      type: 'ref',
      columnType: 'datetime'
    },
    total_measurements: {
      type: 'number',
      defaultsTo: 0
    },
    warning_count: {
      type: 'number',
      defaultsTo: 0
    },
    initial_pipe_batch_number: {
      type: 'string',
      maxLength: 50,
      allowNull: true
    },
    created_by: {
      type: 'number',
      allowNull: true
    }
  }
};
