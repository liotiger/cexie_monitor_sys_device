module.exports = {
  datastore: 'default',
  tableName: 'role_permissions',
  attributes: {
    role_id: {
      type: 'number',
      required: true
    },
    permission_id: {
      type: 'number',
      required: true
    },
    updated_at: false
  }
};
