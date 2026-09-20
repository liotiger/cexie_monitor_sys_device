module.exports = {
  datastore: 'default',
  tableName: 'deformation_curves',
  attributes: {
    hole_id: {
      type: 'number',
      required: true
    },
    curve_type: {
      type: 'string',
      required: true,
      isIn: ['single', 'history']
    },
    measurement_time: {
      type: 'ref',
      columnType: 'datetime',
      required: true
    },
    depth_data: {
      type: 'json',
      required: true
    },
    displacement_data: {
      type: 'json',
      required: true
    },
    curve_parameters: {
      type: 'json'
    },
    image_url: {
      type: 'string',
      maxLength: 500,
      allowNull: true
    },
    updated_at: false
  }
};
