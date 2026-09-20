module.exports = {
  datastore: 'default',
  tableName: 'task_execution_logs',
  attributes: {
    task_id: {
      type: 'number',
      required: true
    },
    execution_time: {
      type: 'ref',
      columnType: 'datetime',
      required: true
    },
    status: {
      type: 'string',
      required: true,
      isIn: ['success', 'failed', 'skipped']
    },
    error_message: {
      type: 'string',
      allowNull: true
    },
    measurement_id: {
      type: 'number',
      allowNull: true
    },
    updated_at: false
  }
};
