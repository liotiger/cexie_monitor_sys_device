module.exports = {
  datastore: 'default',
  tableName: 'raw_measurement_data',
  attributes: {
    measurement_uuid: {
      type: 'string',
      required: true,
      unique: true,
      maxLength: 36
    },
    hole_id: {
      type: 'number',
      required: true
    },
    device_id: {
      type: 'number',
      required: true
    },
    measurement_time: {
      type: 'ref',
      columnType: 'datetime',
      required: true
    },
    measurement_mode: {
      type: 'string',
      required: true,
      isIn: ['manual', 'auto', 'scheduled']
    },
    operator_id: {
      type: 'number',
      allowNull: true
    },
    batch_number: {
      type: 'string',
      maxLength: 50,
      allowNull: true
    },
    node: {
      type: 'number',
      allowNull: true
    },
    depth: {
      type: 'number',
      required: true
    },
    positive_value: {
      type: 'number',
      required: true
    },
    negative_value: {
      type: 'number',
      required: true
    },
    // 修复说明：客户端收到管理端回传原始点位后，需要把按业务公式计算出的派生参数直接落到原始数据表，避免后续只能依赖单独处理接口补算。
    y_average: {
      type: 'number',
      allowNull: true
    },
    inclination_angle: {
      type: 'number',
      allowNull: true
    },
    depth_offset: {
      type: 'number',
      allowNull: true
    },
    pipe_shape_value: {
      type: 'number',
      allowNull: true
    },
    temperature: {
      type: 'number',
      allowNull: true
    },
    battery_voltage: {
      type: 'number',
      allowNull: true
    },
    signal_strength: {
      type: 'number',
      allowNull: true
    },
    data_status: {
      type: 'string',
      isIn: ['raw', 'processed', 'invalid', 'warning'],
      defaultsTo: 'raw'
    },
    quality_flag: {
      type: 'string',
      isIn: ['good', 'fair', 'poor'],
      defaultsTo: 'good'
    },
    upload_time: {
      type: 'ref',
      columnType: 'datetime'
    },
    processed_time: {
      type: 'ref',
      columnType: 'datetime'
    },
    updated_at: false
  }
};
