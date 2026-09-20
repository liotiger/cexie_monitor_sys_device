const crypto = require('crypto');

const TASK_DEFINITIONS = {
  monitor_start: {
    taskType: 'monitor_start',
    label: '监测',
    commandText: 'MONITOR_START',
    gatewayPath: '/monitor/start',
    requiresTaskContext: true,
    requiresResultPoint: true
  },
  home_move: {
    taskType: 'home_move',
    label: '归位',
    commandText: 'HOME_MOVE',
    gatewayPath: '/monitor/homemove',
    requiresTaskContext: false,
    requiresResultPoint: false
  },
  bottom_test: {
    taskType: 'bottom_test',
    label: '底部检测',
    commandText: 'BOTTOM_TEST',
    gatewayPath: '/monitor/bottomtest',
    requiresTaskContext: false,
    requiresResultPoint: false
  },
  set_params: {
    taskType: 'set_params',
    label: '参数配置',
    commandText: 'SET_PARAMS',
    gatewayPath: '/monitor/set-params',
    requiresTaskContext: false,
    requiresResultPoint: false
  },
  status_check: {
    taskType: 'status_check',
    label: '状态检查',
    commandText: 'STATUS_CHECK',
    gatewayPath: '/monitor/status',
    requiresTaskContext: false,
    requiresResultPoint: false,
    synchronous: true
  },
  // 修复说明：管理端工作台新增“读取配置”能力，对应 HTTPAPI 文档的 POST /params/fetch，
  // 任务完成后从网关库 dg_device_params 读取参数快照并回填工作台表单。
  params_fetch: {
    taskType: 'params_fetch',
    label: '参数读取',
    commandText: 'PARAMS_FETCH',
    gatewayPath: '/params/fetch',
    requiresTaskContext: false,
    requiresResultPoint: false
  }
};

const SET_PARAM_TYPES = Object.freeze({
  monitorNodesNum: 'uint16',
  deviceNode: 'uint16',
  monitorTestDis: 'float32',
  monitorClosetoDis: 'float32',
  monitorNodeOnDelayMs: 'uint16',
  monitorFromStartDis: 'float32',
  startSpd: 'float32',
  orgLowSpd: 'float32',
  orgAccSpd: 'float32',
  manualSpd: 'float32',
  manualAccSpd: 'float32',
  workSpd: 'float32',
  workAccSpd: 'float32',
  spaceSpd: 'float32'
});

const TASK_TYPE_BY_COMMAND = Object.values(TASK_DEFINITIONS).reduce((map, definition) => {
  map[definition.commandText] = definition.taskType;
  return map;
}, {});

// 修复说明：dg_device_params.params_json 使用带类型前缀的寄存器键名（f=FLOAT32、w=UINT16、n=INT32、dw=DWORD），
// 与 /monitor/set-params 接口书写的参数名不同，这里登记确定的一一对应关系。
// 关键：待写入参数按寄存器区段分散存放，速度类在 part2、监测类在 part3，
// 因此读取时必须合并所有区段，不能只取 part3（否则速度类参数会全部读不到）。
const DEVICE_PARAM_ALIASES = Object.freeze({
  monitorNodesNum: 'wMonitorNodesNum',
  deviceNode: 'wDeviceNode',
  monitorTestDis: 'fMonitorTestDis',
  monitorClosetoDis: 'fMonitorClosetoDis',
  monitorNodeOnDelayMs: 'wMonitorNodeOnDelayMs',
  monitorFromStartDis: 'fMonitorFromStartDis',
  startSpd: 'fStartSpd',
  orgLowSpd: 'fOrgLowSpd',
  orgAccSpd: 'fOrgAccSpd',
  manualSpd: 'fManualSpd',
  manualAccSpd: 'fManualAccSpd',
  workSpd: 'fWorkSpd',
  workAccSpd: 'fWorkAccSpd',
  spaceSpd: 'fSpaceSpd'
});

// 修复说明：params_json 的寄存器区段划分，part1=轴/版本，part2=速度，part3=监测。
const DEVICE_PARAM_SECTIONS = Object.freeze(['part1', 'part2', 'part3']);

// 修复说明：网关侧新增了 3 段十六进制下位机标识，这里使用带前缀的固定拼接规则生成可逆 device_code，避免与历史人工编码冲突。
const GATEWAY_LOWER_DEVICE_CODE_PREFIX = 'GWHEX:';

class TaskService {
  constructor({ db, gatewayDb, config, fetchImpl = fetch, logger = console }) {
    this.db = db;
    this.gatewayDb = gatewayDb;
    this.config = config;
    this.fetchImpl = fetchImpl;
    this.logger = logger;
    this.activePollers = new Map();
    this.pollLocks = new Set();
    this.customerCallbackKeyColumnPromise = null;
  }

  async listCustomers() {
    const hasCallbackKeyColumn = await this.hasCustomerCallbackKeyColumn();
    const rows = await this.db.query(
      `SELECT c.id, c.customer_code, c.customer_name, c.contact_person, c.contact_phone,
              c.client_key, c.callback_url,
              ${hasCallbackKeyColumn ? 'c.callback_key' : 'NULL AS callback_key'},
              c.status, c.created_at, c.updated_at,
              GROUP_CONCAT(DISTINCT acu.upper_device_id ORDER BY acu.upper_device_id SEPARATOR ',') AS upper_device_ids,
              GROUP_CONCAT(DISTINCT ud.imei ORDER BY ud.imei SEPARATOR ',') AS upper_device_imeis
       FROM admin_customers c
       LEFT JOIN admin_customer_upper_devices acu ON acu.customer_id = c.id
       LEFT JOIN upper_devices ud ON ud.id = acu.upper_device_id
       GROUP BY c.id
       ORDER BY c.id DESC`
    );
    return rows.map(row => this.toCustomer(row));
  }

