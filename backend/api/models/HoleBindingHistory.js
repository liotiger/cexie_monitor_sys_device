module.exports = {
  datastore: 'default',
  tableName: 'hole_binding_history',
  attributes: {
    hole_id: {
      type: 'number',
      required: true
    },
    device_id: {
      type: 'number',
      required: true
    },
    bind_time: {
      type: 'ref',
      columnType: 'datetime',
      required: true
    },
    unbind_time: {
      type: 'ref',
      columnType: 'datetime'
    },
    bind_type: {
      type: 'string',
      isIn: ['manual', 'auto', 'scheduled'],
      defaultsTo: 'manual'
    },
    bind_reason: {
      type: 'string',
      maxLength: 200,
      allowNull: true
    },
    unbind_reason: {
      type: 'string',
      maxLength: 200,
      allowNull: true
    },
    bind_operator: {
      type: 'number',
      allowNull: true
    },
    unbind_operator: {
      type: 'number',
      allowNull: true
    },
    measurement_count: {
      type: 'number',
      defaultsTo: 0
    },
    total_measurement_time: {
      type: 'number',
      defaultsTo: 0
    },
    updated_at: false
  }
};
