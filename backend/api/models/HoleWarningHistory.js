module.exports = {
  datastore: 'default',
  tableName: 'hole_warning_history',
  attributes: {
    hole_id: {
      type: 'number',
      required: true
    },
    processed_result_id: {
      type: 'number',
      required: true
    },
    raw_data_id: {
      type: 'number',
      required: true
    },
    batch_number: {
      type: 'string',
      maxLength: 50,
      allowNull: true
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
    warning_level: {
      type: 'string',
      isIn: ['yellow', 'red'],
      required: true
    },
    threshold_value: {
      type: 'number',
      allowNull: true
    },
    current_displacement: {
      type: 'number',
      allowNull: true
    },
    warning_message: {
      type: 'string',
      maxLength: 255,
      allowNull: true
    },
    created_at: false,
    updated_at: false
  }
}