  async createCustomer(payload) {
    const customerCode = String(payload.customerCode || '').trim();
    const customerName = String(payload.customerName || '').trim();
    const contactPerson = this.nullIfEmpty(payload.contactPerson);
    const contactPhone = this.nullIfEmpty(payload.contactPhone);
    const callbackUrl = this.nullIfEmpty(payload.callbackUrl);
    const callbackKey = this.nullIfEmpty(payload.callbackKey);
    const hasCallbackKeyColumn = await this.hasCustomerCallbackKeyColumn();

    if (!customerCode || !customerName) {
      throw new Error('customerCode 和 customerName 不能为空');
    }

    const clientKey = crypto.randomBytes(24).toString('hex');
    let result;
    try {
      result = hasCallbackKeyColumn
        ? await this.db.execute(
            // 修复说明：客户侧回调鉴权需要支持按客户单独配置，避免所有客户端都被迫共用一套全局回调密钥。
            `INSERT INTO admin_customers (
               customer_code, customer_name, contact_person, contact_phone,
               client_key, callback_url, callback_key, status
             ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
            [customerCode, customerName, contactPerson, contactPhone, clientKey, callbackUrl, callbackKey]
          )
        : await this.db.execute(
            // 修复说明：现网旧库尚未补 callback_key 字段时，先兼容只写基础字段，避免创建客户直接因未知列失败。
            `INSERT INTO admin_customers (
               customer_code, customer_name, contact_person, contact_phone,
               client_key, callback_url, status
             ) VALUES (?, ?, ?, ?, ?, ?, 'active')`,
            [customerCode, customerName, contactPerson, contactPhone, clientKey, callbackUrl]
          );
    } catch (error) {
      if (error && error.code === 'ER_DUP_ENTRY') {
        throw new Error(`客户编码已存在: ${customerCode}`);
      }
      throw error;
    }

    if (Array.isArray(payload.upperDeviceIds)) {
      await this.replaceCustomerUpperDevices(result.insertId, payload.upperDeviceIds);
    }

    return this.getCustomerById(result.insertId);
  }

  async getCustomerById(id) {
    const hasCallbackKeyColumn = await this.hasCustomerCallbackKeyColumn();
    const rows = await this.db.query(
      `SELECT c.id, c.customer_code, c.customer_name, c.contact_person, c.contact_phone,
              c.client_key, c.callback_url,
              ${hasCallbackKeyColumn ? 'c.callback_key' : 'NULL AS callback_key'},
              c.status, c.created_at, c.updated_at,
              GROUP_CONCAT(DISTINCT acu.upper_device_id ORDER BY acu.upper_device_id SEPARATOR ',') AS upper_device_ids,
              GROUP_CONCAT(DISTINCT ud.imei ORDER BY ud.imei SEPARATOR ',') AS upper_device_imeis
       FROM admin_customers c
       LEFT JOIN admin_customer_upper_devices acu ON acu.customer_id = c.id
       LEFT JOIN upper_devices ud ON ud.id = acu.upper_device_id
       WHERE c.id = ?
       GROUP BY c.id
       LIMIT 1`,
      [id]
    );
    return rows[0] ? this.toCustomer(rows[0]) : null;
  }

  async getCustomerByClientKey(clientKey) {
    const hasCallbackKeyColumn = await this.hasCustomerCallbackKeyColumn();
    const rows = await this.db.query(
      `SELECT id, customer_code, customer_name, contact_person, contact_phone,
              client_key, callback_url,
              ${hasCallbackKeyColumn ? 'callback_key' : 'NULL AS callback_key'},
              status, created_at, updated_at
       FROM admin_customers
       WHERE client_key = ? AND status = 'active'
       LIMIT 1`,
      [clientKey]
    );
    return rows[0] ? this.toCustomer(rows[0]) : null;
  }

  async getUpperDevicesForCustomer(customerId) {
    const upperDevices = await this.db.query(
      `SELECT ud.id, ud.imei, ud.device_name, ud.manufacturer, ud.model, ud.serial_number, ud.firmware_version,
              ud.network_status, ud.last_online_time, ud.ip_address, ud.signal_strength,
              ud.wire_change_mileage, ud.total_mileage, ud.inspection_mileage,
              ud.status, ud.created_at, ud.updated_at
       FROM admin_customer_upper_devices acu
       JOIN upper_devices ud ON ud.id = acu.upper_device_id
       WHERE acu.customer_id = ?
       ORDER BY ud.imei ASC`,
      [customerId]
    );
    return upperDevices.map(device => ({
      ...device,
      mileage_warnings: this.buildMileageWarnings(
        device.total_mileage,
        device.wire_change_mileage,
        device.inspection_mileage
      )
    }));
  }

  async getLowerDevicesForCustomer(customerId) {
    return this.db.query(
      `SELECT ld.id, ld.device_code, ld.device_name, ld.manufacturer, ld.model, ld.serial_number,
              ld.k_value, ld.beta_value, ld.calibration_date, ld.calibration_org, ld.valid_until,
              ld.calibration_status, ld.status, ld.total_measurement_count, ld.total_measurement_depth,
              di.sold_at, di.updated_at
       FROM device_inventory di
       JOIN lower_devices ld ON ld.id = di.lower_device_id
       WHERE di.device_type = 'lower'
         AND di.inventory_status = 'sold'
         AND di.customer_id = ?
       ORDER BY ld.device_code ASC`,
      [customerId]
    ).then(devices => devices.map(device => ({
      ...device,
      calibration_date: this.formatDateOnly(device.calibration_date),
      valid_until: this.formatDateOnly(device.valid_until)
    })));
  }

  async listBindableUpperDevices(customerId = null) {
    const normalizedCustomerId = Number(customerId);
    const params = [];
    let whereSql = 'WHERE acu.customer_id IS NULL';

    if (Number.isInteger(normalizedCustomerId) && normalizedCustomerId > 0) {
      whereSql = 'WHERE acu.customer_id IS NULL OR acu.customer_id = ?';
      params.push(normalizedCustomerId);
    }

    return this.db.query(
      `SELECT ud.id, ud.imei, ud.device_name, ud.manufacturer, ud.model, ud.serial_number, ud.firmware_version,
              ud.network_status, ud.last_online_time, ud.ip_address, ud.signal_strength, ud.status, ud.created_at, ud.updated_at,
              acu.customer_id AS bound_customer_id
       FROM upper_devices ud
       LEFT JOIN admin_customer_upper_devices acu ON acu.upper_device_id = ud.id
       ${whereSql}
       ORDER BY ud.imei ASC`,
      params
    );
  }

  async validateUpperDeviceBindings(customerId, upperDeviceIds) {
    if (!upperDeviceIds.length) {
      return;
    }

    const placeholders = upperDeviceIds.map(() => '?').join(', ');
    const rows = await this.db.query(
      `SELECT ud.id, ud.imei, c.customer_name
       FROM admin_customer_upper_devices acu
       JOIN upper_devices ud ON ud.id = acu.upper_device_id
       JOIN admin_customers c ON c.id = acu.customer_id
       WHERE acu.upper_device_id IN (${placeholders})
         AND acu.customer_id <> ?`,
      [...upperDeviceIds, customerId]
    );

    if (rows.length) {
      const detail = rows
        .map(item => `${item.imei}（已绑定客户：${item.customer_name}）`)
        .join('、');
      throw new Error(`以下上位机已绑定其他客户：${detail}`);
    }
  }

  async replaceCustomerUpperDevices(customerId, upperDeviceIds) {
    const customer = await this.getCustomerById(customerId);
    if (!customer) {
      throw new Error('客户不存在');
    }

    const normalizedIds = [...new Set((upperDeviceIds || [])
      .map(value => Number(value))
      .filter(value => Number.isInteger(value) && value > 0))];

    if (normalizedIds.length) {
      const placeholders = normalizedIds.map(() => '?').join(', ');
      const rows = await this.db.query(
        `SELECT id FROM upper_devices WHERE id IN (${placeholders})`,
        normalizedIds
      );
      if (rows.length !== normalizedIds.length) {
        throw new Error('存在无效的上位机设备');
      }
    }

    await this.validateUpperDeviceBindings(customerId, normalizedIds);

    await this.db.execute('DELETE FROM admin_customer_upper_devices WHERE customer_id = ?', [customerId]);
    for (const upperDeviceId of normalizedIds) {
      await this.db.execute(
        `INSERT INTO admin_customer_upper_devices (customer_id, upper_device_id)
         VALUES (?, ?)`,
        [customerId, upperDeviceId]
      );
    }

    return this.getUpperDevicesForCustomer(customerId);
  }

  async createTask(customer, payload) {
    const imei = String(payload.imei || '').trim();
    const callbackUrl = this.nullIfEmpty(payload.callbackUrl) || customer.callbackUrl || null;
    const pollIntervalMs = this.normalizePollInterval(payload.pollIntervalMs);
    const timeoutSeconds = this.normalizeTimeoutSeconds(payload.timeoutSeconds);
    const metadata = payload.metadata && typeof payload.metadata === 'object' ? { ...payload.metadata } : {};
    const taskDefinition = this.getTaskDefinition(payload.taskType || metadata.taskType || 'monitor_start');
    const requestPayload = taskDefinition.taskType === 'set_params'
      ? { ...payload, params: this.normalizeSetParams(payload.params) }
      : payload;
    const taskId = payload.taskId || `task_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    if (!imei) {
      throw new Error('imei 不能为空');
    }

    await this.assertCustomerOwnsUpperDevice(customer.id, imei);

    metadata.taskType = taskDefinition.taskType;
    metadata.taskLabel = taskDefinition.label;
    metadata.upperDeviceImei = imei;

    if (taskDefinition.requiresTaskContext) {
      const taskContext = await this.resolveTaskContext(customer, imei, requestPayload, metadata);
      metadata.sourceProjectId = taskContext.source_project_id;
      metadata.sourceHoleId = taskContext.source_hole_id;
      metadata.projectId = taskContext.source_project_id;
      metadata.projectCode = taskContext.project_code;
      metadata.projectName = taskContext.project_name;
      metadata.adminProjectId = taskContext.project_id;
      metadata.holeId = taskContext.source_hole_id;
      metadata.holeNo = taskContext.hole_number;
      metadata.holeNumber = taskContext.hole_number;
      metadata.holeName = taskContext.hole_name;
      metadata.holeType = taskContext.hole_type;
      metadata.holeDepth = taskContext.hole_depth;
      metadata.adminHoleId = taskContext.hole_id;
      metadata.upperDeviceId = taskContext.source_upper_device_id || metadata.upperDeviceId || null;
      metadata.adminUpperDeviceId = taskContext.upper_device_id;
      metadata.lowerDeviceId = taskContext.lower_device_id || null;
      metadata.lowerDeviceCode = taskContext.lower_device_code || null;
      metadata.gatewayHoleNo = 1;
    } else {
      const upperDevice = await this.getUpperDeviceByImei(imei);
      if (!upperDevice) {
        throw new Error('Admin upper device not found for IMEI');
      }
      metadata.adminUpperDeviceId = upperDevice.id;
    }

    await this.db.execute(
      `INSERT INTO admin_device_tasks (
        task_id, customer_id, imei, command_text, command_format, callback_url,
        poll_interval_ms, timeout_seconds, status, callback_status,
        request_payload, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'created', 'pending', ?, ?)`,
      [
        taskId,
        customer.id,
        imei,
        taskDefinition.commandText,
        'http',
        callbackUrl,
        pollIntervalMs,
        timeoutSeconds,
        JSON.stringify(requestPayload || {}),
        JSON.stringify(metadata)
      ]
    );

    this.dispatchTask(taskId).catch(error => {
      this.logger.error('[admin-backend] dispatch task failed:', error);
    });

    return this.getTaskForCustomer(taskId, customer.id);
  }

  async listTasksForCustomer(customerId, options = {}) {
    const safeLimit = Math.min(Math.max(Number(options.limit) || 20, 1), 100);
    const imei = this.nullIfEmpty(options.imei);
    const hasCallbackKeyColumn = await this.hasCustomerCallbackKeyColumn();
    const whereSql = ['t.customer_id = ?'];
    const params = [customerId];

    if (imei) {
      // 修复说明：上位机列表页需要按 IMEI 查看单台设备的历史任务，这里把筛选能力下沉到管理端，避免客户端先拉全量再过滤。
      whereSql.push('t.imei = ?');
      params.push(imei);
    }

    const rows = await this.db.query(
      `SELECT t.*, c.customer_code, c.customer_name, c.callback_url AS customer_callback_url
              , ${hasCallbackKeyColumn ? 'c.callback_key' : 'NULL'} AS customer_callback_key
       FROM admin_device_tasks t
       JOIN admin_customers c ON c.id = t.customer_id
       WHERE ${whereSql.join(' AND ')}
       ORDER BY t.id DESC
       LIMIT ?`,
      [...params, safeLimit]
    );
    return rows.map(row => this.toTask(row));
  }

  async getTaskForCustomer(taskId, customerId) {
    const hasCallbackKeyColumn = await this.hasCustomerCallbackKeyColumn();
    const rows = await this.db.query(
      `SELECT t.*, c.customer_code, c.customer_name, c.callback_url AS customer_callback_url
              , ${hasCallbackKeyColumn ? 'c.callback_key' : 'NULL'} AS customer_callback_key
       FROM admin_device_tasks t
       JOIN admin_customers c ON c.id = t.customer_id
       WHERE t.task_id = ? AND t.customer_id = ?
       LIMIT 1`,
      [taskId, customerId]
    );
    return rows[0] ? this.toTask(rows[0]) : null;
  }

  async listTasksForAdmin(options = {}) {
    const safeLimit = Math.min(Math.max(Number(options.limit) || 20, 1), 100);
    const imei = this.nullIfEmpty(options.imei);
    const hasCallbackKeyColumn = await this.hasCustomerCallbackKeyColumn();
    const whereSql = [];
    const params = [];

    if (imei) {
      // 修复说明：管理端上位机列表需要按单台设备查看监测任务历史，这里直接支持按 IMEI 过滤并按创建时间倒序返回。
      whereSql.push('t.imei = ?');
      params.push(imei);
    }

    const rows = await this.db.query(
      `SELECT t.*, c.customer_code, c.customer_name, c.callback_url AS customer_callback_url
              , ${hasCallbackKeyColumn ? 'c.callback_key' : 'NULL'} AS customer_callback_key
       FROM admin_device_tasks t
       JOIN admin_customers c ON c.id = t.customer_id
       ${whereSql.length ? `WHERE ${whereSql.join(' AND ')}` : ''}
       ORDER BY t.created_at DESC, t.id DESC
       LIMIT ?`,
      [...params, safeLimit]
    );
    return rows.map(row => this.toTask(row));
  }

  // 修复说明：管理端需要按 taskId 查询单个任务状态（如参数读取任务轮询），
  // 这里提供带客户信息的管理端任务查询。
  async getTaskForAdmin(taskId) {
    if (!taskId) {
      return null;
    }

    const hasCallbackKeyColumn = await this.hasCustomerCallbackKeyColumn();
    const rows = await this.db.query(
      `SELECT t.*, c.customer_code, c.customer_name, c.callback_url AS customer_callback_url
              , ${hasCallbackKeyColumn ? 'c.callback_key' : 'NULL'} AS customer_callback_key
       FROM admin_device_tasks t
       JOIN admin_customers c ON c.id = t.customer_id
       WHERE t.task_id = ?
       LIMIT 1`,
      [taskId]
    );

    return rows[0] ? this.toTask(rows[0]) : null;
  }

  async cancelTaskForCustomer(taskId, customerId) {
    const task = await this.getTaskForCustomer(taskId, customerId);
    if (!task) {
      throw new Error('任务不存在');
    }

    if (this.isTerminal(task.status)) {
      throw new Error('当前任务已结束，不能重复取消');
    }

    this.clearPoller(task.taskId);
    this.pollLocks.delete(task.taskId);

    // 修复说明：HTTPAPI 文档当前只提供 /monitor/start，没有网关侧取消接口；
    // 因此这里能够做到的是停止管理端继续轮询并将任务标记为 skipped，同时把这个事实明确写入错误信息，避免误以为已经终止了网关执行。
    const cancelMessage = task.scheduledTaskId
      ? '任务已在管理端取消，已停止继续轮询；通讯服务文档未提供取消接口，网关侧任务可能仍在执行'
      : '任务已取消';

    await this.db.execute(
      `UPDATE admin_device_tasks
       SET status = 'skipped',
           completed_at = CURRENT_TIMESTAMP,
           error_message = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE task_id = ?`,
      [cancelMessage, task.taskId]
    );

    await this.deliverCallback(task.taskId);
    return this.getTaskForCustomer(task.taskId, customerId);
  }

  async resumePendingTasks() {
    const hasCallbackKeyColumn = await this.hasCustomerCallbackKeyColumn();
    const rows = await this.db.query(
      `SELECT t.*, c.customer_code, c.customer_name, c.callback_url AS customer_callback_url
              , ${hasCallbackKeyColumn ? 'c.callback_key' : 'NULL'} AS customer_callback_key
       FROM admin_device_tasks t
       JOIN admin_customers c ON c.id = t.customer_id
       WHERE t.status IN ('created', 'queued', 'polling')
          OR (t.status IN ('completed', 'failed', 'skipped', 'timeout') AND t.callback_status = 'pending')
       ORDER BY t.id ASC`
    );

    for (const row of rows) {
      const task = this.toTask(row);
      if (this.isTerminal(task.status) && task.callbackStatus === 'pending') {
        this.deliverCallback(task.taskId).catch(error => {
          this.logger.error('[admin-backend] resume callback failed:', error);
        });
        continue;
      }

      if (task.status === 'created') {
        this.dispatchTask(task.taskId).catch(error => {
          this.logger.error('[admin-backend] resume dispatch failed:', error);
        });
      } else {
        this.schedulePoller(task.taskId, task.pollIntervalMs);
      }
    }
  }

  async dispatchTask(taskId) {
    const task = await this.getTaskInternal(taskId);
    if (!task || this.isTerminal(task.status)) {
      return;
    }

    try {
      const taskDefinition = this.getTaskDefinitionForTask(task);
      const existingGatewayTaskId = task.scheduledTaskId || null;
      let gatewayTaskId = existingGatewayTaskId;
      // 修复说明：开始监测改为“先按测孔档案下发设备参数，再启动监测”，
      // 因此 monitor_start 的首个阶段由 params_fetch 调整为 set_params。
      const monitorStartPhase = taskDefinition.taskType === 'monitor_start'
        ? (task.sendResponse?.phase || (existingGatewayTaskId ? 'monitor_start' : 'set_params'))
        : null;
      let monitorParamsConversion = null;

      if (taskDefinition.synchronous) {
        await this.executeSynchronousTask(task, taskDefinition);
        return;
      }

      if (!gatewayTaskId) {
        if (taskDefinition.taskType === 'monitor_start' && monitorStartPhase === 'set_params') {
          const paramSetResult = await this.createGatewayMonitorParamsSetTask(task);
          gatewayTaskId = paramSetResult.gatewayTaskId;
          monitorParamsConversion = paramSetResult.conversion;
        } else if (taskDefinition.requiresTaskContext) {
          const taskContext = await this.resolveTaskContextFromTask(task);
          gatewayTaskId = await this.createGatewayMonitorTask(task, taskContext);
        } else {
          gatewayTaskId = await this.createGatewayCommandTask(task, taskDefinition);
        }
      }

      const sendResponse = {
        ...(task.sendResponse || {}),
        gatewayTaskId,
        taskType: taskDefinition.taskType,
        gatewayPath: taskDefinition.taskType === 'monitor_start' && monitorStartPhase === 'set_params'
          ? '/monitor/set-params'
          : taskDefinition.gatewayPath,
        ...(taskDefinition.taskType === 'monitor_start' ? { phase: monitorStartPhase } : {}),
        ...(monitorParamsConversion ? { monitorParams: monitorParamsConversion } : {}),
        requestedAt: new Date().toISOString()
      };
      if (taskDefinition.requiresTaskContext) {
        sendResponse.holeNo = 1;
      }

      await this.db.execute(
        `UPDATE admin_device_tasks
         SET status = 'queued',
             scheduled_task_id = ?,
             send_response_json = ?,
             sent_at = CURRENT_TIMESTAMP,
             deadline_at = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL timeout_seconds SECOND),
             error_message = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE task_id = ?`,
        [gatewayTaskId, JSON.stringify(sendResponse), taskId]
      );

      this.schedulePoller(taskId, task.pollIntervalMs);
    } catch (error) {
      await this.db.execute(
        `UPDATE admin_device_tasks
         SET status = 'failed', error_message = ?, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE task_id = ?`,
        [error.message, taskId]
      );
      throw error;
    }
  }

  schedulePoller(taskId, pollIntervalMs) {
    this.clearPoller(taskId);

    const safeInterval = this.normalizePollInterval(pollIntervalMs);
    const timer = setInterval(() => {
      this.pollTask(taskId).catch(error => {
        this.logger.error(`[admin-backend] poll task ${taskId} failed:`, error);
      });
    }, safeInterval);

    this.activePollers.set(taskId, timer);

    setTimeout(() => {
      this.pollTask(taskId).catch(error => {
        this.logger.error(`[admin-backend] initial poll task ${taskId} failed:`, error);
      });
    }, 200);
  }

  async pollTask(taskId) {
    if (this.pollLocks.has(taskId)) {
      return;
    }

    this.pollLocks.add(taskId);
    try {
      const task = await this.getTaskInternal(taskId);
      if (!task) {
        this.clearPoller(taskId);
        return;
      }

      if (this.isTerminal(task.status)) {
        this.clearPoller(taskId);
        if (task.callbackStatus === 'pending') {
          await this.deliverCallback(task.taskId);
        }
        return;
      }

      if (!task.sentAt) {
        return;
      }

      if (task.deadlineAt && Date.now() > new Date(task.deadlineAt).getTime()) {
        await this.db.execute(
          `UPDATE admin_device_tasks
           SET status = 'timeout', completed_at = CURRENT_TIMESTAMP, error_message = '轮询超时', updated_at = CURRENT_TIMESTAMP
           WHERE task_id = ?`,
          [taskId]
        );
        this.clearPoller(taskId);
        await this.deliverCallback(taskId);
        return;
      }

      if (!task.scheduledTaskId) {
        await this.dispatchTask(taskId);
        return;
      }

      const taskDefinition = this.getTaskDefinitionForTask(task);
      // 修复说明：轮询源切到网关库 dg_result，真实跟踪云端通讯服务的执行状态。
      const gatewayResult = await this.getGatewayTaskResult(task.scheduledTaskId, task.imei);
      if (!gatewayResult) {
        if (task.status === 'queued') {
          await this.db.execute(
            `UPDATE admin_device_tasks
             SET status = 'polling', updated_at = CURRENT_TIMESTAMP
             WHERE task_id = ?`,
            [taskId]
          );
        }
        return;
      }

      const normalizedStatus = this.normalizeGatewayTaskStatus(gatewayResult.status);
      if (normalizedStatus === 'polling') {
        if (task.status === 'queued') {
          await this.db.execute(
            `UPDATE admin_device_tasks
             SET status = 'polling', updated_at = CURRENT_TIMESTAMP
             WHERE task_id = ?`,
            [taskId]
          );
        }
        return;
      }

      if (normalizedStatus !== 'completed') {
        const failedPayload = {
          gatewayResult,
          polledAt: new Date().toISOString()
        };
        await this.db.execute(
          `UPDATE admin_device_tasks
           SET status = ?,
               result_payload = ?,
               completed_at = CURRENT_TIMESTAMP,
               error_message = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE task_id = ?`,
          [
            normalizedStatus,
            JSON.stringify(failedPayload),
            gatewayResult.err_message || `网关任务状态异常: ${gatewayResult.status || 'UNKNOWN'}`,
            taskId
          ]
        );
        this.clearPoller(taskId);
        await this.deliverCallback(taskId);
        return;
      }

      // 修复说明：设备参数按测孔档案下发完成后，才真正调用 /monitor/start 启动监测。
      if (taskDefinition.taskType === 'monitor_start' && task.sendResponse?.phase === 'set_params') {
        await this.handleMonitorParamsSetCompletion(task, gatewayResult);
        return;
      }

      // 修复说明：参数读取任务完成后，从 dg_device_params 取出参数快照并随任务结果返回。
      if (taskDefinition.taskType === 'params_fetch') {
        await this.handleParamsFetchCompletion(task, gatewayResult);
        return;
      }

      if (!taskDefinition.requiresResultPoint) {
        let holeParameterUpdate = null;
        let monitorStatusSnapshot = null;
        const taskLogs = [];
        if (taskDefinition.taskType === 'bottom_test') {
          try {
            holeParameterUpdate = await this.syncBottomTestHoleParameters(task);
          } catch (error) {
            holeParameterUpdate = {
              status: 'failed',
              sourceTable: 'dg_device_params',
              imei: task.imei,
              message: `底部检测已完成，但测孔参数同步失败：${error.message}`,
              updatedAt: new Date().toISOString()
            };
          }
          taskLogs.push({
            type: 'hole_parameter_update',
            level: holeParameterUpdate.status === 'success' ? 'info' : 'error',
            message: holeParameterUpdate.message,
            fields: holeParameterUpdate.fields || [],
            createdAt: holeParameterUpdate.updatedAt
          });
        }

        if (taskDefinition.taskType === 'home_move') {
          try {
            monitorStatusSnapshot = await this.getHomeMoveMonitorStatus(task);
          } catch (error) {
            monitorStatusSnapshot = {
              status: 'failed',
              sourceTable: 'dg_monitor_status',
              sourceField: 'status_json.sys.axisPosMM',
              imei: task.imei,
              message: `归位已完成，但读取设备实时监测轴位置失败：${error.message}`,
              updatedAt: new Date().toISOString()
            };
          }
          taskLogs.push({
            type: 'axis_position_snapshot',
            level: monitorStatusSnapshot.status === 'success' ? 'info' : 'error',
            message: monitorStatusSnapshot.message,
            fields: monitorStatusSnapshot.status === 'success' ? [{
              field: 'axisPosMM',
              label: '设备实时监测轴位置(毫米)',
              value: monitorStatusSnapshot.axisPosMM
            }] : [],
            createdAt: monitorStatusSnapshot.updatedAt
          });
        }

        const resultPayload = {
          gatewayResult,
          ...(holeParameterUpdate ? { holeParameterUpdate } : {}),
          ...(monitorStatusSnapshot ? { monitorStatusSnapshot } : {}),
          ...(taskLogs.length ? { taskLogs } : {}),
          polledAt: new Date().toISOString()
        };
        const completionDataError = [holeParameterUpdate, monitorStatusSnapshot]
          .find(item => item?.status === 'failed')?.message || null;
        await this.db.execute(
          `UPDATE admin_device_tasks
           SET status = 'completed',
               result_payload = ?,
               completed_at = CURRENT_TIMESTAMP,
               error_message = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE task_id = ?`,
          [JSON.stringify(resultPayload), completionDataError, taskId]
        );
        this.clearPoller(taskId);
        await this.deliverCallback(taskId);
        return;
      }

      // 修复说明：仅在 dg_result.status = SUCCESS 后，再读取 dg_result_point 并写入管理端原始数据表。
      const gatewayResultPoint = await this.getGatewayResultPoint(task.scheduledTaskId, task.imei);
      if (!gatewayResultPoint) {
        await this.db.execute(
          `UPDATE admin_device_tasks
           SET status = 'failed',
               completed_at = CURRENT_TIMESTAMP,
               error_message = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE task_id = ?`,
          ['监测任务已成功，但未查询到 dg_result_point 原始数据', taskId]
        );
        this.clearPoller(taskId);
        await this.deliverCallback(taskId);
        return;
      }

      const taskContext = await this.resolveTaskContextFromTask(task);
      const measurementResult = await this.saveGatewayRawMeasurements(task, taskContext, gatewayResult, gatewayResultPoint);
      const rawMeasurements = measurementResult.rows;
      const resultPayload = {
        ...(task.resultPayload || {}),
        gatewayResult,
        gatewayResultPoint: {
          imei: gatewayResultPoint.imei,
          task_id: gatewayResultPoint.task_id,
          hole_no: gatewayResultPoint.hole_no,
          node_num: gatewayResultPoint.node_num,
          result_a0_json: this.parseGatewayJson(gatewayResultPoint.result_a0_json),
          result_a180_json: this.parseGatewayJson(gatewayResultPoint.result_a180_json)
        },
        rawMeasurements,
        deviceMileageStats: measurementResult.deviceMileageStats,
        taskLogs: [
          ...(Array.isArray(task.resultPayload?.taskLogs) ? task.resultPayload.taskLogs : []),
          measurementResult.deviceMileageStats.taskLog
        ],
        polledAt: new Date().toISOString()
      };

      await this.db.execute(
        `UPDATE admin_device_tasks
         SET status = 'completed',
             raw_measurement_id = ?,
             result_payload = ?,
             completed_at = CURRENT_TIMESTAMP,
             error_message = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE task_id = ?`,
        [
          rawMeasurements[0]?.id || null,
          JSON.stringify(resultPayload),
          taskId
        ]
      );

      this.clearPoller(taskId);
      await this.deliverCallback(taskId);
    } finally {
      this.pollLocks.delete(taskId);
    }
  }

  async deliverCallback(taskId) {
    const task = await this.getTaskInternal(taskId);
    if (!task || !this.isTerminal(task.status) || task.callbackStatus === 'success') {
      return;
    }

    const callbackUrl = task.callbackUrl || task.customerCallbackUrl;
    if (!callbackUrl) {
      await this.db.execute(
        `UPDATE admin_device_tasks
         SET callback_status = 'skipped', updated_at = CURRENT_TIMESTAMP
         WHERE task_id = ?`,
        [taskId]
      );
      return;
    }

    const callbackRawMeasurements = this.buildCallbackRawMeasurements(task);
    const callbackDeviceProfiles = await this.buildCallbackDeviceProfiles(task, callbackRawMeasurements);
    const payload = {
      taskId: task.taskId,
      scheduledTaskId: task.scheduledTaskId,
      status: task.status,
      imei: task.imei,
      customer: {
        id: task.customerId,
        code: task.customerCode,
        name: task.customerName
      },
      command: task.commandText,
      commandFormat: task.commandFormat,
      completedAt: task.completedAt,
      requestPayload: task.requestPayload,
      metadata: task.metadata,
      upperDevice: callbackDeviceProfiles.upperDevice,
      lowerDevice: callbackDeviceProfiles.lowerDevice,
      // 修复说明：客户端现阶段既兼容旧版单条 rawData，也支持新版批量 rawDataList。
      rawData: callbackRawMeasurements[0] || null,
      rawDataList: callbackRawMeasurements,
      executionLog: task.resultPayload?.gatewayResult || null,
      holeParameterUpdate: task.resultPayload?.holeParameterUpdate || null,
      monitorStatusSnapshot: task.resultPayload?.monitorStatusSnapshot || null,
      deviceMileageStats: task.resultPayload?.deviceMileageStats || null,
      taskLogs: Array.isArray(task.resultPayload?.taskLogs) ? task.resultPayload.taskLogs : [],
      errorMessage: task.errorMessage || null
    };

    // 修复说明：回调鉴权头优先使用客户列表里单独配置的 callback_key，未配置时再回退到管理端全局默认值。
    const callbackSecret = this.nullIfEmpty(task.customerCallbackKey) || this.config.callbackAuth.secret;
    const response = await this.requestJson(callbackUrl, {
      method: 'POST',
      body: payload,
      headers: {
        [this.config.callbackAuth.headerName]: callbackSecret,
        'x-admin-service-name': this.config.callbackAuth.serviceName
      }
    });

    await this.db.execute(
      `UPDATE admin_device_tasks
       SET callback_status = ?,
           callback_http_status = ?,
           callback_response_text = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE task_id = ?`,
      [
        response.ok ? 'success' : 'failed',
        response.status || null,
        (response.text || response.errorMessage || '').slice(0, 4000),
        taskId
      ]
    );
  }

  async requestJson(url, { method = 'GET', body, headers = {} } = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.tcpApi.timeoutMs);

    try {
      const response = await this.fetchImpl(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...headers
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });

      const text = await response.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch (error) {
        data = null;
      }

      return {
        ok: response.ok,
        status: response.status,
        data,
        text,
        errorMessage: data && data.error ? data.error : (!response.ok ? `HTTP ${response.status}` : null)
      };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        data: null,
        text: '',
        errorMessage: error.name === 'AbortError' ? '请求超时' : error.message
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  clearPoller(taskId) {
    const timer = this.activePollers.get(taskId);
    if (timer) {
      clearInterval(timer);
      this.activePollers.delete(taskId);
    }
  }

  stopAllPollers() {
    for (const timer of this.activePollers.values()) {
      clearInterval(timer);
    }
    this.activePollers.clear();
  }

  async getTaskInternal(taskId) {
    const hasCallbackKeyColumn = await this.hasCustomerCallbackKeyColumn();
    const rows = await this.db.query(
      `SELECT t.*, c.customer_code, c.customer_name, c.callback_url AS customer_callback_url
              , ${hasCallbackKeyColumn ? 'c.callback_key' : 'NULL'} AS customer_callback_key
       FROM admin_device_tasks t
       JOIN admin_customers c ON c.id = t.customer_id
       WHERE t.task_id = ?
       LIMIT 1`,
      [taskId]
    );
    return rows[0] ? this.toTask(rows[0]) : null;
  }

  toCustomer(row) {
    const upperDeviceIds = String(row.upper_device_ids || '')
      .split(',')
      .map(item => Number(item))
      .filter(item => Number.isInteger(item) && item > 0);
    const upperDeviceImeis = String(row.upper_device_imeis || '')
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);

    return {
      id: row.id,
      customerCode: row.customer_code,
      customerName: row.customer_name,
      contactPerson: row.contact_person,
      contactPhone: row.contact_phone,
      clientKey: row.client_key,
      callbackUrl: row.callback_url,
      callbackKey: row.callback_key,
      status: row.status,
      upperDeviceIds,
      upperDeviceImeis,
      upperDeviceCount: upperDeviceIds.length,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  toTask(row) {
    return {
      id: row.id,
      taskId: row.task_id,
      customerId: row.customer_id,
      customerCode: row.customer_code,
      customerName: row.customer_name,
      imei: row.imei,
      commandText: row.command_text,
      commandFormat: row.command_format,
      callbackUrl: row.callback_url,
      customerCallbackUrl: row.customer_callback_url,
      customerCallbackKey: row.customer_callback_key,
      pollIntervalMs: row.poll_interval_ms,
      timeoutSeconds: row.timeout_seconds,
      scheduledTaskId: row.scheduled_task_id,
      rawMeasurementId: row.raw_measurement_id,
      status: row.status,
      callbackStatus: row.callback_status,
      callbackHttpStatus: row.callback_http_status,
      callbackResponseText: row.callback_response_text,
      requestPayload: this.safeParseJson(row.request_payload),
      metadata: this.safeParseJson(row.metadata_json),
      sendResponse: this.safeParseJson(row.send_response_json),
      resultPayload: this.safeParseJson(row.result_payload),
      errorMessage: row.error_message,
      sentAt: row.sent_at,
      deadlineAt: row.deadline_at,
      completedAt: row.completed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
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
      return value;
    }
  }

  normalizePollInterval(value) {
    const fallback = this.config.tasks.defaultPollIntervalMs;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return Math.min(Math.max(parsed, 500), this.config.tasks.maxPollIntervalMs);
  }

  normalizeTimeoutSeconds(value) {
    const fallback = this.config.tasks.defaultTimeoutSeconds;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return Math.min(Math.max(parsed, 5), this.config.tasks.maxTimeoutSeconds);
  }

  nullIfEmpty(value) {
    if (value === undefined || value === null) {
      return null;
    }
    const text = String(value).trim();
    return text ? text : null;
  }

  formatDateOnly(value) {
    const text = this.nullIfEmpty(value);
    if (!text) {
      return null;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      return text;
    }

    const date = new Date(text);
    if (Number.isNaN(date.getTime())) {
      const dateMatch = text.match(/^(\d{4}-\d{2}-\d{2})/);
      return dateMatch ? dateMatch[1] : null;
    }

    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(date);
  }

  isTerminal(status) {
    return ['completed', 'failed', 'skipped', 'timeout'].includes(status);
  }

  isRunning(status) {
    return ['created', 'queued', 'polling'].includes(String(status || ''));
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

  async assertCustomerOwnsUpperDevice(customerId, imei) {
    const rows = await this.db.query(
      `SELECT ud.id
       FROM admin_customer_upper_devices acu
       JOIN upper_devices ud ON ud.id = acu.upper_device_id
       WHERE acu.customer_id = ? AND ud.imei = ?
       LIMIT 1`,
      [customerId, imei]
    );

    if (!rows[0]) {
      throw new Error('该上位机未绑定到当前客户，禁止发起监测任务');
    }
  }

  normalizeOptionalInteger(value) {
    if (value === undefined || value === null || value === '') {
      return null;
    }

    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return null;
    }

    return parsed;
  }

  normalizeHoleNumber(value) {
    const text = this.nullIfEmpty(value);
    return text || null;
  }

  normalizeProjectStatus(value) {
    const normalized = this.nullIfEmpty(value);
    if (['planning', 'ongoing', 'paused', 'completed'].includes(normalized)) {
      return normalized;
    }
    return 'planning';
  }

  normalizeHoleType(value) {
    const normalized = this.nullIfEmpty(value);
    if (['retaining_structure', 'soil_body'].includes(normalized)) {
      return normalized;
    }
    return 'retaining_structure';
  }

  normalizeHoleDepth(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null;
    }
    return parsed;
  }

  normalizeMeasurementInterval(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 0.5;
    }
    return parsed;
  }

  // 修复说明：初始测量距离允许为 0（从孔口开始测量）；未填写或非法时返回 null，
  // 由调用方决定回落到测孔原值还是 0.05m 默认值，避免把“未提供”当成“0”处理。
  normalizeInitialMeasurementDistance(value) {
    if (value === undefined || value === null || value === '') {
      return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }

  buildGeneratedProjectCode(customerId, projectPayload) {
    const explicitCode = this.nullIfEmpty(projectPayload.project_code);
    if (explicitCode) {
      return explicitCode.slice(0, 50);
    }

    const hashSource = [
      customerId,
      projectPayload.source_project_id || '',
      projectPayload.project_name || ''
    ].join(':');
    // 修复说明：当客户端历史项目缺少 project_code 时，管理端需要生成一个稳定且可重复命中的编码，避免重复补建项目。
    return `AUTO_${crypto.createHash('md5').update(hashSource).digest('hex').slice(0, 12).toUpperCase()}`;
  }

  normalizeTaskProjectPayload(payload, metadata = {}) {
    const project = payload && typeof payload === 'object' ? payload : {};
    const rawStatus = this.nullIfEmpty(project.status);
    return {
      source_project_id: this.normalizeOptionalInteger(project.projectId || project.id || metadata.projectId || metadata.sourceProjectId),
      project_code: this.nullIfEmpty(project.projectCode || project.project_code || metadata.projectCode),
      project_name: this.nullIfEmpty(project.projectName || project.project_name || metadata.projectName),
      location: this.nullIfEmpty(project.location),
      client_name: this.nullIfEmpty(project.clientName || project.client_name),
      contractor: this.nullIfEmpty(project.contractor),
      supervisor: this.nullIfEmpty(project.supervisor),
      start_date: this.nullIfEmpty(project.startDate || project.start_date),
      end_date: this.nullIfEmpty(project.endDate || project.end_date),
      status: rawStatus ? this.normalizeProjectStatus(rawStatus) : null
    };
  }

  normalizeTaskHolePayload(payload, metadata = {}) {
    const hole = payload && typeof payload === 'object' ? payload : {};
    const rawHoleType = this.nullIfEmpty(hole.holeType || hole.hole_type || metadata.holeType);
    const rawMeasurementInterval = this.nullIfEmpty(hole.measurementInterval || hole.measurement_interval);
    return {
      source_hole_id: this.normalizeOptionalInteger(hole.holeId || hole.id || metadata.holeId || metadata.sourceHoleId),
      source_upper_device_id: this.normalizeOptionalInteger(hole.upperDeviceId || hole.upper_device_id || metadata.upperDeviceId),
      hole_number: this.normalizeHoleNumber(hole.holeNumber || hole.hole_number || metadata.holeNumber || metadata.holeNo),
      hole_name: this.nullIfEmpty(hole.holeName || hole.hole_name || metadata.holeName),
      hole_type: rawHoleType ? this.normalizeHoleType(rawHoleType) : null,
      location_description: this.nullIfEmpty(hole.locationDescription || hole.location_description),
      depth: this.normalizeHoleDepth(hole.depth),
      measurement_interval: rawMeasurementInterval ? this.normalizeMeasurementInterval(rawMeasurementInterval) : null,
      // 修复说明：开始监测前要用测孔的初始测量距离反算设备监测节点数，这里从任务载荷中透传。
      initial_measurement_distance: this.normalizeInitialMeasurementDistance(
        hole.initialMeasurementDistance ?? hole.initial_measurement_distance ?? metadata.initialMeasurementDistance
      )
    };
  }

  async ensureProjectRecord(customer, projectPayload) {
    if (!projectPayload.project_code && !projectPayload.project_name) {
      throw new Error('监测请求缺少工程参数，管理端已拒绝创建任务');
    }

    const projectCode = this.buildGeneratedProjectCode(customer.id, projectPayload);
    let rows = [];
    if (projectPayload.project_code) {
      rows = await this.db.query(
        `SELECT id, project_code, project_name, location, client_name, contractor, supervisor, start_date, end_date, status
         FROM projects
         WHERE project_code = ?
         LIMIT 1`,
        [projectPayload.project_code]
      );
    }
    if (!rows[0] && projectPayload.project_name) {
      rows = await this.db.query(
        `SELECT id, project_code, project_name, location, client_name, contractor, supervisor, start_date, end_date, status
         FROM projects
         WHERE project_name = ?
         LIMIT 1`,
        [projectPayload.project_name]
      );
    }

    if (!rows[0]) {
      const insertResult = await this.db.execute(
        `INSERT INTO projects (
           project_code, project_name, location, client_name, contractor, supervisor,
           start_date, end_date, status, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          projectCode,
          projectPayload.project_name || projectCode,
          projectPayload.location,
          projectPayload.client_name,
          projectPayload.contractor,
          projectPayload.supervisor,
          projectPayload.start_date,
          projectPayload.end_date,
          projectPayload.status || 'planning'
        ]
      );
      rows = await this.db.query(
        `SELECT id, project_code, project_name, location, client_name, contractor, supervisor, start_date, end_date, status
         FROM projects
         WHERE id = ?
         LIMIT 1`,
        [insertResult.insertId]
      );
    } else {
      const current = rows[0];
      await this.db.execute(
        `UPDATE projects
         SET project_name = ?, location = ?, client_name = ?, contractor = ?, supervisor = ?,
             start_date = ?, end_date = ?, status = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          projectPayload.project_name || current.project_name,
          projectPayload.location || current.location,
          projectPayload.client_name || current.client_name,
          projectPayload.contractor || current.contractor,
          projectPayload.supervisor || current.supervisor,
          projectPayload.start_date || current.start_date,
          projectPayload.end_date || current.end_date,
          projectPayload.status || current.status || 'planning',
          current.id
        ]
      );
      rows = await this.db.query(
        `SELECT id, project_code, project_name, location, client_name, contractor, supervisor, start_date, end_date, status
         FROM projects
         WHERE id = ?
         LIMIT 1`,
        [current.id]
      );
    }

    return rows[0];
  }

  async ensureMonitoringHoleRecord(projectId, holePayload, upperDeviceId = null) {
    if (!holePayload.hole_number) {
      throw new Error('监测请求缺少钻孔参数，管理端已拒绝创建任务');
    }

    let rows = await this.db.query(
      `SELECT id, project_id, hole_number, hole_name, hole_type, location_description, depth, measurement_interval, initial_measurement_distance, lower_device_id, upper_device_id, status
       FROM monitoring_holes
       WHERE project_id = ? AND hole_number = ?
       LIMIT 1`,
      [projectId, holePayload.hole_number]
    );

    if (!rows[0]) {
      if (holePayload.depth === null) {
        throw new Error('监测请求缺少钻孔深度参数，管理端无法补建钻孔档案');
      }

      const insertResult = await this.db.execute(
        `INSERT INTO monitoring_holes (
           hole_number, project_id, hole_name, hole_type, location_description, coordinates,
           depth, measurement_interval, initial_measurement_distance, calculation_reference, warning_standard, collection_method,
            lower_device_id, upper_device_id, timer_enabled, timer_type, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, 'bottom', NULL, 'manual', NULL, ?, FALSE, 'interval', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          holePayload.hole_number,
          projectId,
          holePayload.hole_name,
          holePayload.hole_type || 'retaining_structure',
          holePayload.location_description,
          holePayload.depth,
          holePayload.measurement_interval || 0.5,
          holePayload.initial_measurement_distance ?? 0.05,
          upperDeviceId
        ]
      );
      rows = await this.db.query(
        `SELECT id, project_id, hole_number, hole_name, hole_type, location_description, depth, measurement_interval, initial_measurement_distance, lower_device_id, upper_device_id, status
         FROM monitoring_holes
         WHERE id = ?
         LIMIT 1`,
        [insertResult.insertId]
      );
    } else {
      const current = rows[0];
      await this.db.execute(
        `UPDATE monitoring_holes
         SET hole_name = ?, hole_type = ?, location_description = ?, depth = ?, measurement_interval = ?,
             initial_measurement_distance = ?, upper_device_id = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          holePayload.hole_name || current.hole_name,
          holePayload.hole_type || current.hole_type,
          holePayload.location_description || current.location_description,
          holePayload.depth === null ? current.depth : holePayload.depth,
          holePayload.measurement_interval || current.measurement_interval || 0.5,
          // 修复说明：初始测量距离允许为 0，因此用 ?? 判断“未提供”，不能用 || 以免把 0 当成未填写。
          holePayload.initial_measurement_distance ?? current.initial_measurement_distance ?? 0.05,
          upperDeviceId || current.upper_device_id || null,
          current.id
        ]
      );
      rows = await this.db.query(
        `SELECT id, project_id, hole_number, hole_name, hole_type, location_description, depth, measurement_interval, initial_measurement_distance, lower_device_id, upper_device_id, status
         FROM monitoring_holes
         WHERE id = ?
         LIMIT 1`,
        [current.id]
      );
    }

    return rows[0];
  }

