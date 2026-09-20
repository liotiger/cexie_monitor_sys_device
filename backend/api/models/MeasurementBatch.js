module.exports = {
  datastore: 'default',
  tableName: 'measurement_batches',
  attributes: {
    batch_number: {
      type: 'string',
      required: true,
      unique: true,
      maxLength: 50
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
    total_points: {
      type: 'number',
      defaultsTo: 0
    },
    operator_id: {
      type: 'number',
      allowNull: true
    },
    batch_status: {
      type: 'string',
      isIn: ['measuring', 'completed', 'aborted'],
      defaultsTo: 'measuring'
    },
    updated_at: false
  }
};
