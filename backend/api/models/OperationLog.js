module.exports = {
  datastore: 'default',
  tableName: 'operation_logs',
  attributes: {
    user_id: {
      type: 'number',
      required: true
    },
    operation_type: {
      type: 'string',
      required: true,
      maxLength: 50
    },
    operation_target: {
      type: 'string',
      maxLength: 100,
      allowNull: true
    },
    target_id: {
      type: 'number',
      allowNull: true
    },
    operation_details: {
      type: 'string',
      allowNull: true
    },
    ip_address: {
      type: 'string',
      maxLength: 45,
      allowNull: true
    },
    user_agent: {
      type: 'string',
      allowNull: true
    },
    operation_time: {
      type: 'ref',
      columnType: 'datetime'
    },
    created_at: false,
    updated_at: false
  }
};