  async loadTaskContextByAdminIds(imei, holeId, upperDeviceId = null) {
    const rows = await this.db.query(
      `SELECT ud.id AS upper_device_id,
              ud.imei,
              p.id AS project_id,
              p.project_code,
              p.project_name,
              ld.id AS lower_device_id,
              ld.device_code AS lower_device_code,
              ld.device_name AS lower_device_name,
               mh.id AS hole_id,
               mh.hole_number,
               mh.hole_name,
               mh.hole_type,
               mh.depth AS hole_depth,
               d.id AS legacy_device_id
       FROM upper_devices ud
       JOIN monitoring_holes mh ON mh.id = ?
       JOIN projects p ON p.id = mh.project_id
       LEFT JOIN lower_devices ld ON ld.id = mh.lower_device_id
       LEFT JOIN devices d ON d.device_id = ld.device_code
       WHERE ud.imei = ?
         AND (? IS NULL OR ud.id = ?)
       LIMIT 1`,
      [holeId, imei, upperDeviceId, upperDeviceId]
    );

    return rows[0] || null;
  }

  async getUpperDeviceByImei(imei) {
    const rows = await this.db.query(
      `SELECT id, imei
       FROM upper_devices
       WHERE imei = ?
       LIMIT 1`,
      [imei]
    );
    return rows[0] || null;
  }

