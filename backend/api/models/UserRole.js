module.exports = {
  datastore: 'default',
  tableName: 'user_roles',
  attributes: {
    user_id: {
      type: 'number',
      required: true
    },
    role_id: {
      type: 'number',
      required: true
    }
  }
};
