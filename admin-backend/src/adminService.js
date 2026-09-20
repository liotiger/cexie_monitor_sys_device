const bcrypt = require('bcryptjs');

class AdminService {
  constructor({ db, gatewayDb, config, fetchImpl = fetch }) {
    this.db = db;
    this.gatewayDb = gatewayDb;
    this.config = config || {};
    this.fetchImpl = fetchImpl;
    this.upperDeviceConnectedAtColumnPromise = null;
    this.customerCallbackKeyColumnPromise = null;
  }

  async getDashboardStats() {
    const [customerRow] = await this.db.query('SELECT COUNT(*) AS total FROM admin_customers');
    const [userRow] = await this.db.query(`
      SELECT COUNT(DISTINCT u.id) AS total
      FROM users u
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      LEFT JOIN roles r ON r.id = ur.role_id
      WHERE r.role_code IN ('admin', 'system_admin') OR u.username = 'admin'
    `);
    const [upperRow] = await this.db.query('SELECT COUNT(*) AS total FROM upper_devices');
    const [lowerRow] = await this.db.query('SELECT COUNT(*) AS total FROM lower_devices');
    const [rawDataRow] = await this.db.query('SELECT COUNT(*) AS total FROM raw_measurement_data');
    const [taskRow] = await this.db.query('SELECT COUNT(*) AS total FROM admin_device_tasks');
    const [soldDeviceRow] = await this.db.query(
      `SELECT COUNT(*) AS total
       FROM device_inventory
       WHERE inventory_status = 'sold'`
    );
    const [inStockDeviceRow] = await this.db.query(
      `SELECT COUNT(*) AS total
       FROM device_inventory
       WHERE inventory_status IN ('in_stock', 'returned')`
    );
    const [warehouseRow] = await this.db.query(
      `SELECT COUNT(*) AS total FROM warehouses WHERE status = 'active'`
    );
    const soldDevicesByCustomer = await this.db.query(
      `SELECT c.id, c.customer_code, c.customer_name,
              COUNT(di.id) AS sold_device_count,
              SUM(di.device_type = 'upper') AS sold_upper_count,
              SUM(di.device_type = 'lower') AS sold_lower_count
       FROM admin_customers c
       JOIN device_inventory di ON di.customer_id = c.id AND di.inventory_status = 'sold'
       GROUP BY c.id, c.customer_code, c.customer_name
       ORDER BY sold_device_count DESC, c.id ASC`
    );

    return {
      customers: customerRow?.total || 0,
      adminUsers: userRow?.total || 0,
      upperDevices: upperRow?.total || 0,
      lowerDevices: lowerRow?.total || 0,
      rawData: rawDataRow?.total || 0,
      tasks: taskRow?.total || 0,
      soldDevices: soldDeviceRow?.total || 0,
      inStockDevices: inStockDeviceRow?.total || 0,
      warehouses: warehouseRow?.total || 0,
      soldDevicesByCustomer
    };
  }

  async listWarehouses() {
    return this.db.query(
      `SELECT id, warehouse_code, warehouse_name, address, status, created_at, updated_at
       FROM warehouses
       ORDER BY status DESC, id ASC`
    );
  }