  getTaskDefinition(taskType) {
    const normalized = String(taskType || 'monitor_start').trim();
    const definition = TASK_DEFINITIONS[normalized];
    if (!definition) {
      throw new Error(`Unsupported taskType: ${normalized}`);
    }
    return definition;
  }

  getTaskDefinitionForTask(task) {
    const metadataTaskType = task.metadata?.taskType;
    const commandTaskType = TASK_TYPE_BY_COMMAND[String(task.commandText || '').trim()];
    return this.getTaskDefinition(metadataTaskType || commandTaskType || 'monitor_start');
  }

  normalizeSetParams(params) {
    if (!params || typeof params !== 'object' || Array.isArray(params)) {
      throw new Error('params 必须是非空对象');
    }

    const entries = Object.entries(params);
    if (!entries.length) {
      throw new Error('params 至少包含一个参数');
    }

    const normalized = {};
    for (const [name, rawValue] of entries) {
      const paramType = SET_PARAM_TYPES[name];
      if (!paramType) {
        throw new Error(`不支持的参数: ${name}`);
      }

      const value = Number(rawValue);
      if (paramType === 'uint16') {
        if (!Number.isInteger(value) || value < 0 || value > 65535) {
          throw new Error(`${name} 必须是 0 到 65535 的整数`);
        }
      } else if (!Number.isFinite(value)) {
        throw new Error(`${name} 必须是数字`);
      }
      normalized[name] = value;
    }

    return normalized;
  }

