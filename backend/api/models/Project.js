module.exports = {
  datastore: 'default',
  tableName: 'projects',
  attributes: {
    project_code: {
      type: 'string',
      required: true,
      unique: true,
      maxLength: 50
    },
    project_name: {
      type: 'string',
      required: true,
      maxLength: 200
    },
    location: {
      type: 'string',
      maxLength: 500,
      allowNull: true
    },
    client_name: {
      type: 'string',
      maxLength: 100,
      allowNull: true
    },
    contractor: {
      type: 'string',
      maxLength: 100,
      allowNull: true
    },
    supervisor: {
      type: 'string',
      maxLength: 100,
      allowNull: true
    },
    start_date: {
      type: 'string',
      allowNull: true
    },
    end_date: {
      type: 'string',
      allowNull: true
    },
    status: {
      type: 'string',
      isIn: ['planning', 'ongoing', 'paused', 'completed'],
      defaultsTo: 'planning'
    },
    created_by: {
      type: 'number',
      allowNull: true
    }
  }
};
