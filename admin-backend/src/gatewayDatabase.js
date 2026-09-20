const mysql = require('mysql2/promise');

class GatewayDatabase {
  constructor(config) {
    this.config = config;
    this.pool = null;
  }

  async init() {
    if (this.pool) {
      return this.pool;
    }

    this.pool = mysql.createPool(this.config);
    await this.pool.query('SELECT 1');
    return this.pool;
  }

  async query(sql, params = []) {
    await this.init();
    const [rows] = await this.pool.query(sql, params);
    return rows;
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}

module.exports = GatewayDatabase;