  async getCustomerByUpperDeviceId(upperDeviceId) {
    const rows = await this.db.query(
      `SELECT c.id
       FROM admin_customer_upper_devices acu
       JOIN admin_customers c ON c.id = acu.customer_id
       WHERE acu.upper_device_id = ?
         AND c.status = 'active'
       LIMIT 1`,
      [upperDeviceId]
    );

    return rows[0] ? this.getCustomerById(rows[0].id) : null;
  }

  async resolveTaskContext(customer, imei, payload, metadata = {}) {
    const projectPayload = this.normalizeTaskProjectPayload(payload.project, metadata);
    const holePayload = this.normalizeTaskHolePayload(payload.hole, metadata);
    const upperDevice = await this.getUpperDeviceByImei(imei);
    if (!upperDevice) {
      throw new Error('Admin upper device not found for IMEI');
    }

    const projectRecord = await this.ensureProjectRecord(customer, projectPayload);
    const holeRecord = await this.ensureMonitoringHoleRecord(projectRecord.id, holePayload, upperDevice.id);
    const context = await this.loadTaskContextByAdminIds(imei, holeRecord.id, upperDevice.id);

    if (!context) {
      throw new Error('管理端未找到该 IMEI 对应的上位机');
    }

    context.source_project_id = projectPayload.source_project_id;
    context.source_hole_id = holePayload.source_hole_id;
    context.source_upper_device_id = holePayload.source_upper_device_id;
    return context;
  }

  async resolveTaskContextFromTask(task) {
    const adminHoleId = this.normalizeOptionalInteger(task.metadata?.adminHoleId);
    const adminUpperDeviceId = this.normalizeOptionalInteger(task.metadata?.adminUpperDeviceId);
    if (!adminHoleId) {
      throw new Error('任务缺少管理端钻孔上下文，无法继续执行');
    }

    const context = await this.loadTaskContextByAdminIds(task.imei, adminHoleId, adminUpperDeviceId);
    if (!context) {
      throw new Error('管理端钻孔或上位机档案不存在，无法继续执行任务');
    }

    context.source_project_id = this.normalizeOptionalInteger(task.metadata?.sourceProjectId || task.metadata?.projectId);
    context.source_hole_id = this.normalizeOptionalInteger(task.metadata?.sourceHoleId || task.metadata?.holeId);
    context.source_upper_device_id = this.normalizeOptionalInteger(task.metadata?.upperDeviceId);
    return context;
  }

  async createGatewayMonitorTask(task, context) {
    const response = await this.requestJson(
      `${this.config.tcpApi.baseUrl}/monitor/start`,
      {
        method: 'POST',
        body: {
          imei: task.imei,
          // 修复说明：根据最新联调约定，通讯服务 /monitor/start 的 holeNo 固定传 1，不再使用业务钻孔编号。
          holeNo: 1
        }
      }
    );

    if (!response.ok || !response.data || response.data.success !== true) {
      throw new Error(
        (response.data && response.data.error) ||
        response.errorMessage ||
        '调用通讯服务 /monitor/start 失败'
      );
    }

    const gatewayTaskId = Number(response.data.data && response.data.data.taskId);
    if (!Number.isFinite(gatewayTaskId) || gatewayTaskId <= 0) {
      throw new Error('通讯服务未返回有效 taskId');
    }

    return gatewayTaskId;
  }

  async handleMonitorParamsSetCompletion(task, gatewayResult) {
    // 修复说明：设备参数已按测孔档案下发，深度天然一致，这里不再做“深度不一致则拒绝启动”的校验，
    // 只把下发的设备参数与反算深度写入任务日志，便于追溯实际生效的配置。
    const conversion = task.sendResponse?.monitorParams || null;
    const paramsSetLog = {
      type: 'monitor_params_set',
      level: 'info',
      message: conversion
        ? `已按测孔参数下发设备配置：监测节点数=${conversion.monitorNodesNum}，测量间隔=${conversion.testDistanceMm}mm，初始测量距离=${conversion.fromStartDistanceMm}mm，对应孔深 ${conversion.deviceDepthM}m`
        : '设备参数设置任务已完成',
      fields: conversion ? [
        { field: 'monitorNodesNum', label: '设备监测节点数', value: conversion.monitorNodesNum },
        { field: 'monitorTestDis', label: '设备测量间隔(mm)', value: conversion.testDistanceMm },
        { field: 'monitorFromStartDis', label: '设备初始测量距离(mm)', value: conversion.fromStartDistanceMm },
        {
          field: 'device_depth',
          label: '设备参数对应孔深(m)',
          value: conversion.deviceDepthM,
          formula: '(fMonitorTestDis * (wMonitorNodesNum - 1) + fMonitorFromStartDis) / 1000'
        }
      ] : [],
      createdAt: new Date().toISOString()
    };

    const existingLogs = Array.isArray(task.resultPayload?.taskLogs)
      ? task.resultPayload.taskLogs
      : [];
    const taskLogs = [...existingLogs, paramsSetLog];
    const basePayload = {
      ...(task.resultPayload || {}),
      paramsSetResult: gatewayResult,
      taskLogs,
      polledAt: new Date().toISOString()
    };

    let monitorTaskId;
    try {
      monitorTaskId = await this.createGatewayMonitorTask(task, {});
    } catch (error) {
      const dispatchError = {
        ...basePayload,
        taskLogs: [
          ...taskLogs,
          {
            type: 'monitor_start_dispatch',
            level: 'error',
            message: error.message,
            fields: [],
            createdAt: new Date().toISOString()
          }
        ]
      };
      await this.db.execute(
        `UPDATE admin_device_tasks
         SET status = 'failed',
             result_payload = ?,
             completed_at = CURRENT_TIMESTAMP,
             error_message = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE task_id = ?`,
        [JSON.stringify(dispatchError), error.message, task.taskId]
      );
      this.clearPoller(task.taskId);
      await this.deliverCallback(task.taskId);
      return;
    }

    const sendResponse = {
      ...(task.sendResponse || {}),
      paramsSetTaskId: task.scheduledTaskId,
      gatewayTaskId: monitorTaskId,
      taskType: 'monitor_start',
      phase: 'monitor_start',
      gatewayPath: '/monitor/start',
      requestedAt: new Date().toISOString()
    };
    await this.db.execute(
      `UPDATE admin_device_tasks
       SET status = 'queued',
           scheduled_task_id = ?,
           send_response_json = ?,
           result_payload = ?,
           error_message = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE task_id = ?`,
      [monitorTaskId, JSON.stringify(sendResponse), JSON.stringify(basePayload), task.taskId]
    );
    this.schedulePoller(task.taskId, task.pollIntervalMs);
  }

  // 修复说明：按测孔档案反算设备监测参数。
  // 公式：孔深 = fMonitorTestDis * (wMonitorNodesNum - 1) + fMonitorFromStartDis
  // 反算：wMonitorNodesNum = round((孔深 - 初始测量距离) / 测量间隔) + 1
  // 单位换算：客户端/管理端为米，设备网关为毫米。
  buildMonitorDeviceParams(hole) {
    const toMillimeters = (meters) => Number((Number(meters) * 1000).toFixed(3));
    const holeLabel = hole.hole_number || hole.id;

    const depth = Number(hole.depth);
    if (!Number.isFinite(depth) || depth <= 0) {
      throw new Error(`测孔 ${holeLabel} 未配置有效孔深，无法反算设备监测节点数`);
    }

    const measurementInterval = Number(hole.measurement_interval);
    if (!Number.isFinite(measurementInterval) || measurementInterval <= 0) {
      throw new Error(`测孔 ${holeLabel} 未配置有效测量间隔，无法反算设备监测节点数`);
    }

    const initialDistance = Number(hole.initial_measurement_distance ?? 0.05);
    if (!Number.isFinite(initialDistance) || initialDistance < 0) {
      throw new Error(`测孔 ${holeLabel} 未配置有效初始测量距离，无法反算设备监测节点数`);
    }

    const depthMm = toMillimeters(depth);
    const testDistanceMm = toMillimeters(measurementInterval);
    const fromStartDistanceMm = toMillimeters(initialDistance);

    if (depthMm <= fromStartDistanceMm) {
      throw new Error(`测孔 ${holeLabel} 的孔深必须大于初始测量距离，无法反算设备监测节点数`);
    }

    // 设备侧 wMonitorNodesNum 为 UINT16，因此反算结果需要取整；
    // 取整后设备实际覆盖深度与孔深可能存在毫米级偏差，这里一并回传用于任务日志。
    const monitorNodesNum = Math.round((depthMm - fromStartDistanceMm) / testDistanceMm) + 1;
    if (monitorNodesNum < 1 || monitorNodesNum > 65535) {
      throw new Error(`测孔 ${holeLabel} 反算得到的监测节点数 ${monitorNodesNum} 超出设备允许范围(1-65535)`);
    }

    const deviceDepthMm = testDistanceMm * (monitorNodesNum - 1) + fromStartDistanceMm;

    return {
      params: {
        monitorNodesNum,
        monitorTestDis: testDistanceMm,
        monitorFromStartDis: fromStartDistanceMm
      },
      monitorNodesNum,
      testDistanceMm,
      fromStartDistanceMm,
      holeDepthM: Number(depth.toFixed(3)),
      deviceDepthM: Number((deviceDepthMm / 1000).toFixed(3))
    };
  }

  // 修复说明：读取开始监测所需的测孔上下文（孔深、测量间隔、初始测量距离）。
  async loadMonitorStartHole(task) {
    const holeId = this.normalizeOptionalInteger(task.metadata?.adminHoleId);
    if (!holeId) {
      throw new Error('任务缺少管理端测孔上下文，无法反算设备监测参数');
    }

    const rows = await this.db.query(
      `SELECT id, hole_number, hole_name, depth, measurement_interval, initial_measurement_distance
       FROM monitoring_holes
       WHERE id = ?
       LIMIT 1`,
      [holeId]
    );
    const hole = rows[0];
    if (!hole) {
      throw new Error(`未查询到管理端测孔 ${holeId}`);
    }
    return hole;
  }

  // 修复说明：开始监测前先调用 /monitor/set-params，把按测孔反算出的监测节点数、
  // 测量间隔、初始测量距离写入设备，保证设备参数与测孔档案一致后再启动监测。
  async createGatewayMonitorParamsSetTask(task) {
    const hole = await this.loadMonitorStartHole(task);
    const conversion = this.buildMonitorDeviceParams(hole);

    const response = await this.requestJson(
      `${this.config.tcpApi.baseUrl}/monitor/set-params`,
      {
        method: 'POST',
        body: { imei: task.imei, params: conversion.params }
      }
    );

    if (!response.ok || !response.data || response.data.success !== true) {
      throw new Error(
        (response.data && response.data.error) ||
        response.errorMessage ||
        '调用通讯服务 /monitor/set-params 失败'
      );
    }

    const gatewayTaskId = Number(response.data.data && response.data.data.taskId);
    if (!Number.isFinite(gatewayTaskId) || gatewayTaskId <= 0) {
      throw new Error('通讯服务未返回有效 taskId');
    }

    return { gatewayTaskId, conversion };
  }

  // 修复说明：dg_device_params.params_json.part3 使用带类型前缀的寄存器键名（f=FLOAT32、w=UINT16），
  // 与 /monitor/set-params 接口书写的参数名不同。这里为每个可写参数登记候选键名，
  // 读取时按顺序命中第一个存在的键，避免不同固件版本键名不一致导致读取失败。
  // （候选键名定义在模块级 DEVICE_PARAM_ALIASES）

  // 修复说明：从网关库读取指定 IMEI 的参数快照，并把寄存器键名归一化为 set-params 接口使用的参数名。
  async readDeviceParamSnapshot(imei) {
    if (!this.gatewayDb) {
      throw new Error('网关数据库未配置，无法查询 dg_device_params');
    }

    const rows = await this.gatewayDb.query(
      `SELECT imei, unit_id, param_version_hex, params_json, collected_at, updated_at
       FROM dg_device_params
       WHERE imei = ?
       LIMIT 1`,
      [imei]
    );
    const row = rows[0];
    if (!row) {
      throw new Error(`未查询到 IMEI ${imei} 的 dg_device_params 参数快照`);
    }

    const lookup = this.flattenDeviceParams(row.params_json);

    const params = {};
    for (const [paramName, registerKey] of Object.entries(DEVICE_PARAM_ALIASES)) {
      const rawValue = lookup[registerKey];
      if (rawValue === undefined || rawValue === null || rawValue === '') {
        continue;
      }
      const value = Number(rawValue);
      if (Number.isFinite(value)) {
        params[paramName] = value;
      }
    }

    return {
      imei: row.imei,
      unitId: row.unit_id,
      paramVersionHex: row.param_version_hex,
      collectedAt: row.collected_at,
      params,
      rawParams: lookup,
      sourceTable: 'dg_device_params'
    };
  }

