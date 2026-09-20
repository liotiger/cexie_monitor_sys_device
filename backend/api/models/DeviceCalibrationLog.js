module.exports = {
  datastore: 'default',
  tableName: 'device_calibration_logs',
  attributes: {
    device_id: {
      type: 'number',
      required: true
    },
    calibration_date: {
      type: 'string',
      required: true
    },
    calibration_org: {
      type: 'string',
      required: true,
      maxLength: 100
    },
    calibrator: {
      type: 'string',
      maxLength: 50,
      allowNull: true
    },
    K_value: {
      type: 'number',
      required: true
    },
    beta_value: {
      type: 'number',
      required: true
    },
    temperature: {
      type: 'number',
      allowNull: true
    },
    humidity: {
      type: 'number',
      allowNull: true
    },
    calibration_data: {
      type: 'json'
    },
    calibration_points: {
      type: 'number',
      allowNull: true
    },
    standard_deviation: {
      type: 'number',
      allowNull: true
    },
    correlation_coefficient: {
      type: 'number',
      allowNull: true
    },
    certificate_number: {
      type: 'string',
      maxLength: 100,
      allowNull: true
    },
    certificate_file: {
      type: 'string',
      maxLength: 500,
      allowNull: true
    },
    valid_until: {
      type: 'string',
      allowNull: true
    },
    calibration_status: {
      type: 'string',
      isIn: ['passed', 'failed', 'pending'],
      defaultsTo: 'passed'
    },
    review_status: {
      type: 'string',
      isIn: ['pending', 'approved', 'rejected'],
      defaultsTo: 'pending'
    },
    created_by: {
      type: 'number',
      allowNull: true
    },
    reviewed_by: {
      type: 'number',
      allowNull: true
    },
    reviewed_at: {
      type: 'ref',
      columnType: 'datetime'
    },
    review_notes: {
      type: 'string',
      allowNull: true
    }
  }
};
