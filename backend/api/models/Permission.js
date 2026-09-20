module.exports = {
  datastore: 'default',
  tableName: 'permissions',
  attributes: {
    permission_code: {
      type: 'string',
      required: true,
      unique: true,
      maxLength: 100
    },
    permission_name: {
      type: 'string',
      required: true,
      maxLength: 200
    },
    permission_type: {
      type: 'string',
      isIn: ['system', 'project', 'data'],
      defaultsTo: 'system'
    },
    description: {
      type: 'string',
      maxLength: 500,
      allowNull: true
    },
    module: {
      type: 'string',
      maxLength: 50,
      allowNull: true
    }
  }
};
