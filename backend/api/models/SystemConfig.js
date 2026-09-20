module.exports = {
  datastore: 'default',
  tableName: 'system_config',
  attributes: {
    config_key: {
      type: 'string',
      required: true,
      unique: true,
      maxLength: 100
    },
    config_value: {
      type: 'string',
      allowNull: true
    },
    config_type: {
      type: 'string',
      maxLength: 50,
      allowNull: true
    },
    description: {
      type: 'string',
      maxLength: 200,
      allowNull: true
    }
  }
};
