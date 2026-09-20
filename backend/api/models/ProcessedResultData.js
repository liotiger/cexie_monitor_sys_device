module.exports = {
  datastore: 'default',
  tableName: 'processed_result_data',
  attributes: {
    raw_data_id: {
      type: 'number',
      required: true
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
    depth: {
      type: 'number',
      required: true
    },
    Y_average: {
      type: 'number',
      required: true
    },
    inclination_angle: {
      type: 'number',
      required: true
    },
    depth_offset: {
      type: 'number',
      required: true
    },
    current_pipe_value: {
      type: 'number',
      allowNull: true
    },
    initial_pipe_value: {
      type: 'number',
      allowNull: true
    },
    cumulative_displacement: {
      type: 'number',
      allowNull: true
    },
    previous_pipe_value: {
      type: 'number',
      allowNull: true
    },
    current_displacement: {
      type: 'number',
      allowNull: true
    },
    deformation_rate: {
      type: 'number',
      allowNull: true
    },
    warning_level: {
      type: 'string',
      isIn: ['normal', 'warning', 'alarm'],
      defaultsTo: 'normal'
    },
    warning_message: {
      type: 'string',
      maxLength: 200,
      allowNull: true
    },
    processed_time: {
      type: 'ref',
      columnType: 'datetime'
    },
    created_at: false,
    updated_at: false
  }
};
