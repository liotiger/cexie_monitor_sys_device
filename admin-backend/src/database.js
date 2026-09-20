const fs = require('fs/promises');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');

const DEFAULT_ADMIN = {
  username: 'admin',
  email: 'admin@example.com',
  realName: '超级管理员',
  status: 'active',
  passwordHash: '$2a$10$Po8JFmr04Y.V6Qr5PNnJde8l5on4EKbPxJtLrmDjDHdXq9BBptomq'
};

const LEGACY_INVALID_ADMIN_HASHES = new Set([
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZRGdjGj/n3.eG1H2IvVxW5lC5q5K.'
]);

class Database {
  constructor(config) {
    this.config = config;
    this.pool = null;
  }

  async init() {
    if (this.pool) {
      return this.pool;
    }

    this.pool = mysql.createPool(this.config.database);
    await this.pool.query('SELECT 1');
    await this.ensureSchema();
    return this.pool;
  }

  async ensureSchema() {
    const sql = await fs.readFile(this.config.paths.initSql, 'utf8');
    const statements = sql
      .replace(/^\uFEFF/, '')
      .split(/;\s*(?:\r?\n|$)/)
      .map(item => item.trim())
      .filter(Boolean);

    for (const statement of statements) {
      try {
        await this.pool.query(statement);
      } catch (error) {
        if ([
          'ER_DUP_FIELDNAME',
          'ER_DUP_KEYNAME',
          'ER_FK_DUP_NAME',
          'ER_CANT_CREATE_TABLE'
        ].includes(error.code)) {
          continue;
        }
        throw error;
      }
    }

    await this.ensureRuntimeMigrations();
    await this.ensureBootstrapAdmin();
  }

  async ensureRuntimeMigrations() {
    await this.ensureLowerDeviceCalibrationPrecision();
    await this.ensureAdminCustomerContactColumns();
    await this.ensureUpperDeviceMileageColumns();
    await this.ensureDeviceManagementSchema();
  }

