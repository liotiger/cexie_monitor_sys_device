module.exports = {
  datastore: 'default',
  tableName: 'project_progress',
  attributes: {
    project_id: {
      type: 'number',
      required: true
    },
    progress_date: {
      type: 'string',
      required: true
    },
    progress_description: {
      type: 'string',
      allowNull: true
    },
    progress_percentage: {
      type: 'number',
      allowNull: true
    },
    photo_urls: {
      type: 'json'
    },
    recorded_by: {
      type: 'number',
      allowNull: true
    },
    updated_at: false
  }
};
