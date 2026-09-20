module.exports = {
  datastore: 'default',
  tableName: 'device_bindings',
  attributes: {
    upper_device_id: {
      type: 'number',
      required: true
    },
    lower_device_id: {
      type: 'number',
      required: true
    },
    binding_type: {
      type: 'string',
      isIn: ['permanent', 'temporary'],
      defaultsTo: 'permanent'
    },
    status: {
      type: 'string',
      isIn: ['active', 'inactive'],
      defaultsTo: 'active'
    },
    bind_time: {
      type: 'ref',
      columnType: 'datetime'
    },
    unbind_time: {
      type: 'ref',
      columnType: 'datetime'
    }
  }
};
