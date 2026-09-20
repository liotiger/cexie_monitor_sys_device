module.exports = {
  datastore: 'default',
  tableName: 'users',
  attributes: {
    username: {
      type: 'string',
      required: true,
      unique: true,
      maxLength: 50
    },
    email: {
      type: 'string',
      required: true,
      unique: true,
      isEmail: true,
      maxLength: 100
    },
    password_hash: {
      type: 'string',
      required: true,
      protect: true
    },
    real_name: {
      type: 'string',
      maxLength: 50,
      allowNull: true
    },
    phone: {
      type: 'string',
      maxLength: 20,
      allowNull: true
    },
    status: {
      type: 'string',
      isIn: ['active', 'inactive', 'locked'],
      defaultsTo: 'active'
    },
    last_login_time: {
      type: 'ref',
      columnType: 'datetime'
    }
  },
  customToJSON: function() {
    return _.omit(this, ['password_hash']);
  },
  beforeCreate: async function(values, proceed) {
    const bcrypt = require('bcryptjs');
    try {
      if (values.password_hash && !values.password_hash.startsWith('$2')) {
        const salt = await bcrypt.genSalt(10);
        values.password_hash = await bcrypt.hash(values.password_hash, salt);
      }
      return proceed();
    } catch (err) {
      return proceed(err);
    }
  },
  beforeUpdate: async function(values, proceed) {
    const bcrypt = require('bcryptjs');
    try {
      if (values.password_hash && !values.password_hash.startsWith('$2')) {
        const salt = await bcrypt.genSalt(10);
        values.password_hash = await bcrypt.hash(values.password_hash, salt);
      }
      return proceed();
    } catch (err) {
      return proceed(err);
    }
  }
};