  async ensureDeviceManagementSchema() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS warehouses (
        id INT PRIMARY KEY AUTO_INCREMENT,
        warehouse_code VARCHAR(64) NOT NULL,
        warehouse_name VARCHAR(128) NOT NULL,
        address VARCHAR(255) NULL,
        status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_warehouses_code (warehouse_code),
        KEY idx_warehouses_status (status)
      )`);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS device_inventory (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        warehouse_id INT NOT NULL,
        device_type ENUM('upper', 'lower') NOT NULL,
        upper_device_id INT NULL,
        lower_device_id INT NULL,
        inventory_status ENUM('in_stock', 'sold', 'returned', 'scrapped') NOT NULL DEFAULT 'in_stock',
        customer_id BIGINT NULL,
        stocked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        sold_at TIMESTAMP NULL,
        returned_at TIMESTAMP NULL,
        notes VARCHAR(500) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_device_inventory_upper (upper_device_id),
        UNIQUE KEY uk_device_inventory_lower (lower_device_id),
        KEY idx_device_inventory_status (inventory_status),
        KEY idx_device_inventory_customer (customer_id),
        KEY idx_device_inventory_warehouse (warehouse_id)
      )`);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS device_sales (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        inventory_id BIGINT NOT NULL,
        customer_id BIGINT NOT NULL,
        sold_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        returned_at TIMESTAMP NULL,
        sale_status ENUM('active', 'returned') NOT NULL DEFAULT 'active',
        operator_id INT NULL,
        notes VARCHAR(500) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_device_sales_inventory (inventory_id),
        KEY idx_device_sales_customer (customer_id),
        KEY idx_device_sales_status (sale_status)
      )`);
    await this.pool.execute(
      `INSERT IGNORE INTO warehouses (warehouse_code, warehouse_name, status)
       VALUES ('MAIN', '主仓库', 'active')`
    );
    await this.pool.query(
      `INSERT IGNORE INTO device_inventory (warehouse_id, device_type, upper_device_id, inventory_status, stocked_at)
       SELECT w.id, 'upper', ud.id, 'in_stock', COALESCE(ud.created_at, CURRENT_TIMESTAMP)
       FROM warehouses w CROSS JOIN upper_devices ud WHERE w.warehouse_code = 'MAIN'`
    );
    await this.pool.query(
      `INSERT IGNORE INTO device_inventory (warehouse_id, device_type, lower_device_id, inventory_status, stocked_at)
       SELECT w.id, 'lower', ld.id, 'in_stock', COALESCE(ld.created_at, CURRENT_TIMESTAMP)
       FROM warehouses w CROSS JOIN lower_devices ld WHERE w.warehouse_code = 'MAIN'`
    );
    await this.pool.query(
      `UPDATE device_inventory di
       JOIN admin_customer_upper_devices acu ON acu.upper_device_id = di.upper_device_id
       SET di.inventory_status = 'sold', di.customer_id = acu.customer_id,
           di.sold_at = COALESCE(di.sold_at, CURRENT_TIMESTAMP)
       WHERE di.device_type = 'upper'`
    );
    await this.pool.query(
      `UPDATE device_inventory di
       JOIN device_bindings db ON db.lower_device_id = di.lower_device_id AND db.status = 'active'
       JOIN admin_customer_upper_devices acu ON acu.upper_device_id = db.upper_device_id
       SET di.inventory_status = 'sold', di.customer_id = acu.customer_id,
           di.sold_at = COALESCE(di.sold_at, CURRENT_TIMESTAMP)
       WHERE di.device_type = 'lower'`
    );
  }

  async ensureUpperDeviceMileageColumns() {
    await this.ensureColumn(
      'upper_devices',
      'wire_change_mileage',
      `ALTER TABLE upper_devices
       ADD COLUMN wire_change_mileage DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '换线预警里程(m)' AFTER signal_strength`
    );
    await this.ensureColumn(
      'upper_devices',
      'total_mileage',
      `ALTER TABLE upper_devices
       ADD COLUMN total_mileage DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT '上位机累计监测里程(m)' AFTER wire_change_mileage`
    );
    await this.ensureColumn(
      'upper_devices',
      'inspection_mileage',
      `ALTER TABLE upper_devices
       ADD COLUMN inspection_mileage DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '检查预警里程(m)' AFTER total_mileage`
    );
  }

  async ensureColumn(tableName, columnName, alterSql) {
    const [rows] = await this.pool.query(
      `SELECT COUNT(*) AS total
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = ?
         AND COLUMN_NAME = ?`,
      [tableName, columnName]
    );

    if (Number(rows[0]?.total || 0) === 0) {
      await this.pool.query(alterSql);
    }
  }

  async ensureAdminCustomerContactColumns() {
    await this.ensureColumn(
      'admin_customers',
      'contact_person',
      `ALTER TABLE admin_customers
       ADD COLUMN contact_person VARCHAR(64) NULL COMMENT '联系人' AFTER customer_name`
    );
    await this.ensureColumn(
      'admin_customers',
      'contact_phone',
      `ALTER TABLE admin_customers
       ADD COLUMN contact_phone VARCHAR(32) NULL COMMENT '联系电话' AFTER contact_person`
    );
  }

  async ensureLowerDeviceCalibrationPrecision() {
    const [columns] = await this.pool.query(
      `SELECT NUMERIC_PRECISION AS numeric_precision, NUMERIC_SCALE AS numeric_scale
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'lower_devices'
         AND COLUMN_NAME = 'k_value'
       LIMIT 1`
    );
    const column = columns[0];
    if (!column) {
      return;
    }

    const precision = Number(column.numeric_precision || 0);
    const scale = Number(column.numeric_scale || 0);
    if (precision >= 18 && scale >= 6) {
      return;
    }

    await this.pool.query(
      `ALTER TABLE lower_devices
       MODIFY COLUMN k_value DECIMAL(18,6) NULL COMMENT 'K值(校准参数)'`
    );
  }

  async ensureBootstrapAdmin() {
    const [roles] = await this.pool.query(
      'SELECT id FROM roles WHERE role_code = ? LIMIT 1',
      ['admin']
    );
    const adminRoleId = roles[0]?.id;

    if (!adminRoleId) {
      return;
    }

    const [users] = await this.pool.query(
      'SELECT id, password_hash FROM users WHERE username = ? LIMIT 1',
      [DEFAULT_ADMIN.username]
    );

    let adminUserId = users[0]?.id || null;

    if (!adminUserId) {
      const [result] = await this.pool.execute(
        `INSERT INTO users (username, email, password_hash, real_name, phone, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          DEFAULT_ADMIN.username,
          DEFAULT_ADMIN.email,
          DEFAULT_ADMIN.passwordHash,
          DEFAULT_ADMIN.realName,
          '',
          DEFAULT_ADMIN.status
        ]
      );
      adminUserId = result.insertId;
    } else if (LEGACY_INVALID_ADMIN_HASHES.has(users[0].password_hash)) {
      await this.pool.execute(
        `UPDATE users
         SET password_hash = ?, status = ?, updated_at = NOW()
         WHERE id = ?`,
        [DEFAULT_ADMIN.passwordHash, DEFAULT_ADMIN.status, adminUserId]
      );
    }

    await this.pool.execute(
      `INSERT IGNORE INTO user_roles (user_id, role_id, created_at, updated_at)
       VALUES (?, ?, NOW(), NOW())`,
      [adminUserId, adminRoleId]
    );
  }

  async query(sql, params = []) {
    await this.init();
    const [rows] = await this.pool.query(sql, params);
    return rows;
  }

  async execute(sql, params = []) {
    await this.init();
    const [result] = await this.pool.execute(sql, params);
    return result;
  }

  async withTransaction(callback) {
    await this.init();
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const executor = {
        async query(sql, params = []) {
          const [rows] = await connection.query(sql, params);
          return rows;
        },
        async execute(sql, params = []) {
          const [result] = await connection.execute(sql, params);
          return result;
        }
      };
      const result = await callback(executor);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}

module.exports = Database;
