module.exports.datastores = {
  development: {
    adapter: 'sails-mysql',
    url:
      process.env.BUSINESS_DB_URL ||
      process.env.DATABASE_URL ||
      'mysql://root:123456@localhost:3306/cexie_monitor_business'
  }
};