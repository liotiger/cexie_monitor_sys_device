module.exports = {
  datastore: 'default',
  tableName: 'roles',
  attributes: {
    role_code: {
      type: 'string',
      required: true,
      unique: true,
      maxLength: 50
    },
    role_name: {
      type: 'string',
      required: true,
      maxLength: 100
    },
    role_type: {
      type: 'string',
      isIn: ['system', 'project'],
      defaultsTo: 'system'
    },
    description: {
      type: 'string',
      maxLength: 500,
      allowNull: true
    },
    is_default: {
      type: 'boolean',
      allowNull: true,
      defaultsTo: false
    }
  }
};