  // 修复说明：把 params_json 各寄存器区段拍平成单层键值表。
  // 待写入参数分散在 part2（速度）与 part3（监测），只取单段会漏读，因此这里合并所有区段；
  // 同时兼容没有分区结构的旧快照（键名直接位于顶层）。
  flattenDeviceParams(paramsJson) {
    const parsed = this.parseGatewayJson(paramsJson);
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }

    const lookup = {};
    for (const sectionName of DEVICE_PARAM_SECTIONS) {
      const section = parsed[sectionName];
      if (section && typeof section === 'object' && !Array.isArray(section)) {
        Object.assign(lookup, section);
      }
    }

    for (const [key, value] of Object.entries(parsed)) {
      if (DEVICE_PARAM_SECTIONS.includes(key) || key === 'raw') {
        continue;
      }
      if (value !== null && typeof value === 'object') {
        continue;
      }
      if (!(key in lookup)) {
        lookup[key] = value;
      }
    }

    return lookup;
  }

  // 修复说明：params_fetch 任务完成后的收尾逻辑，把设备参数快照写入任务结果，
  // 管理端即可通过任务详情直接拿到读取结果，无需再单独查询网关库。
  async handleParamsFetchCompletion(task, gatewayResult) {
    let deviceParams = null;
    let completionError = null;

    try {
      deviceParams = await this.readDeviceParamSnapshot(task.imei);
    } catch (error) {
      completionError = error.message;
    }

    const paramCount = deviceParams ? Object.keys(deviceParams.params).length : 0;
    const taskLogs = [{
      type: 'params_fetch',
      level: completionError ? 'error' : 'info',
      message: completionError
        ? `设备参数读取完成，但解析参数快照失败：${completionError}`
        : `设备参数读取完成，共解析 ${paramCount} 个参数`,
      fields: [],
      createdAt: new Date().toISOString()
    }];

    const resultPayload = {
      gatewayResult,
      ...(deviceParams ? { deviceParams } : {}),
      taskLogs,
      polledAt: new Date().toISOString()
    };

    await this.db.execute(
      `UPDATE admin_device_tasks
       SET status = 'completed',
           result_payload = ?,
           completed_at = CURRENT_TIMESTAMP,
           error_message = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE task_id = ?`,
      [JSON.stringify(resultPayload), completionError, task.taskId]
    );
    this.clearPoller(task.taskId);
    await this.deliverCallback(task.taskId);
  }

  async createGatewayCommandTask(task, taskDefinition) {
    const body = { imei: task.imei };
    if (taskDefinition.taskType === 'set_params') {
      body.params = this.normalizeSetParams(task.requestPayload?.params);
    }

    const response = await this.requestJson(
      `${this.config.tcpApi.baseUrl}${taskDefinition.gatewayPath}`,
      {
        method: 'POST',
        body
      }
    );

    if (!response.ok || !response.data || response.data.success !== true) {
      throw new Error(
        (response.data && response.data.error) ||
        response.errorMessage ||
        `调用通讯服务 ${taskDefinition.gatewayPath} 失败`
      );
    }

    const gatewayTaskId = Number(response.data.data && response.data.data.taskId);
    if (!Number.isFinite(gatewayTaskId) || gatewayTaskId <= 0) {
      throw new Error('通讯服务未返回有效 taskId');
    }

    return gatewayTaskId;
  }

  async executeSynchronousTask(task, taskDefinition) {
    const response = await this.requestJson(
      `${this.config.tcpApi.baseUrl}${taskDefinition.gatewayPath}?imei=${encodeURIComponent(task.imei)}`,
      { method: 'GET' }
    );

    if (!response.ok || !response.data || response.data.success !== true) {
      throw new Error(
        (response.data && (response.data.error || response.data.message)) ||
        response.errorMessage ||
        `调用通讯服务 ${taskDefinition.gatewayPath} 失败`
      );
    }

    let monitorStatusSnapshot;
    try {
      monitorStatusSnapshot = await this.getStatusCheckMonitorStatus(task);
    } catch (error) {
      monitorStatusSnapshot = {
        status: 'failed',
        sourceTable: 'dg_monitor_status',
        sourceField: 'status_json.monitor.batteryVoltPC0/status_json.sensor.batteryVoltPA0/status_json.sensor.batteryVoltPA1',
        imei: task.imei,
        message: `状态检查已完成，但读取电池状态失败：${error.message}`,
        updatedAt: new Date().toISOString()
      };
    }

    const taskLogs = [{
      type: 'battery_status_snapshot',
      level: monitorStatusSnapshot.status === 'success' ? 'info' : 'error',
      message: monitorStatusSnapshot.message,
      fields: monitorStatusSnapshot.fields || [],
      createdAt: monitorStatusSnapshot.updatedAt
    }];
    const resultPayload = {
      gatewayResult: response.data,
      monitorStatusSnapshot,
      taskLogs,
      polledAt: new Date().toISOString()
    };
    const sendResponse = {
      taskType: taskDefinition.taskType,
      gatewayPath: taskDefinition.gatewayPath,
      method: 'GET',
      requestedAt: new Date().toISOString()
    };
    const completionError = monitorStatusSnapshot.status === 'failed'
      ? monitorStatusSnapshot.message
      : null;

    await this.db.execute(
      `UPDATE admin_device_tasks
       SET status = 'completed',
           send_response_json = ?,
           result_payload = ?,
           sent_at = COALESCE(sent_at, CURRENT_TIMESTAMP),
           completed_at = CURRENT_TIMESTAMP,
           error_message = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE task_id = ?`,
      [JSON.stringify(sendResponse), JSON.stringify(resultPayload), completionError, task.taskId]
    );
    this.clearPoller(task.taskId);
    await this.deliverCallback(task.taskId);
  }

  normalizeGatewayTaskStatus(status) {
    const normalized = String(status || '').trim().toUpperCase();
    if (['SUCCESS', 'COMPLETED'].includes(normalized)) {
      return 'completed';
    }
    if (['TIMEOUT'].includes(normalized)) {
      return 'timeout';
    }
    if (['FAILED', 'FAIL', 'ERROR', 'CANCELLED', 'CANCELED'].includes(normalized)) {
      return 'failed';
    }
    return 'polling';
  }

  async getGatewayTaskResult(gatewayTaskId, imei) {
    if (!this.gatewayDb) {
      throw new Error('网关数据库未配置，无法轮询 dg_result');
    }

    const rows = await this.gatewayDb.query(
      `SELECT imei, task_id, cmd, status, err_message, started_at, finished_at, updated_at
       FROM dg_result
       WHERE task_id = ?
       LIMIT 1`,
      [gatewayTaskId]
    );

    if (rows[0]) {
      return rows[0];
    }

    const fallbackRows = await this.gatewayDb.query(
      `SELECT imei, task_id, cmd, status, err_message, started_at, finished_at, updated_at
       FROM dg_result
       WHERE imei = ?
       LIMIT 1`,
      [imei]
    );

    return fallbackRows[0] || null;
  }

  async getGatewayResultPoint(gatewayTaskId, imei) {
    if (!this.gatewayDb) {
      throw new Error('网关数据库未配置，无法查询 dg_result_point');
    }

    const rows = await this.gatewayDb.query(
      `SELECT imei, task_id, hole_no, node_num, result_a0_json, result_a180_json,
              id_1_hex, id_2_hex, id_3_hex, updated_at
       FROM dg_result_point
       WHERE task_id = ?
       LIMIT 1`,
      [gatewayTaskId]
    );

    if (rows[0]) {
      return rows[0];
    }

    const fallbackRows = await this.gatewayDb.query(
      `SELECT imei, task_id, hole_no, node_num, result_a0_json, result_a180_json,
              id_1_hex, id_2_hex, id_3_hex, updated_at
       FROM dg_result_point
       WHERE imei = ?
       LIMIT 1`,
      [imei]
    );

    return fallbackRows[0] || null;
  }

  async getHomeMoveMonitorStatus(task) {
    if (!this.gatewayDb) {
      throw new Error('网关数据库未配置，无法查询 dg_monitor_status');
    }

    const rows = await this.gatewayDb.query(
      `SELECT imei, status_json, sampled_at, updated_at
       FROM dg_monitor_status
       WHERE imei = ?
       LIMIT 1`,
      [task.imei]
    );
    const statusRow = rows[0];
    if (!statusRow) {
      throw new Error(`未查询到 IMEI ${task.imei} 的 dg_monitor_status 状态快照`);
    }

    const statusJson = this.parseGatewayJson(statusRow.status_json);
    const rawAxisPosition = statusJson?.sys?.axisPosMM ?? statusJson?.axisPosMM;
    const axisPosition = Number(rawAxisPosition);
    if (rawAxisPosition === null || rawAxisPosition === undefined || rawAxisPosition === '' || !Number.isFinite(axisPosition)) {
      throw new Error('dg_monitor_status.status_json 缺少有效的 sys.axisPosMM');
    }

    const updatedAt = new Date().toISOString();
    return {
      status: 'success',
      sourceTable: 'dg_monitor_status',
      sourceField: 'status_json.sys.axisPosMM',
      imei: task.imei,
      axisPosMM: axisPosition,
      sampledAt: statusRow.sampled_at,
      sourceUpdatedAt: statusRow.updated_at,
      message: `当前设备实时监测轴位置为${axisPosition}(毫米)。`,
      updatedAt
    };
  }

  async getStatusCheckMonitorStatus(task) {
    if (!this.gatewayDb) {
      throw new Error('网关数据库未配置，无法查询 dg_monitor_status');
    }

    const rows = await this.gatewayDb.query(
      `SELECT imei, status_json, sampled_at, updated_at
       FROM dg_monitor_status
       WHERE imei = ?
       LIMIT 1`,
      [task.imei]
    );
    const statusRow = rows[0];
    if (!statusRow) {
      throw new Error(`未查询到 IMEI ${task.imei} 的 dg_monitor_status 状态快照`);
    }

    const statusJson = this.parseGatewayJson(statusRow.status_json) || {};
    const monitor = statusJson.monitor && typeof statusJson.monitor === 'object' ? statusJson.monitor : {};
    const sensor = statusJson.sensor && typeof statusJson.sensor === 'object' ? statusJson.sensor : {};
    const batteryVoltPC0 = monitor.batteryVoltPC0 ?? statusJson.batteryVoltPC0 ?? null;
    const batteryVoltPA0 = sensor.batteryVoltPA0 ?? statusJson.batteryVoltPA0 ?? null;
    const batteryVoltPA1 = sensor.batteryVoltPA1 ?? statusJson.batteryVoltPA1 ?? null;
    const formatBatteryValue = value => value === null || value === undefined || value === '' ? '-' : value;
    const updatedAt = new Date().toISOString();

    return {
      status: 'success',
      sourceTable: 'dg_monitor_status',
      sourceFields: [
        'status_json.monitor.batteryVoltPC0',
        'status_json.sensor.batteryVoltPA0',
        'status_json.sensor.batteryVoltPA1'
      ],
      imei: task.imei,
      batteryVoltPC0,
      batteryVoltPA0,
      batteryVoltPA1,
      sampledAt: statusRow.sampled_at,
      sourceUpdatedAt: statusRow.updated_at,
      message: `上部电池电压百分比：${formatBatteryValue(batteryVoltPC0)}%；下部备用电池电压百分比：${formatBatteryValue(batteryVoltPA0)}%；下部主电池电压百分比：${formatBatteryValue(batteryVoltPA1)}%。`,
      fields: [
        { field: 'batteryVoltPC0', label: '上部电池电压百分比', value: batteryVoltPC0 },
        { field: 'batteryVoltPA0', label: '下部备用电池电压百分比', value: batteryVoltPA0 },
        { field: 'batteryVoltPA1', label: '下部主电池电压百分比', value: batteryVoltPA1 }
      ],
      updatedAt
    };
  }

  async syncBottomTestHoleParameters(task) {
    if (!this.gatewayDb) {
      throw new Error('网关数据库未配置，无法查询 dg_device_params');
    }

    const parameterRows = await this.gatewayDb.query(
      `SELECT imei, params_json, collected_at, updated_at
       FROM dg_device_params
       WHERE imei = ?
       LIMIT 1`,
      [task.imei]
    );
    const parameterRow = parameterRows[0];
    if (!parameterRow) {
      throw new Error(`未查询到 IMEI ${task.imei} 的 dg_device_params 参数快照`);
    }

    const paramsJson = this.parseGatewayJson(parameterRow.params_json) || {};
    const parameterSection = paramsJson.part3 && typeof paramsJson.part3 === 'object'
      ? paramsJson.part3
      : paramsJson;
    const monitorTestDistance = Number(parameterSection.fMonitorTestDis ?? parameterSection.monitorTestDis);
    const monitorNodesNumber = Number(parameterSection.wMonitorNodesNum ?? parameterSection.monitorNodesNum);
    const monitorFromStartDistance = Number(parameterSection.fMonitorFromStartDis ?? parameterSection.monitorFromStartDis);

    if (!Number.isFinite(monitorTestDistance) || monitorTestDistance <= 0) {
      throw new Error('dg_device_params 缺少有效的 fMonitorTestDis');
    }
    if (!Number.isInteger(monitorNodesNumber) || monitorNodesNumber < 1) {
      throw new Error('dg_device_params 缺少有效的 wMonitorNodesNum');
    }
    if (!Number.isFinite(monitorFromStartDistance) || monitorFromStartDistance < 0) {
      throw new Error('dg_device_params 缺少有效的 fMonitorFromStartDis');
    }

    const measurementInterval = Number((monitorTestDistance / 1000).toFixed(6));
    const depth = Number((
      (monitorTestDistance * (monitorNodesNumber - 1) + monitorFromStartDistance) / 1000
    ).toFixed(6));
    // 修复说明：初始测量距离同样由设备参数 fMonitorFromStartDis 推导而来（单位：米），
    // 若不同步，下一次开始监测会把过期的初始测量距离重新下发给设备，覆盖底部检测结果。
    const initialMeasurementDistance = Number((monitorFromStartDistance / 1000).toFixed(3));
    const adminUpperDeviceId = this.normalizeOptionalInteger(task.metadata?.adminUpperDeviceId)
      || (await this.getUpperDeviceByImei(task.imei))?.id;
    if (!adminUpperDeviceId) {
      throw new Error(`管理端未找到 IMEI ${task.imei} 对应的上位机`);
    }

    const adminHoleId = this.normalizeOptionalInteger(task.metadata?.adminHoleId);
    const sourceHoleId = this.normalizeOptionalInteger(task.metadata?.sourceHoleId || task.metadata?.holeId);
    const holeNumber = this.normalizeHoleNumber(task.metadata?.holeNumber || task.metadata?.holeNo);
    const targetFilters = ['upper_device_id = ?'];
    const targetParams = [adminUpperDeviceId];
    if (adminHoleId) {
      targetFilters.push('id = ?');
      targetParams.push(adminHoleId);
    } else if (holeNumber) {
      targetFilters.push('hole_number = ?');
      targetParams.push(holeNumber);
    }

    const holeRows = await this.db.query(
      `SELECT id, hole_number, hole_name, depth, measurement_interval, initial_measurement_distance
       FROM monitoring_holes
       WHERE ${targetFilters.join(' AND ')}
       ORDER BY id ASC`,
      targetParams
    );
    if (!holeRows.length) {
      const targetDescription = holeNumber ? `测孔 ${holeNumber}` : `上位机 ${task.imei}`;
      throw new Error(`${targetDescription} 未关联管理端测孔`);
    }

    await this.db.execute(
      `UPDATE monitoring_holes
       SET measurement_interval = ?, depth = ?, initial_measurement_distance = ?, updated_at = CURRENT_TIMESTAMP
       WHERE ${targetFilters.join(' AND ')}`,
      [measurementInterval, depth, initialMeasurementDistance, ...targetParams]
    );

    const updatedAt = new Date().toISOString();
    const fields = [
      {
        field: 'measurement_interval',
        label: '测孔测量间隔(m)',
        value: measurementInterval,
        formula: 'fMonitorTestDis / 1000'
      },
      {
        field: 'depth',
        label: '测孔深度(m)',
        value: depth,
        formula: '(fMonitorTestDis * (wMonitorNodesNum - 1) + fMonitorFromStartDis) / 1000'
      },
      {
        field: 'initial_measurement_distance',
        label: '测孔初始测量距离(m)',
        value: initialMeasurementDistance,
        formula: 'fMonitorFromStartDis / 1000'
      }
    ];

    return {
      status: 'success',
      sourceTable: 'dg_device_params',
      imei: task.imei,
      sourceHoleId,
      holeNumber: holeNumber || null,
      collectedAt: parameterRow.collected_at,
      sourceParameters: {
        fMonitorTestDis: monitorTestDistance,
        wMonitorNodesNum: monitorNodesNumber,
        fMonitorFromStartDis: monitorFromStartDistance
      },
      fields,
      updatedHoles: holeRows.map(hole => ({
        adminHoleId: hole.id,
        holeNumber: hole.hole_number,
        holeName: hole.hole_name,
        previousValues: {
          measurement_interval: Number(hole.measurement_interval),
          depth: Number(hole.depth),
          initial_measurement_distance: hole.initial_measurement_distance === null || hole.initial_measurement_distance === undefined
            ? null
            : Number(hole.initial_measurement_distance)
        },
        updatedValues: {
          measurement_interval: measurementInterval,
          depth,
          initial_measurement_distance: initialMeasurementDistance
        }
      })),
      message: `已更新测孔参数：测孔测量间隔(m)=${measurementInterval}，测孔深度(m)=${depth}，测孔初始测量距离(m)=${initialMeasurementDistance}`,
      updatedAt
    };
  }

  parseGatewayJson(value) {
    if (value === null || value === undefined || value === '') {
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

  normalizeGatewayHexPart(value) {
    const text = this.nullIfEmpty(value);
    if (!text) {
      return null;
    }

    const normalized = String(text).trim().toUpperCase();
    // 修复说明：网关新字段必须保持原始十六进制语义，非十六进制字符或奇数字节长度都视为非法，避免生成不可逆编码。
    if (!/^[0-9A-F]+$/.test(normalized) || normalized.length % 2 !== 0) {
      return null;
    }
    return normalized;
  }

  buildGatewayLowerDeviceCode(id1Hex, id2Hex, id3Hex) {
    const parts = [
      this.normalizeGatewayHexPart(id1Hex),
      this.normalizeGatewayHexPart(id2Hex),
      this.normalizeGatewayHexPart(id3Hex)
    ];

    if (parts.some(part => !part)) {
      return null;
    }

    // 修复说明：device_code 使用固定前缀 + 三段 HEX 的拼接格式，既能直接落到现有字符串型下位机标识字段，也能无损反解析。
    return `${GATEWAY_LOWER_DEVICE_CODE_PREFIX}${parts.join('-')}`;
  }

  parseGatewayLowerDeviceCode(deviceCode) {
    const text = this.nullIfEmpty(deviceCode);
    if (!text || !String(text).startsWith(GATEWAY_LOWER_DEVICE_CODE_PREFIX)) {
      return null;
    }

    const parts = String(text)
      .slice(GATEWAY_LOWER_DEVICE_CODE_PREFIX.length)
      .split('-')
      .map(part => this.normalizeGatewayHexPart(part));

    if (parts.length !== 3 || parts.some(part => !part)) {
      return null;
    }

    return {
      id_1_hex: parts[0],
      id_2_hex: parts[1],
      id_3_hex: parts[2]
    };
  }

  async syncLowerDeviceCodeFromGateway(context, gatewayResultPoint) {
    const gatewayLowerDeviceCode = this.buildGatewayLowerDeviceCode(
      gatewayResultPoint && gatewayResultPoint.id_1_hex,
      gatewayResultPoint && gatewayResultPoint.id_2_hex,
      gatewayResultPoint && gatewayResultPoint.id_3_hex
    );

    if (!gatewayLowerDeviceCode || !context.lower_device_id) {
      return gatewayLowerDeviceCode || context.lower_device_code || null;
    }

    if (gatewayLowerDeviceCode === context.lower_device_code) {
      return gatewayLowerDeviceCode;
    }

    const existingRows = await this.db.query(
      `SELECT id
       FROM lower_devices
       WHERE device_code = ?
       LIMIT 1`,
      [gatewayLowerDeviceCode]
    );

    // 修复说明：下位机编码同步到管理端主表前先做唯一性校验；若编码已被其他下位机占用，按最新需求直接跳过，不做任何写操作。
    if (existingRows[0] && Number(existingRows[0].id) !== Number(context.lower_device_id)) {
      return context.lower_device_code || null;
    }

    await this.db.execute(
      `UPDATE lower_devices
       SET device_code = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [gatewayLowerDeviceCode, context.lower_device_id]
    );

    // 修复说明：主表编码发生变化后，旧的 legacy devices 映射已不再可靠，强制重新按新编码建立兼容映射。
    context.lower_device_code = gatewayLowerDeviceCode;
    context.legacy_device_id = null;
    return gatewayLowerDeviceCode;
  }

  async ensureLowerDeviceBindingFromGateway(context, gatewayResultPoint) {
    const gatewayLowerDeviceCode = this.buildGatewayLowerDeviceCode(
      gatewayResultPoint && gatewayResultPoint.id_1_hex,
      gatewayResultPoint && gatewayResultPoint.id_2_hex,
      gatewayResultPoint && gatewayResultPoint.id_3_hex
    );

    if (!gatewayLowerDeviceCode || !context.upper_device_id || !context.hole_id) {
      return null;
    }

    let lowerDevice = null;
    if (context.lower_device_id) {
      // 修复说明：若钻孔已经挂了下位机，优先复用原记录并按网关回传编码做同步，避免无谓新建重复下位机。
      await this.syncLowerDeviceCodeFromGateway(context, gatewayResultPoint);
      const currentRows = await this.db.query(
        `SELECT id, device_code, device_name, current_hole_id, current_project_id, status
         FROM lower_devices
         WHERE id = ?
         LIMIT 1`,
        [context.lower_device_id]
      );
      lowerDevice = currentRows[0] || null;
    }

    if (!lowerDevice) {
      const existingRows = await this.db.query(
        `SELECT id, device_code, device_name, current_hole_id, current_project_id, status
         FROM lower_devices
         WHERE device_code = ?
         LIMIT 1`,
        [gatewayLowerDeviceCode]
      );
      lowerDevice = existingRows[0] || null;
    }

    if (!lowerDevice) {
      const insertResult = await this.db.execute(
        `INSERT INTO lower_devices (
           device_code, device_name, current_hole_id, current_project_id, status, created_at, updated_at
         ) VALUES (?, ?, ?, ?, 'measuring', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          gatewayLowerDeviceCode,
          context.lower_device_name || `下位机${gatewayLowerDeviceCode}`,
          context.hole_id,
          context.project_id
        ]
      );
      const createdRows = await this.db.query(
        `SELECT id, device_code, device_name, current_hole_id, current_project_id, status
         FROM lower_devices
         WHERE id = ?
         LIMIT 1`,
        [insertResult.insertId]
      );
      lowerDevice = createdRows[0] || null;
    } else {
      await this.db.execute(
        `UPDATE lower_devices
         SET device_name = ?, current_hole_id = ?, current_project_id = ?, status = 'measuring', updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          lowerDevice.device_name || context.lower_device_name || `下位机${gatewayLowerDeviceCode}`,
          context.hole_id,
          context.project_id,
          lowerDevice.id
        ]
      );
      const updatedRows = await this.db.query(
        `SELECT id, device_code, device_name, current_hole_id, current_project_id, status
         FROM lower_devices
         WHERE id = ?
         LIMIT 1`,
        [lowerDevice.id]
      );
      lowerDevice = updatedRows[0] || lowerDevice;
    }

    await this.db.execute(
      `UPDATE monitoring_holes
       SET lower_device_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [lowerDevice.id, context.hole_id]
    );

    const bindingRows = await this.db.query(
      `SELECT id, status
       FROM device_bindings
       WHERE upper_device_id = ? AND lower_device_id = ?
       LIMIT 1`,
      [context.upper_device_id, lowerDevice.id]
    );

    // 修复说明：管理端收到监测结果后，需要按现有主数据逻辑补齐上下位机绑定；已存在则恢复 active，不存在则自动创建。
    if (!bindingRows[0]) {
      await this.db.execute(
        `INSERT INTO device_bindings (
           upper_device_id, lower_device_id, binding_type, status, bind_time, created_at, updated_at
         ) VALUES (?, ?, 'permanent', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [context.upper_device_id, lowerDevice.id]
      );
    } else if (bindingRows[0].status !== 'active') {
      await this.db.execute(
        `UPDATE device_bindings
         SET status = 'active', bind_time = CURRENT_TIMESTAMP, unbind_time = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [bindingRows[0].id]
      );
    }

    context.lower_device_id = lowerDevice.id;
    context.lower_device_code = lowerDevice.device_code;
    context.lower_device_name = lowerDevice.device_name || context.lower_device_name || `下位机${gatewayLowerDeviceCode}`;
    context.legacy_device_id = null;
    return lowerDevice;
  }

  normalizeGatewayDepth(depth) {
    const parsed = Number(depth);
    if (!Number.isFinite(parsed)) {
      return null;
    }

    // 修复说明：网关示例中的 depth 为毫米，原始数据表沿用米单位，这里统一转换为米以兼容现有展示与计算逻辑。
    return parsed > 100 ? Number((parsed / 1000).toFixed(3)) : parsed;
  }

  buildGatewayMeasurements(task, context, gatewayResult, gatewayResultPoint) {
    const a0 = this.parseGatewayJson(gatewayResultPoint.result_a0_json);
    const a180 = this.parseGatewayJson(gatewayResultPoint.result_a180_json);
    const gatewayLowerDeviceCode = this.buildGatewayLowerDeviceCode(
      gatewayResultPoint.id_1_hex,
      gatewayResultPoint.id_2_hex,
      gatewayResultPoint.id_3_hex
    );
    // 修复说明：这里显式执行一次反解析校验，确保新规则不仅能编码，也能稳定还原出三段 HEX 原值。
    const parsedGatewayLowerDevice = this.parseGatewayLowerDeviceCode(gatewayLowerDeviceCode);
    // 修复说明：原始数据统一跟随当前管理端已经生效的下位机编码，避免主表同步被跳过时仍写入未生效的新编码。
    const resolvedLowerDeviceCode = context.lower_device_code || gatewayLowerDeviceCode;
    const positivePoints = Array.isArray(a0 && a0.points) ? a0.points : [];
    const negativePoints = Array.isArray(a180 && a180.points) ? a180.points : [];
    const pointMap = new Map();

    positivePoints.forEach((point, index) => {
      const key = `${point.idx ?? index}_${point.node ?? index}`;
      pointMap.set(key, { positive: point, negative: null, index });
    });

    negativePoints.forEach((point, index) => {
      const key = `${point.idx ?? index}_${point.node ?? index}`;
      const existing = pointMap.get(key) || { positive: null, negative: null, index };
      existing.negative = point;
      pointMap.set(key, existing);
    });

    const measurementTime = gatewayResult.finished_at || gatewayResult.updated_at || new Date().toISOString();
    return Array.from(pointMap.values())
      .sort((left, right) => left.index - right.index)
      .map((item, index) => {
        const positivePoint = item.positive || {};
        const negativePoint = item.negative || {};
        const depth = this.normalizeGatewayDepth(positivePoint.depth ?? negativePoint.depth);
        return {
          measurement_uuid: crypto
            .createHash('md5')
            .update(`${task.taskId}:${gatewayResult.task_id}:${positivePoint.idx ?? negativePoint.idx ?? index}`)
            .digest('hex'),
          hole_id: context.hole_id,
          // 修复说明：原始数据优先写入由网关三段 HEX 合成的下位机标识；若网关暂未回传新字段，再回退到管理端既有绑定编码。
          device_code: resolvedLowerDeviceCode,
          device_name: context.lower_device_name || null,
          upper_imei: context.imei,
          measurement_time: measurementTime,
          measurement_mode: 'scheduled',
          batch_number: String(gatewayResult.task_id || task.taskId).slice(0, 50),
          depth,
          positive_value: Number(positivePoint.value ?? 0),
          negative_value: Number(negativePoint.value ?? 0),
          data_status: 'raw',
          quality_flag: 'good',
          upload_time: gatewayResultPoint.updated_at || measurementTime,
          source_task_id: gatewayResult.task_id,
          source_hole_no: gatewayResultPoint.hole_no,
          source_node_num: gatewayResultPoint.node_num,
          gateway_lower_device_code: gatewayLowerDeviceCode,
          id_1_hex: parsedGatewayLowerDevice ? parsedGatewayLowerDevice.id_1_hex : null,
          id_2_hex: parsedGatewayLowerDevice ? parsedGatewayLowerDevice.id_2_hex : null,
          id_3_hex: parsedGatewayLowerDevice ? parsedGatewayLowerDevice.id_3_hex : null
        };
      })
      .filter(item => item.depth !== null);
  }

  buildCallbackRawMeasurements(task) {
    const sourceHoleId = this.normalizeOptionalInteger(task.metadata?.sourceHoleId || task.metadata?.holeId);
    const sourceProjectId = this.normalizeOptionalInteger(task.metadata?.sourceProjectId || task.metadata?.projectId);
    const rawMeasurements = Array.isArray(task.resultPayload?.rawMeasurements) ? task.resultPayload.rawMeasurements : [];

    // 修复说明：管理端落库使用的是管理端 hole_id，但回调客户端时必须恢复成客户端自己的 hole_id/project_id，避免客户端原始数据和绑定关系写到错误主键上。
    return rawMeasurements.map((item) => ({
      ...item,
      admin_hole_id: item.hole_id,
      hole_id: sourceHoleId || item.hole_id,
      project_id: sourceProjectId || null
    }));
  }

  async buildCallbackDeviceProfiles(task, rawMeasurements = []) {
    const lowerDeviceCode = this.nullIfEmpty(rawMeasurements[0]?.device_code || task.metadata?.lowerDeviceCode);
    const upperRows = await this.db.query(
      `SELECT id, imei, device_name, manufacturer, model, serial_number, firmware_version,
              network_status, last_online_time, ip_address, signal_strength,
              wire_change_mileage, total_mileage, inspection_mileage, status
       FROM upper_devices
       WHERE imei = ?
       LIMIT 1`,
      [task.imei]
    );
    const lowerRows = lowerDeviceCode
      ? await this.db.query(
        `SELECT id, device_code, device_name, manufacturer, model, serial_number,
                k_value, beta_value, calibration_date, calibration_org, valid_until,
                calibration_status, current_hole_id, current_project_id,
                total_measurement_count, total_measurement_depth, status
         FROM lower_devices
         WHERE device_code = ?
         LIMIT 1`,
        [lowerDeviceCode]
      )
      : [];

    const lowerDevice = lowerRows[0] || null;
    if (lowerDevice) {
      lowerDevice.calibration_date = this.formatDateOnly(lowerDevice.calibration_date);
      lowerDevice.valid_until = this.formatDateOnly(lowerDevice.valid_until);
    }

    return {
      upperDevice: upperRows[0] || null,
      lowerDevice
    };
  }

  async ensureLegacyMeasurementDevice(context, measurement, executor = this.db) {
    const resolvedDeviceCode = this.nullIfEmpty(measurement && measurement.device_code) || context.lower_device_code;

    if (context.legacy_device_id && resolvedDeviceCode === context.lower_device_code) {
      return { id: context.legacy_device_id };
    }

    if (!resolvedDeviceCode) {
      throw new Error('下位机缺少 device_code，无法兼容写入原始数据表');
    }

    const existingRows = await executor.query(
      `SELECT id FROM devices WHERE device_id = ? LIMIT 1`,
      [resolvedDeviceCode]
    );
    if (existingRows[0]) {
      return { id: existingRows[0].id };
    }

    // 修复说明：原始数据表仍依赖旧 devices 表外键，这里按最终解析出的下位机 device_code 建立兼容设备记录，避免新链路落库失败。
    const result = await executor.execute(
      `INSERT INTO devices (
         device_id, device_name, device_type, dtu_id, network_status, status,
         current_hole_id, current_project_id, created_at, updated_at
       ) VALUES (?, ?, ?, ?, 'online', 'measuring', ?, NULL, NOW(), NOW())`,
      [
        resolvedDeviceCode,
        context.lower_device_name || `下位机${resolvedDeviceCode}`,
        'lower_device',
        context.imei,
        context.hole_id
      ]
    );

    return { id: result.insertId };
  }

  buildMileageWarnings(totalMileage, wireChangeMileage, inspectionMileage) {
    const total = Number(totalMileage) || 0;
    const warnings = [];
    const changeThreshold = Number(wireChangeMileage) || 0;
    const inspectionThreshold = Number(inspectionMileage) || 0;
    if (changeThreshold > 0 && total >= changeThreshold) {
      warnings.push({
        type: 'wire_change',
        message: '上位机累计监测里程已达到换线预警值，请及时换线。',
        threshold: changeThreshold,
        totalMileage: total
      });
    }
    if (inspectionThreshold > 0 && total >= inspectionThreshold) {
      warnings.push({
        type: 'inspection',
        message: '上位机累计监测里程已达到检查预警值，请及时检查。',
        threshold: inspectionThreshold,
        totalMileage: total
      });
    }
    return warnings;
  }

  calculateMeasurementMileage(measurements) {
    let previousDepth = 0;
    return measurements.reduce((total, measurement) => {
      const depth = Number(measurement.depth);
      if (!Number.isFinite(depth)) {
        return total;
      }
      const distance = Math.abs(depth - previousDepth);
      previousDepth = depth;
      return total + distance;
    }, 0);
  }

  async updateDeviceMileageStats(context, newMeasurements, executor = this.db) {
    const addedCount = newMeasurements.length;
    const addedDepth = newMeasurements.reduce((sum, item) => sum + (Number(item.depth) || 0), 0);
    const addedMileage = newMeasurements.reduce(
      (sum, item) => sum + (Number(item.mileage_delta) || 0),
      0
    );

    if (context.upper_device_id) {
      await executor.execute(
        `UPDATE upper_devices
         SET total_mileage = COALESCE(total_mileage, 0) + ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [addedMileage, context.upper_device_id]
      );
    }
    if (context.lower_device_id && addedCount > 0) {
      await executor.execute(
        `UPDATE lower_devices
         SET total_measurement_count = COALESCE(total_measurement_count, 0) + ?,
             total_measurement_depth = COALESCE(total_measurement_depth, 0) + ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [addedCount, addedDepth, context.lower_device_id]
      );
    }

    const upperRows = context.upper_device_id
      ? await executor.query(
        `SELECT total_mileage, wire_change_mileage, inspection_mileage
         FROM upper_devices WHERE id = ? LIMIT 1`,
        [context.upper_device_id]
      )
      : [];
    const lowerRows = context.lower_device_id
      ? await executor.query(
        `SELECT total_measurement_count, total_measurement_depth
         FROM lower_devices WHERE id = ? LIMIT 1`,
        [context.lower_device_id]
      )
      : [];
    const upperDevice = upperRows[0] || {};
    const lowerDevice = lowerRows[0] || {};
    const totalMileage = Number(upperDevice.total_mileage) || 0;
    const warnings = this.buildMileageWarnings(
      totalMileage,
      upperDevice.wire_change_mileage,
      upperDevice.inspection_mileage
    );
    const warningText = warnings.map(item => item.message).join(' ');

    return {
      upperDevice: {
        addedMileage: Number(addedMileage.toFixed(3)),
        totalMileage,
        wireChangeMileage: Number(upperDevice.wire_change_mileage) || 0,
        inspectionMileage: Number(upperDevice.inspection_mileage) || 0,
        warnings
      },
      lowerDevice: {
        addedCount,
        addedDepth: Number(addedDepth.toFixed(3)),
        totalCount: Number(lowerDevice.total_measurement_count) || 0,
        totalDepth: Number(lowerDevice.total_measurement_depth) || 0
      },
      taskLog: {
        type: 'device_mileage_stats',
        level: warnings.length ? 'warning' : 'info',
        message: `本次新增上位机里程 ${Number(addedMileage.toFixed(3))}m，累计上位机总里程 ${totalMileage}m。${warningText}`,
        fields: [
          { field: 'upper_added_mileage', label: '本次上位机新增里程(m)', value: Number(addedMileage.toFixed(3)) },
          { field: 'upper_total_mileage', label: '上位机总里程(m)', value: totalMileage },
          { field: 'lower_total_measurement_count', label: '下位机累计测量次数', value: Number(lowerDevice.total_measurement_count) || 0 },
          { field: 'lower_total_measurement_depth', label: '下位机累计测量深度(m)', value: Number(lowerDevice.total_measurement_depth) || 0 }
        ],
        warnings,
        createdAt: new Date().toISOString()
      }
    };
  }

  async saveGatewayRawMeasurements(task, context, gatewayResult, gatewayResultPoint) {
    await this.ensureLowerDeviceBindingFromGateway(context, gatewayResultPoint);
    const measurements = this.buildGatewayMeasurements(task, context, gatewayResult, gatewayResultPoint);
    const persistMeasurements = async (executor) => {
      const savedRows = [];
      const newMeasurements = [];
      let previousDepth = 0;

      for (const measurement of measurements) {
        const currentDepth = Number(measurement.depth);
        const mileageDelta = Number.isFinite(currentDepth) ? Math.abs(currentDepth - previousDepth) : 0;
        if (Number.isFinite(currentDepth)) previousDepth = currentDepth;
        const legacyDevice = await this.ensureLegacyMeasurementDevice(context, measurement, executor);
        const existingRows = await executor.query(
          `SELECT id
           FROM raw_measurement_data
           WHERE measurement_uuid = ?
           LIMIT 1`,
          [measurement.measurement_uuid]
        );

        const params = [
          context.hole_id,
          legacyDevice.id,
          measurement.measurement_time,
          measurement.measurement_mode,
          measurement.batch_number,
          measurement.depth,
          measurement.positive_value,
          measurement.negative_value,
          measurement.data_status,
          measurement.quality_flag,
          measurement.upload_time
        ];

        if (existingRows[0]) {
          // raw_measurement_data 只有 created_at，更新时不能写入不存在的 updated_at。
          await executor.execute(
            `UPDATE raw_measurement_data
             SET hole_id = ?, device_id = ?, measurement_time = ?, measurement_mode = ?,
                 batch_number = ?, depth = ?, positive_value = ?, negative_value = ?,
                 data_status = ?, quality_flag = ?, upload_time = ?
             WHERE id = ?`,
            [...params, existingRows[0].id]
          );
          savedRows.push({
            id: existingRows[0].id,
            ...measurement,
            device_id: legacyDevice.id
          });
          continue;
        }

        // 新增原始数据时同样不能写入不存在的 updated_at 字段。
        const result = await executor.execute(
          `INSERT INTO raw_measurement_data (
             measurement_uuid, hole_id, device_id, measurement_time, measurement_mode,
             batch_number, depth, positive_value, negative_value, data_status,
             quality_flag, upload_time, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [
            measurement.measurement_uuid,
            context.hole_id,
            legacyDevice.id,
            measurement.measurement_time,
            measurement.measurement_mode,
            measurement.batch_number,
            measurement.depth,
            measurement.positive_value,
            measurement.negative_value,
            measurement.data_status,
            measurement.quality_flag,
            measurement.upload_time
          ]
        );
        savedRows.push({
          id: result.insertId,
          ...measurement,
          device_id: legacyDevice.id
        });
        newMeasurements.push({ ...measurement, mileage_delta: mileageDelta });
      }

      return {
        rows: savedRows,
        deviceMileageStats: await this.updateDeviceMileageStats(context, newMeasurements, executor)
      };
    };

    return typeof this.db.withTransaction === 'function'
      ? this.db.withTransaction(persistMeasurements)
      : persistMeasurements(this.db);
  }

}

module.exports = TaskService;
