module.exports = {
  datastore: 'default',
  tableName: 'project_members',
  attributes: {
    project_id: {
      type: 'number',
      required: true
    },
    user_id: {
      type: 'number',
      required: true
    },
    project_role: {
      type: 'string',
      isIn: ['manager', 'member', 'viewer'],
      required: true
    },
    join_date: {
      type: 'string',
      required: true
    },
    leave_date: {
      type: 'string',
      allowNull: true
    },
    is_active: {
      type: 'boolean',
      defaultsTo: true
    }
  }
};