  async createWarehouse(payload = {}) {
    const warehouseCode = String(payload.warehouse_code || payload.warehouseCode || '').trim();
    const warehouseName = String(payload.warehouse_name || payload.warehouseName || '').trim();
    const address = this.nullIfEmpty(payload.address);
    if (!warehouseCode || !warehouseName) {
      throw new Error('仓库编码和仓库名称不能为空');
    }

    try {
      const result = await this.db.execute(
        `INSERT INTO warehouses (warehouse_code, warehouse_name, address, status)
         VALUES (?, ?, ?, 'active')`,
        [warehouseCode, warehouseName, address]
      );
      const rows = await this.db.query(
        `SELECT id, warehouse_code, warehouse_name, address, status, created_at, updated_at
         FROM warehouses WHERE id = ? LIMIT 1`,
        [result.insertId]
      );
      return rows[0] || null;
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        throw new Error('仓库编码已存在');
      }
      throw error;
    }
  }

  async updateWarehouse(id, payload = {}) {
    const safeId = Number(id);
    if (!Number.isInteger(safeId) || safeId <= 0) throw new Error('仓库ID无效');
    const exists = await this.db.query('SELECT id FROM warehouses WHERE id = ? LIMIT 1', [safeId]);
    if (!exists[0]) throw new Error('仓库不存在');
    const warehouseName = String(payload.warehouse_name || payload.warehouseName || '').trim();
    const address = this.nullIfEmpty(payload.address);
    const status = ['active', 'inactive'].includes(payload.status) ? payload.status : 'active';
    if (!warehouseName) throw new Error('仓库名称不能为空');
    await this.db.execute(
      `UPDATE warehouses SET warehouse_name = ?, address = ?, status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [warehouseName, address, status, safeId]
    );
    const rows = await this.db.query(
      `SELECT id, warehouse_code, warehouse_name, address, status, created_at, updated_at
       FROM warehouses WHERE id = ? LIMIT 1`,
      [safeId]
    );
    return rows[0] || null;
  }

  async listAvailableDevices() {
    const upperDevices = await this.db.query(
      `SELECT 'upper' AS device_type, ud.id AS device_id, ud.imei AS identifier,
              ud.device_name, di.inventory_status
       FROM upper_devices ud
       LEFT JOIN device_inventory di ON di.upper_device_id = ud.id
       WHERE di.id IS NULL OR di.inventory_status IN ('returned', 'scrapped')
       ORDER BY ud.id DESC`
    );
    const lowerDevices = await this.db.query(
      `SELECT 'lower' AS device_type, ld.id AS device_id, ld.device_code AS identifier,
              ld.device_name, di.inventory_status
       FROM lower_devices ld
       LEFT JOIN device_inventory di ON di.lower_device_id = ld.id
       WHERE di.id IS NULL OR di.inventory_status IN ('returned', 'scrapped')
       ORDER BY ld.id DESC`
    );
    return [...upperDevices, ...lowerDevices];
  }

  async listDeviceInventory({ page = 1, limit = 20, search = '', status = '', deviceType = '' } = {}) {
    const safePage = Math.max(Number(page) || 1, 1);
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const offset = (safePage - 1) * safeLimit;
    const filters = [];
    const params = [];
    const keyword = String(search || '').trim();
    if (keyword) {
      filters.push(`(COALESCE(ud.imei, ld.device_code) LIKE ?
        OR COALESCE(ud.device_name, ld.device_name) LIKE ?
        OR c.customer_name LIKE ?
        OR c.customer_code LIKE ?
        OR w.warehouse_name LIKE ?)`);
      params.push(...Array(5).fill(`%${keyword}%`));
    }
    if (['in_stock', 'sold', 'returned', 'scrapped'].includes(status)) {
      filters.push('di.inventory_status = ?');
      params.push(status);
    }
    if (['upper', 'lower'].includes(deviceType)) {
      filters.push('di.device_type = ?');
      params.push(deviceType);
    }
    const whereSql = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const list = await this.db.query(
      `SELECT di.id, di.device_type, di.inventory_status, di.stocked_at, di.sold_at,
              di.returned_at, di.notes, w.id AS warehouse_id, w.warehouse_code,
              w.warehouse_name, c.id AS customer_id, c.customer_code,
              c.customer_name, ud.id AS upper_device_id, ud.imei,
              ud.device_name AS upper_device_name, ud.network_status,
              ld.id AS lower_device_id, ld.device_code,
              ld.device_name AS lower_device_name, ld.status AS lower_status
       FROM device_inventory di
       JOIN warehouses w ON w.id = di.warehouse_id
       LEFT JOIN admin_customers c ON c.id = di.customer_id
       LEFT JOIN upper_devices ud ON ud.id = di.upper_device_id
       LEFT JOIN lower_devices ld ON ld.id = di.lower_device_id
       ${whereSql}
       ORDER BY di.inventory_status = 'sold' DESC, di.id DESC
       LIMIT ${safeLimit} OFFSET ${offset}`,
      params
    );
    const countRows = await this.db.query(
      `SELECT COUNT(*) AS total
       FROM device_inventory di
       JOIN warehouses w ON w.id = di.warehouse_id
       LEFT JOIN admin_customers c ON c.id = di.customer_id
       LEFT JOIN upper_devices ud ON ud.id = di.upper_device_id
       LEFT JOIN lower_devices ld ON ld.id = di.lower_device_id
       ${whereSql}`,
      params
    );
    return {
      list: list.map(item => ({
        ...item,
        identifier: item.imei || item.device_code || null,
        device_name: item.upper_device_name || item.lower_device_name || null
      })),
      pagination: {
        page: safePage,
        limit: safeLimit,
        total: Number(countRows[0]?.total || 0),
        totalPages: Math.ceil(Number(countRows[0]?.total || 0) / safeLimit)
      }
    };
  }

  async getDeviceInventoryItem(id, executor = this.db) {
    const rows = await executor.query(
      `SELECT di.id, di.device_type, di.inventory_status, di.stocked_at, di.sold_at,
              di.returned_at, di.notes, di.warehouse_id, w.warehouse_name,
              di.customer_id, c.customer_code, c.customer_name,
              ud.id AS upper_device_id, ud.imei,
              ud.device_name AS upper_device_name, ud.network_status,
              ld.id AS lower_device_id, ld.device_code,
              ld.device_name AS lower_device_name, ld.status AS lower_status
       FROM device_inventory di
       JOIN warehouses w ON w.id = di.warehouse_id
       LEFT JOIN admin_customers c ON c.id = di.customer_id
       LEFT JOIN upper_devices ud ON ud.id = di.upper_device_id
       LEFT JOIN lower_devices ld ON ld.id = di.lower_device_id
       WHERE di.id = ?
       LIMIT 1`,
      [id]
    );
    const item = rows[0];
    return item
      ? { ...item, identifier: item.imei || item.device_code || null, device_name: item.upper_device_name || item.lower_device_name || null }
      : null;
  }

  async stockDevice(payload = {}) {
    const deviceType = String(payload.device_type || payload.deviceType || '').trim();
    const deviceId = Number(payload.device_id || payload.deviceId);
    const warehouseId = Number(payload.warehouse_id || payload.warehouseId);
    if (!['upper', 'lower'].includes(deviceType) || !Number.isInteger(deviceId) || deviceId <= 0) {
      throw new Error('入库设备类型或设备ID无效');
    }
    if (!Number.isInteger(warehouseId) || warehouseId <= 0) {
      throw new Error('请选择有效仓库');
    }
    const transaction = async (executor) => {
      const warehouse = await executor.query('SELECT id FROM warehouses WHERE id = ? AND status = \'active\' LIMIT 1', [warehouseId]);
      if (!warehouse[0]) throw new Error('仓库不存在或已停用');
      const deviceRows = await executor.query(
        deviceType === 'upper'
          ? 'SELECT id FROM upper_devices WHERE id = ? LIMIT 1'
          : 'SELECT id FROM lower_devices WHERE id = ? LIMIT 1',
        [deviceId]
      );
      if (!deviceRows[0]) throw new Error('设备不存在');
      const column = deviceType === 'upper' ? 'upper_device_id' : 'lower_device_id';
      const existingRows = await executor.query(
        `SELECT id, inventory_status FROM device_inventory WHERE ${column} = ? LIMIT 1 FOR UPDATE`,
        [deviceId]
      );
      if (existingRows[0] && existingRows[0].inventory_status === 'sold') {
        throw new Error('已售出设备不能重复入库，请先办理退回');
      }
      if (existingRows[0]) {
        await executor.execute(
          `UPDATE device_inventory
           SET warehouse_id = ?, inventory_status = 'in_stock', customer_id = NULL,
               stocked_at = CURRENT_TIMESTAMP,
               sold_at = NULL, returned_at = NULL, notes = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [warehouseId, this.nullIfEmpty(payload.notes), existingRows[0].id]
        );
        return existingRows[0].id;
      }
      const result = await executor.execute(
        `INSERT INTO device_inventory (warehouse_id, device_type, ${column}, inventory_status, notes)
         VALUES (?, ?, ?, 'in_stock', ?)`,
        [warehouseId, deviceType, deviceId, this.nullIfEmpty(payload.notes)]
      );
      return result.insertId;
    };
    const inventoryId = typeof this.db.withTransaction === 'function'
      ? await this.db.withTransaction(transaction)
      : await transaction(this.db);
    return this.getDeviceInventoryItem(inventoryId);
  }

  async sellDevice(payload = {}, operatorId = null) {
    const inventoryId = Number(payload.inventory_id || payload.inventoryId);
    const customerId = Number(payload.customer_id || payload.customerId);
    if (!Number.isInteger(inventoryId) || inventoryId <= 0 || !Number.isInteger(customerId) || customerId <= 0) {
      throw new Error('销售设备或客户参数无效');
    }
    const transaction = async (executor) => {
      const customers = await executor.query(
        `SELECT id FROM admin_customers WHERE id = ? AND status = 'active' LIMIT 1`,
        [customerId]
      );
      if (!customers[0]) throw new Error('客户不存在或已停用');
      const rows = await executor.query(
        `SELECT id, device_type, upper_device_id, inventory_status
         FROM device_inventory WHERE id = ? LIMIT 1 FOR UPDATE`,
        [inventoryId]
      );
      const inventory = rows[0];
      if (!inventory) throw new Error('库存设备不存在');
      if (inventory.inventory_status !== 'in_stock') throw new Error('只有在库设备可以销售');

      await executor.execute(
        `UPDATE device_inventory
         SET inventory_status = 'sold', customer_id = ?, sold_at = CURRENT_TIMESTAMP,
             returned_at = NULL, notes = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [customerId, this.nullIfEmpty(payload.notes), inventoryId]
      );
      await executor.execute(
        `INSERT INTO device_sales (inventory_id, customer_id, sold_at, sale_status, operator_id, notes)
         VALUES (?, ?, CURRENT_TIMESTAMP, 'active', ?, ?)`,
        [inventoryId, customerId, operatorId || null, this.nullIfEmpty(payload.notes)]
      );
      if (inventory.device_type === 'upper' && inventory.upper_device_id) {
        await executor.execute(
          'DELETE FROM admin_customer_upper_devices WHERE upper_device_id = ?',
          [inventory.upper_device_id]
        );
        await executor.execute(
          `INSERT INTO admin_customer_upper_devices (customer_id, upper_device_id)
           VALUES (?, ?)`,
          [customerId, inventory.upper_device_id]
        );
      }
    };
    if (typeof this.db.withTransaction === 'function') {
      await this.db.withTransaction(transaction);
    } else {
      await transaction(this.db);
    }
    return this.getDeviceInventoryItem(inventoryId);
  }

  async returnDevice(inventoryId) {
    const safeId = Number(inventoryId);
    if (!Number.isInteger(safeId) || safeId <= 0) throw new Error('库存设备ID无效');
    const transaction = async (executor) => {
      const rows = await executor.query(
        `SELECT id, device_type, upper_device_id, inventory_status
         FROM device_inventory WHERE id = ? LIMIT 1 FOR UPDATE`,
        [safeId]
      );
      const inventory = rows[0];
      if (!inventory) throw new Error('库存设备不存在');
      if (inventory.inventory_status !== 'sold') throw new Error('只有已售出设备可以退回');
      await executor.execute(
        `UPDATE device_inventory
         SET inventory_status = 'returned', customer_id = NULL, returned_at = CURRENT_TIMESTAMP,
             sold_at = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [safeId]
      );
      await executor.execute(
        `UPDATE device_sales SET sale_status = 'returned', returned_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
         WHERE inventory_id = ? AND sale_status = 'active'`,
        [safeId]
      );
      if (inventory.device_type === 'upper' && inventory.upper_device_id) {
        await executor.execute(
          'DELETE FROM admin_customer_upper_devices WHERE upper_device_id = ?',
          [inventory.upper_device_id]
        );
      }
    };
    if (typeof this.db.withTransaction === 'function') {
      await this.db.withTransaction(transaction);
    } else {
      await transaction(this.db);
    }
    return this.getDeviceInventoryItem(safeId);
  }

  async listAdminUsers({ page = 1, limit = 20, search = '' } = {}) {
    const safePage = Math.max(Number(page) || 1, 1);
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const offset = (safePage - 1) * safeLimit;
    const keyword = `%${String(search || '').trim()}%`;
    const params = [];
    let whereSql = `WHERE r.role_code IN ('admin', 'system_admin')`;

    if (String(search || '').trim()) {
      whereSql += ` AND (u.username LIKE ? OR u.real_name LIKE ? OR u.email LIKE ?)`;
      params.push(keyword, keyword, keyword);
    }

    const list = await this.db.query(
      `SELECT u.id, u.username, u.real_name, u.email, u.phone, u.status, u.last_login_time, u.created_at, u.updated_at,
              GROUP_CONCAT(DISTINCT r.role_code ORDER BY r.role_code SEPARATOR ',') AS roles
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id
       ${whereSql}
       GROUP BY u.id
       ORDER BY u.id DESC
       LIMIT ${safeLimit} OFFSET ${offset}`,
      params
    );

    const countRows = await this.db.query(
      `SELECT COUNT(DISTINCT u.id) AS total
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id
       ${whereSql}`,
      params
    );

    return {
      list: list.map(item => ({
        ...item,
        roles: item.roles ? item.roles.split(',') : []
      })),
      pagination: {
        page: safePage,
        limit: safeLimit,
        total: countRows[0]?.total || 0,
        totalPages: Math.ceil((countRows[0]?.total || 0) / safeLimit)
      }
    };
  }

  async createAdminUser(payload) {
    const username = String(payload.username || '').trim();
    const password = String(payload.password || '').trim();
    const realName = String(payload.real_name || payload.realName || '').trim();
    const email = String(payload.email || '').trim();
    const phone = String(payload.phone || '').trim();
    const status = ['active', 'inactive', 'locked'].includes(payload.status) ? payload.status : 'active';
    const roleCodes = Array.isArray(payload.roles) && payload.roles.length ? payload.roles : ['admin'];

    if (!username || !password) {
      throw new Error('用户名和密码不能为空');
    }

    const exists = await this.db.query('SELECT id FROM users WHERE username = ? OR email = ? LIMIT 1', [username, email || username]);
    if (exists[0]) {
      throw new Error('用户名或邮箱已存在');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await this.db.execute(
      `INSERT INTO users (username, password_hash, real_name, phone, email, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [username, passwordHash, realName || null, phone || null, email || null, status]
    );

    await this.replaceUserRoles(result.insertId, roleCodes);
    return this.getAdminUserById(result.insertId);
  }

  async updateAdminUser(id, payload) {
    const updates = [];
    const params = [];

    const fields = {
      username: payload.username,
      real_name: payload.real_name ?? payload.realName,
      email: payload.email,
      phone: payload.phone,
      status: payload.status
    };

    Object.entries(fields).forEach(([key, value]) => {
      if (value !== undefined) {
        updates.push(`${key} = ?`);
        params.push(String(value).trim() || null);
      }
    });

    if (payload.password) {
      updates.push('password_hash = ?');
      params.push(bcrypt.hashSync(String(payload.password), 10));
    }

    if (updates.length) {
      params.push(id);
      await this.db.execute(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
    }

    if (Array.isArray(payload.roles) && payload.roles.length) {
      await this.replaceUserRoles(id, payload.roles);
    }

    return this.getAdminUserById(id);
  }

  async deleteAdminUser(id) {
    await this.db.execute('DELETE FROM users WHERE id = ?', [id]);
  }

  async getAdminUserById(id) {
    const rows = await this.db.query(
      `SELECT u.id, u.username, u.real_name, u.email, u.phone, u.status, u.last_login_time, u.created_at, u.updated_at,
              GROUP_CONCAT(DISTINCT r.role_code ORDER BY r.role_code SEPARATOR ',') AS roles
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       WHERE u.id = ?
       GROUP BY u.id
       LIMIT 1`,
      [id]
    );

    const item = rows[0];
    return item
      ? { ...item, roles: item.roles ? item.roles.split(',') : [] }
      : null;
  }

  async verifyAdminUser(username, password) {
    const rows = await this.db.query(
      `SELECT u.id, u.username, u.password_hash, u.real_name, u.email, u.phone, u.status, u.last_login_time,
              GROUP_CONCAT(DISTINCT r.role_code ORDER BY r.role_code SEPARATOR ',') AS roles
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       WHERE u.username = ?
       GROUP BY u.id
       LIMIT 1`,
      [username]
    );

    const user = rows[0];
    if (!user || user.status !== 'active') {
      return null;
    }

    const roles = user.roles ? user.roles.split(',') : [];
    if (!roles.includes('admin') && !roles.includes('system_admin')) {
      return null;
    }

    const matched = await bcrypt.compare(password, user.password_hash);
    if (!matched) {
      return null;
    }

    await this.db.execute('UPDATE users SET last_login_time = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);

    return {
      id: user.id,
      username: user.username,
      real_name: user.real_name,
      email: user.email,
      phone: user.phone,
      status: user.status,
      roles
    };
  }

  async listUpperDevices({ page = 1, limit = 20, search = '' } = {}) {
    const hasConnectedAtColumn = await this.hasUpperDeviceConnectedAtColumn();
    const result = await this.paginate(
      `SELECT ud.id, ud.imei, ud.device_name, ud.model, ud.manufacturer, ud.network_status, ud.status,
              ${hasConnectedAtColumn ? 'ud.connected_at' : 'NULL AS connected_at'},
              ud.last_online_time, ud.ip_address, ud.signal_strength,
              ud.wire_change_mileage, ud.total_mileage, ud.inspection_mileage,
              ud.created_at, ud.updated_at,
              mh.id AS hole_id, mh.hole_number, mh.hole_name, p.project_name
       FROM upper_devices ud
       LEFT JOIN monitoring_holes mh ON mh.upper_device_id = ud.id
       LEFT JOIN projects p ON p.id = mh.project_id`,
      `SELECT COUNT(*) AS total
       FROM upper_devices ud
       LEFT JOIN monitoring_holes mh ON mh.upper_device_id = ud.id
       LEFT JOIN projects p ON p.id = mh.project_id`,
      ['ud.imei', 'ud.device_name', 'mh.hole_number', 'mh.hole_name', 'p.project_name'],
      { page, limit, search, orderBy: 'ud.id DESC' }
    );

    return {
      ...result,
      list: result.list.map(item => ({
        ...this.withMileageWarnings(item),
        // 修复说明：管理端上位机列表需要直接看到“工程/测孔”业务上下文，这里统一生成展示字段，避免前端重复拼装。
          related_hole: this.buildRelatedHoleLabel({}, item, item)
      }))
    };
  }

  withMileageWarnings(upperDevice) {
    const totalMileage = Number(upperDevice?.total_mileage) || 0;
    const wireChangeMileage = Number(upperDevice?.wire_change_mileage) || 0;
    const inspectionMileage = Number(upperDevice?.inspection_mileage) || 0;
    const mileageWarnings = [];
    if (wireChangeMileage > 0 && totalMileage >= wireChangeMileage) {
      mileageWarnings.push({
        type: 'wire_change',
        message: '上位机累计监测里程已达到换线预警值，请及时换线。',
        threshold: wireChangeMileage,
        totalMileage
      });
    }
    if (inspectionMileage > 0 && totalMileage >= inspectionMileage) {
      mileageWarnings.push({
        type: 'inspection',
        message: '上位机累计监测里程已达到检查预警值，请及时检查。',
        threshold: inspectionMileage,
        totalMileage
      });
    }
    return { ...upperDevice, mileage_warnings: mileageWarnings };
  }

  async getUpperDeviceById(id) {
    const hasConnectedAtColumn = await this.hasUpperDeviceConnectedAtColumn();
    const rows = await this.db.query(
      `SELECT ud.id, ud.imei, ud.device_name, ud.model, ud.manufacturer, ud.network_status, ud.status,
              ${hasConnectedAtColumn ? 'ud.connected_at' : 'NULL AS connected_at'},
              ud.last_online_time, ud.ip_address, ud.signal_strength,
              ud.wire_change_mileage, ud.total_mileage, ud.inspection_mileage,
              ud.created_at, ud.updated_at,
              mh.id AS hole_id, mh.hole_number, mh.hole_name, p.project_name
       FROM upper_devices ud
       LEFT JOIN monitoring_holes mh ON mh.upper_device_id = ud.id
       LEFT JOIN projects p ON p.id = mh.project_id
       WHERE ud.id = ?
       LIMIT 1`,
      [id]
    );
    return rows[0]
      ? {
          ...this.withMileageWarnings(rows[0]),
          related_hole: this.buildRelatedHoleLabel({}, rows[0], rows[0])
        }
      : null;
  }

  async updateUpperDeviceMileageThresholds(id, payload = {}) {
    const upperDevice = await this.getUpperDeviceById(id);
    if (!upperDevice) {
      throw new Error('上位机不存在');
    }

    const normalizeThreshold = (value, label) => {
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error(`${label}必须是大于或等于 0 的数字`);
      }
      return Number(parsed.toFixed(2));
    };
    const wireChangeMileage = normalizeThreshold(payload.wire_change_mileage, '换线里程');
    const inspectionMileage = normalizeThreshold(payload.inspection_mileage, '检查里程');

    await this.db.execute(
      `UPDATE upper_devices
       SET wire_change_mileage = ?, inspection_mileage = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [wireChangeMileage, inspectionMileage, id]
    );
    return this.getUpperDeviceById(id);
  }

  async deleteUpperDevice(id) {
    const upperDevice = await this.getUpperDeviceById(id);
    if (!upperDevice) {
      throw new Error('上位机不存在');
    }

    // 修复说明：管理端删除上位机时，需要同步清理监测孔位上的上位机关联，避免留下悬挂业务关系；
    // device_bindings 和 admin_customer_upper_devices 已由外键级联删除，这里只补业务字段回收。
    await this.db.execute(
      `UPDATE monitoring_holes
       SET upper_device_id = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE upper_device_id = ?`,
      [id]
    );
    await this.db.execute('DELETE FROM upper_devices WHERE id = ?', [id]);
    return upperDevice;
  }

  async hasUpperDeviceConnectedAtColumn() {
    if (!this.upperDeviceConnectedAtColumnPromise) {
      this.upperDeviceConnectedAtColumnPromise = this.db.query(
        `SELECT COUNT(*) AS total
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'upper_devices'
           AND COLUMN_NAME = 'connected_at'`
      ).then(rows => Number(rows[0]?.total || 0) > 0);
    }

    return this.upperDeviceConnectedAtColumnPromise;
  }

  parseGatewayRemoteAddress(remoteAddress) {
    const rawValue = String(remoteAddress || '').trim();
    if (!rawValue) {
      return null;
    }

    const ipv6Match = rawValue.match(/^\[(.+)\]:(\d+)$/);
    if (ipv6Match) {
      return ipv6Match[1];
    }

    const lastColonIndex = rawValue.lastIndexOf(':');
    if (lastColonIndex > 0 && rawValue.indexOf(':') === lastColonIndex) {
      return rawValue.slice(0, lastColonIndex);
    }

    return rawValue;
  }

  normalizeSessionTime(value) {
    if (value === undefined || value === null || value === '') {
      return null;
    }

    const numericValue = Number(value);
    if (Number.isFinite(numericValue)) {
      const milliseconds = numericValue > 9999999999 ? numericValue : numericValue * 1000;
      const date = new Date(milliseconds);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  normalizeUpperDeviceImei(value) {
    const text = String(value || '').trim();
    if (!text) {
      return null;
    }

    // 修复说明：通讯服务脏数据里曾出现 imei='null'，会被管理端误建成上位机档案；
    // 这里统一把空串/null/undefined 这类伪值视为无效 IMEI，避免再次污染 upper_devices 主表。
    if (['null', 'undefined'].includes(text.toLowerCase())) {
      return null;
    }

    return text;
  }

  normalizeSessionStatus(item = {}) {
    return {
      network_status: 'online',
      connected_at: this.normalizeSessionTime(item.connectedAt),
      last_online_time: this.normalizeSessionTime(item.lastSeenAt),
      ip_address: this.parseGatewayRemoteAddress(item.remoteAddress)
    };
  }

  async requestGatewayApi(pathname, { method = 'GET', body: requestBody = null } = {}) {
    const tcpApiConfig = this.config.tcpApi || {};
    const baseUrl = String(tcpApiConfig.baseUrl || '').replace(/\/$/, '');
    const timeoutMs = Number(tcpApiConfig.timeoutMs || 5000) || 5000;

    if (!baseUrl) {
      throw new Error('通讯服务地址未配置');
    }

    const requestUrl = `${baseUrl}${pathname}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await this.fetchImpl(requestUrl, {
        method,
        headers: {
          Accept: 'application/json',
          ...(requestBody ? { 'Content-Type': 'application/json' } : {})
        },
        body: requestBody ? JSON.stringify(requestBody) : undefined,
        signal: controller.signal
      });
      const text = await response.text();
      let responseBody = null;
      try {
        responseBody = text ? JSON.parse(text) : null;
      } catch (error) {
        responseBody = null;
      }

      if (!response.ok || !responseBody || responseBody.success !== true) {
        const requestError = new Error(
          (responseBody && (responseBody.error || responseBody.message)) || `HTTP ${response.status}`
        );
        requestError.statusCode = response.status;
        throw requestError;
      }

      return responseBody;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error(`调用通讯服务 ${pathname} 超时`);
      }
      if (error.statusCode) {
        throw error;
      }
      throw new Error(`调用通讯服务 ${pathname} 失败: ${error.message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  async requestTcpApi(pathname) {
    return this.requestGatewayApi(pathname);
  }

  async sendUpperDeviceCommand(imei, payload = {}) {
    const command = String(payload.command || '').trim();
    const format = String(payload.format || 'hex').trim() || 'hex';
    if (!command) {
      throw new Error('指令内容不能为空');
    }

    return this.requestGatewayApi('/send-command', {
      method: 'POST',
      body: { imei, command, format }
    });
  }

  async getUpperDeviceCommandLogs(imei, options = {}) {
    const since = Math.max(Number(options.since) || 0, 0);
    const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 200);
    return this.requestGatewayApi(
      `/command-logs?imei=${encodeURIComponent(imei)}&since=${since}&limit=${limit}`
    );
  }

  async syncUpperDevicesFromGateway() {
    const sessionResponse = await this.requestTcpApi('/sessions');
    const sessions = Array.isArray(sessionResponse?.data?.list) ? sessionResponse.data.list : [];
    const hasConnectedAtColumn = await this.hasUpperDeviceConnectedAtColumn();
    const upperDevices = await this.db.query(
      `SELECT id, imei,
              ${hasConnectedAtColumn ? 'connected_at' : 'NULL AS connected_at'},
              last_online_time, ip_address, network_status
       FROM upper_devices`
    );
    const upperDeviceMap = new Map(upperDevices.map(item => [item.imei, item]));
    const sessionMap = new Map(
      sessions
        .map(item => {
          const imei = this.normalizeUpperDeviceImei(item && item.imei);
          return imei ? [imei, item] : null;
        })
        .filter(Boolean)
    );

    let matched = 0;
    let updated = 0;
    let created = 0;
    let online = 0;
    let offline = 0;
    const unmatched = [];

    for (const session of sessions) {
      const imei = this.normalizeUpperDeviceImei(session && session.imei);
      if (!imei) {
        continue;
      }
      let upperDevice = upperDeviceMap.get(imei);
      if (!upperDevice) {
        const normalized = this.normalizeSessionStatus(session);
        // 修复说明：通讯服务返回了管理端尚未登记的 IMEI 时，按用户要求自动补建上位机，避免同步结果长期停留在“未匹配”。
        const insertSql = hasConnectedAtColumn
          ? `INSERT INTO upper_devices (
               imei, device_name, network_status, connected_at, last_online_time,
               ip_address, status, created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
          : `INSERT INTO upper_devices (
               imei, device_name, network_status, last_online_time,
               ip_address, status, created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`;
        const insertParams = hasConnectedAtColumn
          ? [
              imei,
              `DTU_${imei}`,
              normalized.network_status,
              normalized.connected_at,
              normalized.last_online_time,
              normalized.ip_address
            ]
          : [
              imei,
              `DTU_${imei}`,
              normalized.network_status,
              normalized.last_online_time,
              normalized.ip_address
            ];
        const insertResult = await this.db.execute(insertSql, insertParams);
        upperDevice = {
          id: insertResult.insertId,
          imei
        };
        upperDeviceMap.set(imei, upperDevice);
        created += 1;
      }

      matched += 1;
      online += 1;
      const normalized = this.normalizeSessionStatus(session);

      const updateSql = hasConnectedAtColumn
        ? `UPDATE upper_devices
           SET network_status = ?,
               connected_at = ?,
               last_online_time = ?,
               ip_address = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`
        : `UPDATE upper_devices
           SET network_status = ?,
               last_online_time = ?,
               ip_address = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`;
      const updateParams = hasConnectedAtColumn
        ? [
            normalized.network_status,
            normalized.connected_at,
            normalized.last_online_time,
            normalized.ip_address,
            upperDevice.id
          ]
        : [
            normalized.network_status,
            normalized.last_online_time,
            normalized.ip_address,
            upperDevice.id
          ];
      const result = await this.db.execute(updateSql, updateParams);

      updated += result.affectedRows || 0;
    }

    for (const upperDevice of upperDevices) {
      if (sessionMap.has(String(upperDevice.imei))) {
        continue;
      }

      offline += 1;
      const result = await this.db.execute(
        `UPDATE upper_devices
         SET network_status = 'offline',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [upperDevice.id]
      );
      updated += result.affectedRows || 0;
    }

    return {
      gatewayTotal: sessions.length,
      matched,
      updated,
      created,
      online,
      offline,
      unmatched
    };
  }

  async listLowerDevices({ page = 1, limit = 20, search = '' } = {}) {
    const result = await this.paginate(
      `SELECT ld.id, ld.device_code, ld.device_name, ld.model, ld.status, ld.current_hole_id,
              ld.k_value, ld.beta_value, ld.calibration_date, ld.calibration_org,
              ld.valid_until, ld.calibration_status,
              ld.created_at, ld.updated_at,
              ud.id AS upper_device_id, ud.imei AS upper_device_imei, ud.device_name AS upper_device_name
       FROM lower_devices ld
       LEFT JOIN device_bindings db ON db.lower_device_id = ld.id AND db.status = 'active'
       LEFT JOIN upper_devices ud ON ud.id = db.upper_device_id`,
      `SELECT COUNT(DISTINCT ld.id) AS total
       FROM lower_devices ld
       LEFT JOIN device_bindings db ON db.lower_device_id = ld.id AND db.status = 'active'
       LEFT JOIN upper_devices ud ON ud.id = db.upper_device_id`,
      ['ld.device_code', 'ld.device_name', 'ud.imei', 'ud.device_name'],
      { page, limit, search, orderBy: 'ld.id DESC' }
    );

    return {
      ...result,
      list: result.list.map(item => ({
        ...item,
        // 修复说明：管理端下位机列表补充“关联上位机”列，直接返回 IMEI/名称 组合后的展示字段，方便页面直接使用。
        related_upper_device: item.upper_device_imei && item.upper_device_name
          ? `${item.upper_device_imei} / ${item.upper_device_name}`
          : (item.upper_device_imei || item.upper_device_name || null)
      }))
    };
  }

  normalizeOptionalNumber(value) {
    if (value === undefined || value === null || value === '') {
      return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  nullIfEmpty(value) {
    if (value === undefined || value === null) {
      return null;
    }
    const text = String(value).trim();
    return text || null;
  }

  normalizeOptionalDate(value) {
    const text = this.nullIfEmpty(value);
    return text ? text.slice(0, 10) : null;
  }

  normalizeCalibrationStatus(value) {
    return ['valid', 'expired', 'pending'].includes(value) ? value : 'valid';
  }

  async updateLowerDeviceCalibration(id, payload = {}) {
    const safeId = Number(id);
    if (!Number.isInteger(safeId) || safeId <= 0) {
      throw new Error('下位机ID无效');
    }

    const exists = await this.db.query('SELECT id FROM lower_devices WHERE id = ? LIMIT 1', [safeId]);
    if (!exists[0]) {
      return null;
    }

    const updateFields = {
      k_value: this.normalizeOptionalNumber(payload.k_value),
      beta_value: this.normalizeOptionalNumber(payload.beta_value),
      calibration_date: this.normalizeOptionalDate(payload.calibration_date),
      calibration_org: this.nullIfEmpty(payload.calibration_org),
      valid_until: this.normalizeOptionalDate(payload.valid_until),
      calibration_status: this.normalizeCalibrationStatus(payload.calibration_status)
    };

    await this.db.execute(
      `UPDATE lower_devices
       SET k_value = ?, beta_value = ?, calibration_date = ?, calibration_org = ?,
           valid_until = ?, calibration_status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        updateFields.k_value,
        updateFields.beta_value,
        updateFields.calibration_date,
        updateFields.calibration_org,
        updateFields.valid_until,
        updateFields.calibration_status,
        safeId
      ]
    );

    const rows = await this.db.query(
      `SELECT id, device_code, device_name, model, status, current_hole_id,
              k_value, beta_value, calibration_date, calibration_org, valid_until,
              calibration_status, created_at, updated_at
       FROM lower_devices
       WHERE id = ?
       LIMIT 1`,
      [safeId]
    );
    return rows[0] || null;
  }

  safeParseJson(value) {
    if (!value) {
      return null;
    }

    if (typeof value === 'object') {
      return value;
    }

    try {
      return JSON.parse(value);
    } catch (error) {
      return null;
    }
  }

  normalizeGatewayPoints(payload) {
    const pointList = Array.isArray(payload?.points)
      ? payload.points
      : (Array.isArray(payload) ? payload : []);

    return pointList.map((item, index) => ({
      // 修复说明：前端点位明细需要稳定的 idx/node/depth/value 四元组，这里统一把通讯服务返回结构规整后再透传。
      idx: item?.idx ?? index,
      node: item?.node ?? null,
      depth: item?.depth ?? null,
      value: item?.value ?? null
    }));
  }

  formatBeijingDateTime(value) {
    if (!value) {
      return null;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return null;
    }

    const formatter = new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    const parts = formatter.formatToParts(date);
    const partMap = Object.fromEntries(parts.map(item => [item.type, item.value]));
    return `${partMap.year}-${partMap.month}-${partMap.day} ${partMap.hour}:${partMap.minute}:${partMap.second}`;
  }

  buildRelatedHoleLabel(metadata = {}, hole = null, project = null) {
    const holeName = hole?.hole_name || metadata.holeName || null;
    const holeNumber = hole?.hole_number || metadata.holeNumber || metadata.holeNo || null;
    const projectName = project?.project_name || metadata.projectName || null;
    const holeLabel = holeName && holeNumber ? `${holeName}（${holeNumber}）` : (holeName || holeNumber || '--');
    // 修复说明：管理端列表字段要求展示“关联测孔”，这里保留工程名作为辅助上下文，避免同名测孔难以区分。
    return projectName ? `${projectName} / ${holeLabel}` : holeLabel;
  }

  async getProjectCustomerMap(projectIds = []) {
    const safeProjectIds = [...new Set((Array.isArray(projectIds) ? projectIds : [])
      .map(item => Number(item))
      .filter(item => Number.isInteger(item) && item > 0))];
    const params = [];
    let whereSql = '';

    if (safeProjectIds.length) {
      // 修复说明：工程与客户在现有库结构中没有直接外键，这里沿用任务表 metadata_json 里的 adminProjectId 回查客户归属，避免脱离现有数据结构做猜测性新增字段。
      whereSql = `WHERE task_project.project_id IN (${safeProjectIds.map(() => '?').join(', ')})`;
      params.push(...safeProjectIds);
    }

    const rows = await this.db.query(
      `SELECT task_project.project_id, MAX(task_project.customer_name) AS customer_name
       FROM (
         SELECT CAST(JSON_UNQUOTE(JSON_EXTRACT(t.metadata_json, '$.adminProjectId')) AS UNSIGNED) AS project_id,
                c.customer_name
         FROM admin_device_tasks t
         JOIN admin_customers c ON c.id = t.customer_id
         WHERE JSON_EXTRACT(t.metadata_json, '$.adminProjectId') IS NOT NULL
       ) task_project
       ${whereSql}
       GROUP BY task_project.project_id`,
      params
    );

    return new Map(rows.map(item => [Number(item.project_id), item.customer_name || null]));
  }

  async listProjects() {
    const rows = await this.db.query(
      `SELECT p.id, p.project_code, p.project_name, p.location, p.client_name, p.contractor, p.supervisor,
              p.start_date, p.end_date, p.status, p.created_at, p.updated_at,
              COUNT(DISTINCT mh.id) AS hole_count
       FROM projects p
       LEFT JOIN monitoring_holes mh ON mh.project_id = p.id
       GROUP BY p.id
       ORDER BY p.created_at DESC, p.id DESC`
    );
    const customerMap = await this.getProjectCustomerMap(rows.map(item => item.id));

    return rows.map((item) => ({
      ...item,
      // 修复说明：工程列表需要显示客户名称，优先使用任务历史里已确认的客户归属；若历史任务尚未覆盖，再回退到项目表里的 client_name。
      customer_name: customerMap.get(Number(item.id)) || item.client_name || '--',
      hole_count: Number(item.hole_count || 0)
    }));
  }

  async getProjectDetail(id) {
    const safeId = Number(id);
    if (!Number.isInteger(safeId) || safeId <= 0) {
      return null;
    }

    const hasConnectedAtColumn = await this.hasUpperDeviceConnectedAtColumn();
    const projectRows = await this.db.query(
      `SELECT p.id, p.project_code, p.project_name, p.location, p.client_name, p.contractor, p.supervisor,
              p.start_date, p.end_date, p.status, p.created_at, p.updated_at,
              COUNT(DISTINCT mh.id) AS hole_count
       FROM projects p
       LEFT JOIN monitoring_holes mh ON mh.project_id = p.id
       WHERE p.id = ?
       GROUP BY p.id
       LIMIT 1`,
      [safeId]
    );
    const project = projectRows[0];

    if (!project) {
      return null;
    }

    const customerMap = await this.getProjectCustomerMap([safeId]);
    const holeList = await this.db.query(
      `SELECT mh.id, mh.hole_number, mh.hole_name, mh.hole_type, mh.depth, mh.measurement_interval, mh.initial_measurement_distance, mh.status,
              mh.last_measurement_time, mh.next_scheduled_time,
              ud.id AS upper_device_id, ud.imei AS upper_device_imei, ud.device_name AS upper_device_name,
              ld.id AS lower_device_id, ld.device_code AS lower_device_code, ld.device_name AS lower_device_name
       FROM monitoring_holes mh
       LEFT JOIN upper_devices ud ON ud.id = mh.upper_device_id
       LEFT JOIN lower_devices ld ON ld.id = mh.lower_device_id
       WHERE mh.project_id = ?
       ORDER BY mh.hole_number ASC, mh.id ASC`,
      [safeId]
    );
    const upperDeviceList = await this.db.query(
      `SELECT ud.id, ud.imei, ud.device_name, ud.network_status,
              ${hasConnectedAtColumn ? 'ud.connected_at' : 'NULL AS connected_at'},
              ud.last_online_time, ud.ip_address,
              GROUP_CONCAT(DISTINCT COALESCE(mh.hole_name, mh.hole_number) ORDER BY mh.hole_number SEPARATOR '、') AS related_hole_names
       FROM upper_devices ud
       JOIN monitoring_holes mh ON mh.upper_device_id = ud.id
       WHERE mh.project_id = ?
       GROUP BY ud.id
       ORDER BY ud.id DESC`,
      [safeId]
    );
    const lowerDeviceList = await this.db.query(
      `SELECT ld.id, ld.device_code, ld.device_name, ld.status,
              GROUP_CONCAT(DISTINCT COALESCE(mh.hole_name, mh.hole_number) ORDER BY mh.hole_number SEPARATOR '、') AS related_hole_names,
              GROUP_CONCAT(DISTINCT ud.imei ORDER BY ud.imei SEPARATOR '、') AS related_upper_imeis
       FROM lower_devices ld
       JOIN monitoring_holes mh ON mh.lower_device_id = ld.id
       LEFT JOIN upper_devices ud ON ud.id = mh.upper_device_id
       WHERE mh.project_id = ?
       GROUP BY ld.id
       ORDER BY ld.id DESC`,
      [safeId]
    );

    return {
      // 修复说明：工程详情顶部需要直接展示工程基础信息，因此这里把项目主档和回查到的客户名称合并成 basicInfo，前端无需二次拼装。
      basicInfo: {
        ...project,
        customer_name: customerMap.get(safeId) || project.client_name || '--',
        hole_count: Number(project.hole_count || 0)
      },
      holeList,
      upperDeviceList,
      lowerDeviceList
    };
  }

  buildGatewayDetailRows(positivePoints = [], negativePoints = []) {
    const detailMap = new Map();

    positivePoints.forEach((point, index) => {
      const key = `${point?.idx ?? index}_${point?.node ?? index}`;
      detailMap.set(key, {
        idx: point?.idx ?? index,
        node: point?.node ?? null,
        depth: point?.depth ?? null,
        positiveValue: point?.value ?? null,
        negativeValue: null
      });
    });

    negativePoints.forEach((point, index) => {
      const key = `${point?.idx ?? index}_${point?.node ?? index}`;
      const existing = detailMap.get(key) || {
        idx: point?.idx ?? index,
        node: point?.node ?? null,
        depth: point?.depth ?? null,
        positiveValue: null,
        negativeValue: null
      };
      existing.negativeValue = point?.value ?? null;
      if (existing.depth === null || existing.depth === undefined || existing.depth === '') {
        existing.depth = point?.depth ?? null;
      }
      if (existing.node === null || existing.node === undefined || existing.node === '') {
        existing.node = point?.node ?? null;
      }
      detailMap.set(key, existing);
    });

    return Array.from(detailMap.values()).sort((left, right) => {
      const leftDepth = Number(left.depth);
      const rightDepth = Number(right.depth);
      const leftHasDepth = Number.isFinite(leftDepth);
      const rightHasDepth = Number.isFinite(rightDepth);

      // 修复说明：管理端明细排序对齐客户端原始数据列表，优先按深度从浅到深展示，深度缺失时再按 idx 兜底。
      if (leftHasDepth && rightHasDepth && leftDepth !== rightDepth) {
        return leftDepth - rightDepth;
      }

      return Number(left.idx || 0) - Number(right.idx || 0);
    });
  }

  async listProjectsForRawData() {
    // 修复说明：为兼容现有原始数据筛选逻辑，这里继续保留旧方法名，但底层直接复用统一工程列表查询，避免两套工程来源出现不一致。
    return this.listProjects();
  }

  async listMonitoringHolesForRawData({ project_id } = {}) {
    const filters = [`t.status = 'completed'`, `t.result_payload IS NOT NULL`];
    const params = [];

    if (project_id !== undefined && project_id !== null && project_id !== '') {
      filters.push(`mh.project_id = ?`);
      params.push(Number(project_id));
    }

    const rows = await this.db.query(
      `SELECT DISTINCT mh.id, mh.project_id, mh.hole_name, mh.hole_number
       FROM monitoring_holes mh
       INNER JOIN admin_device_tasks t
         ON mh.id = CAST(JSON_UNQUOTE(JSON_EXTRACT(t.metadata_json, '$.adminHoleId')) AS UNSIGNED)
       WHERE ${filters.join(' AND ')}
       ORDER BY mh.hole_number ASC, mh.hole_name ASC, mh.id ASC`,
      params
    );

    return rows;
  }

  async listRawData({ page = 1, limit = 20, search = '', project_id = '', hole_id = '', upper_imei = '', start_time = '', end_time = '' } = {}) {
    const safePage = Math.max(Number(page) || 1, 1);
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const offset = (safePage - 1) * safeLimit;
    const keyword = String(search || '').trim();
    // 修复说明：管理端“原始数据”页现在展示的是通讯服务成功返回的结果点位，因此只保留已完成且已有结果载荷的任务。
    const filters = [`t.status = 'completed'`, `t.result_payload IS NOT NULL`];
    const params = [];

    const safeProjectId = project_id === '' ? null : Number(project_id);
    const safeHoleId = hole_id === '' ? null : Number(hole_id);
    const upperImeiKeyword = String(upper_imei || '').trim();
    const startTime = String(start_time || '').trim();
    const endTime = String(end_time || '').trim();

    if (Number.isInteger(safeProjectId) && safeProjectId > 0) {
      // 修复说明：管理端原始数据列表新增按工程筛查，这里直接基于管理端测孔归属工程过滤，避免前端只能做模糊搜索。
      filters.push(`mh.project_id = ?`);
      params.push(safeProjectId);
    }

    if (Number.isInteger(safeHoleId) && safeHoleId > 0) {
      // 修复说明：管理端原始数据列表新增按测孔精确筛查，确保和客户端“工程 -> 测孔”二级筛选口径一致。
      filters.push(`mh.id = ?`);
      params.push(safeHoleId);
    }

    if (upperImeiKeyword) {
      // 修复说明：上位机 IMEI 继续保留独立筛查项，避免与工程测孔混在同一个搜索框里造成误筛。
      filters.push(`t.imei LIKE ?`);
      params.push(`%${upperImeiKeyword}%`);
    }

    if (startTime) {
      // 修复说明：监测日期筛查应与页面展示的监测时间列一致，这里统一按 completed_at 优先、created_at 兜底进行过滤。
      filters.push(`COALESCE(t.completed_at, t.created_at) >= ?`);
      params.push(startTime.replace('T', ' '));
    }

    if (endTime) {
      // 修复说明：结束时间同样按 completed_at 优先过滤，确保筛查结果和用户看到的监测时间一致。
      filters.push(`COALESCE(t.completed_at, t.created_at) <= ?`);
      params.push(endTime.replace('T', ' '));
    }

    if (keyword) {
      // 修复说明：管理端原始数据页现在按任务结果维度展示，因此搜索也改成围绕任务ID、上位机IMEI和测孔元数据检索。
      filters.push(`(
        t.task_id LIKE ?
        OR t.imei LIKE ?
        OR p.project_name LIKE ?
        OR JSON_UNQUOTE(JSON_EXTRACT(t.metadata_json, '$.holeName')) LIKE ?
        OR JSON_UNQUOTE(JSON_EXTRACT(t.metadata_json, '$.holeNumber')) LIKE ?
      )`);
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }

    const whereSql = `WHERE ${filters.join(' AND ')}`;
    // 修复说明：管理端原始数据列表当前展示的是“监测时间/完成时间”，若仍按 created_at 排序，会出现列表顺序与页面展示时间不一致的显示错误。
    // 这里改为优先按 completed_at 倒序，确保用户看到的列表顺序与监测时间列保持一致；created_at 和 id 仅作为并列兜底排序。
    const rows = await this.db.query(
      `SELECT t.id, t.task_id, t.imei, t.status, t.metadata_json, t.result_payload, t.created_at, t.completed_at,
              mh.id AS admin_hole_id, mh.project_id, mh.hole_name, mh.hole_number, p.project_name
       FROM admin_device_tasks t
       LEFT JOIN monitoring_holes mh
         ON mh.id = CAST(JSON_UNQUOTE(JSON_EXTRACT(t.metadata_json, '$.adminHoleId')) AS UNSIGNED)
       LEFT JOIN projects p ON p.id = mh.project_id
       ${whereSql}
       ORDER BY t.completed_at DESC, t.created_at DESC, t.id DESC
       LIMIT ${safeLimit} OFFSET ${offset}`,
      params
    );
    const countRows = await this.db.query(
      `SELECT COUNT(*) AS total
       FROM admin_device_tasks t
       LEFT JOIN monitoring_holes mh
         ON mh.id = CAST(JSON_UNQUOTE(JSON_EXTRACT(t.metadata_json, '$.adminHoleId')) AS UNSIGNED)
       LEFT JOIN projects p ON p.id = mh.project_id
       ${whereSql}`,
      params
    );

    const parsedRows = rows.map((row) => ({
      ...row,
      metadata: this.safeParseJson(row.metadata_json) || {},
      resultPayload: this.safeParseJson(row.result_payload) || {}
    }));

    const list = parsedRows.map((row) => {
      const gatewayResultPoint = row.resultPayload?.gatewayResultPoint || {};
      const gatewayResult = row.resultPayload?.gatewayResult || {};
      const rawMeasurements = Array.isArray(row.resultPayload?.rawMeasurements) ? row.resultPayload.rawMeasurements : [];
      const positivePayload = gatewayResultPoint.result_a0_json || null;
      const negativePayload = gatewayResultPoint.result_a180_json || null;
      const positivePoints = this.normalizeGatewayPoints(positivePayload);
      const negativePoints = this.normalizeGatewayPoints(negativePayload);
      const detailRows = this.buildGatewayDetailRows(positivePoints, negativePoints);
      const hole = {
        hole_name: row.hole_name,
        hole_number: row.hole_number,
        project_id: row.project_id
      };
      const project = {
        project_name: row.project_name
      };
      const lowerDeviceCode = rawMeasurements[0]?.device_code || row.metadata?.lowerDeviceCode || null;
      // 修复说明：网关结果里的 finished_at / measurement_time 当前以 UTC 串形式回传，直接展示会比实际业务时间少 8 小时；
      // 管理端任务 completed_at 与用户看到的实际完成时间一致，因此这里改为优先使用 completed_at，并在后端直接格式化成北京时间字符串。
      const measurementTime = this.formatBeijingDateTime(row.completed_at || gatewayResult.finished_at || rawMeasurements[0]?.measurement_time || null);

      return {
        id: row.id,
        taskId: row.task_id,
        measurementTime,
        relatedHole: this.buildRelatedHoleLabel(row.metadata, hole, project),
        upperImei: row.imei,
        lowerDeviceCode,
        nodeNum: gatewayResultPoint.node_num || detailRows.length || positivePoints.length || negativePoints.length || 0,
        detailRows,
        status: row.status,
        createdAt: row.created_at,
        completedAt: row.completed_at
      };
    });

    return {
      list,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total: countRows[0]?.total || 0,
        totalPages: Math.ceil((countRows[0]?.total || 0) / safeLimit)
      }
    };
  }

  async updateCustomer(id, payload) {
    const customerCode = String(payload.customerCode || '').trim();
    const customerName = String(payload.customerName || '').trim();
    const contactPerson = payload.contactPerson !== undefined ? (String(payload.contactPerson || '').trim() || null) : undefined;
    const contactPhone = payload.contactPhone !== undefined ? (String(payload.contactPhone || '').trim() || null) : undefined;
    const callbackUrl = payload.callbackUrl !== undefined ? (String(payload.callbackUrl || '').trim() || null) : undefined;
    const callbackKey = payload.callbackKey !== undefined ? (String(payload.callbackKey || '').trim() || null) : undefined;
    const hasCallbackKeyColumn = await this.hasCustomerCallbackKeyColumn();
    const status = payload.status;
    const updates = [];
    const params = [];

    if (customerCode) {
      updates.push('customer_code = ?');
      params.push(customerCode);
    }
    if (customerName) {
      updates.push('customer_name = ?');
      params.push(customerName);
    }
    if (contactPerson !== undefined) {
      updates.push('contact_person = ?');
      params.push(contactPerson);
    }
    if (contactPhone !== undefined) {
      updates.push('contact_phone = ?');
      params.push(contactPhone);
    }
    if (callbackUrl !== undefined) {
      updates.push('callback_url = ?');
      params.push(callbackUrl);
    }
    if (callbackKey !== undefined && hasCallbackKeyColumn) {
      // 修复说明：只有数据库已存在 callback_key 字段时才写入，避免现网旧库在升级窗口期更新客户时再次报未知列错误。
      updates.push('callback_key = ?');
      params.push(callbackKey);
    }
    if (status && ['active', 'inactive'].includes(status)) {
      updates.push('status = ?');
      params.push(status);
    }

    if (!updates.length) {
      return this.getCustomerById(id);
    }

    params.push(id);
    await this.db.execute(`UPDATE admin_customers SET ${updates.join(', ')} WHERE id = ?`, params);
    return this.getCustomerById(id);
  }

  async deleteCustomer(id) {
    await this.db.execute('DELETE FROM admin_customers WHERE id = ?', [id]);
  }

  async getCustomerById(id) {
    const hasCallbackKeyColumn = await this.hasCustomerCallbackKeyColumn();
    const rows = await this.db.query(
      `SELECT id, customer_code, customer_name, contact_person, contact_phone,
              client_key, callback_url,
              ${hasCallbackKeyColumn ? 'callback_key' : 'NULL AS callback_key'},
              status, created_at, updated_at
       FROM admin_customers
       WHERE id = ?
       LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  }

  async hasCustomerCallbackKeyColumn() {
    if (!this.customerCallbackKeyColumnPromise) {
      this.customerCallbackKeyColumnPromise = this.db.query(
        `SELECT COUNT(*) AS total
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'admin_customers'
           AND COLUMN_NAME = 'callback_key'`
      ).then(rows => Number(rows[0]?.total || 0) > 0);
    }

    return this.customerCallbackKeyColumnPromise;
  }

  async replaceUserRoles(userId, roleCodes) {
    const uniqueRoleCodes = [...new Set(roleCodes.filter(Boolean))];
    if (!uniqueRoleCodes.length) {
      return;
    }

    const placeholders = uniqueRoleCodes.map(() => '?').join(', ');
    const roles = await this.db.query(`SELECT id, role_code FROM roles WHERE role_code IN (${placeholders})`, uniqueRoleCodes);
    if (!roles.length) {
      throw new Error('指定角色不存在');
    }

    await this.db.execute('DELETE FROM user_roles WHERE user_id = ?', [userId]);
    for (const role of roles) {
      await this.db.execute(
        'INSERT INTO user_roles (user_id, role_id, created_at, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
        [userId, role.id]
      );
    }
  }

  async paginate(baseSql, countSql, searchFields, { page = 1, limit = 20, search = '', orderBy = 'id DESC' } = {}) {
    const safePage = Math.max(Number(page) || 1, 1);
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const offset = (safePage - 1) * safeLimit;
    const keyword = String(search || '').trim();
    const filters = [];
    const params = [];

    if (keyword && searchFields.length) {
      filters.push(`(${searchFields.map(field => `${field} LIKE ?`).join(' OR ')})`);
      searchFields.forEach(() => params.push(`%${keyword}%`));
    }

    const whereSql = filters.length ? ` WHERE ${filters.join(' AND ')}` : '';
    const list = await this.db.query(`${baseSql}${whereSql} ORDER BY ${orderBy} LIMIT ${safeLimit} OFFSET ${offset}`, params);
    const countRows = await this.db.query(`${countSql}${whereSql}`, params);

    return {
      list,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total: countRows[0]?.total || 0,
        totalPages: Math.ceil((countRows[0]?.total || 0) / safeLimit)
      }
    };
  }
}

module.exports = AdminService;
