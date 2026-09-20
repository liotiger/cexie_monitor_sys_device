module.exports = {
  datastore: 'default',
  tableName: 'monitoring_reports',
  attributes: {
    report_number: {
      type: 'string',
      required: true,
      unique: true,
      maxLength: 50
    },
    report_name: {
      type: 'string',
      required: true,
      maxLength: 200
    },
    project_id: {
      type: 'number',
      required: true
    },
    report_type: {
      type: 'string',
      required: true,
      isIn: ['daily', 'weekly', 'monthly', 'special']
    },
    report_date: {
      type: 'string',
      required: true
    },
    period_start: {
      type: 'string',
      allowNull: true
    },
    period_end: {
      type: 'string',
      allowNull: true
    },
    summary: {
      type: 'string',
      allowNull: true
    },
    hole_count: {
      type: 'number',
      defaultsTo: 0
    },
    measurement_count: {
      type: 'number',
      defaultsTo: 0
    },
    warning_count: {
      type: 'number',
      defaultsTo: 0
    },
    max_displacement: {
      type: 'number',
      allowNull: true
    },
    file_format: {
      type: 'string',
      isIn: ['excel', 'pdf', 'word'],
      defaultsTo: 'pdf'
    },
    file_path: {
      type: 'string',
      maxLength: 500,
      allowNull: true
    },
    file_size: {
      type: 'number',
      allowNull: true
    },
    generated_by: {
      type: 'number',
      allowNull: true
    },
    generated_at: {
      type: 'ref',
      columnType: 'datetime'
    },
    reviewed_by: {
      type: 'number',
      allowNull: true
    },
    reviewed_at: {
      type: 'ref',
      columnType: 'datetime'
    },
    created_at: false,
    updated_at: false
  }
};
