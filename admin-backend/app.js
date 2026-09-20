const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const config = require('./src/config');
const Database = require('./src/database');
const GatewayDatabase = require('./src/gatewayDatabase');
const TaskService = require('./src/taskService');
const AdminService = require('./src/adminService');

const app = express();
const db = new Database(config);
const gatewayDb = new GatewayDatabase(config.gatewayDatabase);
// 修复说明：任务服务现在既要调用云端通讯服务 HTTP 接口，也要轮询网关库 dg_result/dg_result_point。
const taskService = new TaskService({ db, gatewayDb, config, logger: console });
const adminService = new AdminService({ db, gatewayDb, config, logger: console });

app.use(cors({
  origin(origin, callback) {
    if (!origin || config.cors.origin.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`Origin ${origin} is not allowed by CORS`));
  },
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));

function sendError(res, status, message, details) {
  return res.status(status).json({
    success: false,
    error: message,
    details: details || null
  });
}

function signAdminToken(user) {
  return jwt.sign(
    {
      sub: String(user.id),
      username: user.username,
      roles: user.roles
    },
    config.security.jwtSecret,
    { expiresIn: config.security.jwtExpiresInSeconds }
  );
}

function readBearerToken(req) {
  const authHeader = req.header('authorization') || '';
  const [type, token] = authHeader.split(' ');
  return type === 'Bearer' ? token : null;
}

function requireAdminSecret(req, res, next) {
  const adminSecret = req.header('x-admin-secret');
  if (!adminSecret || adminSecret !== config.security.adminBootstrapKey) {
    return sendError(res, 401, '缺少或无效的 x-admin-secret');
  }
  req.adminAccess = { type: 'secret' };
  return next();
}

function requireAdminAccess(req, res, next) {
  const token = readBearerToken(req);
  if (token) {
    try {
      const payload = jwt.verify(token, config.security.jwtSecret);
      req.adminUser = {
        id: Number(payload.sub),
        username: payload.username,
        roles: payload.roles || []
      };
      req.adminAccess = { type: 'jwt' };
      return next();
    } catch (error) {
      return sendError(res, 401, '管理端登录态无效', error.message);
    }
  }

  return requireAdminSecret(req, res, next);
}

async function requireClientKey(req, res, next) {
  try {
    const clientKey = req.header('x-client-key');
    if (!clientKey) {
      return sendError(res, 401, '缺少 x-client-key');
    }

    const customer = await taskService.getCustomerByClientKey(clientKey);
    if (!customer) {
      return sendError(res, 401, '无效的客户 Key');
    }

    req.customer = customer;
    return next();
  } catch (error) {
    return sendError(res, 500, '客户鉴权失败', error.message);
  }
}

app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1 AS ok');
    res.json({
      success: true,
      data: {
        service: 'admin-backend',
        port: config.server.port,
        tcpApiBaseUrl: config.tcpApi.baseUrl,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    sendError(res, 500, '服务异常', error.message);
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '').trim();

    if (!username || !password) {
      return sendError(res, 400, '用户名和密码不能为空');
    }

    const user = await adminService.verifyAdminUser(username, password);
    if (!user) {
      return sendError(res, 401, '用户名或密码错误，或当前用户不是管理员');
    }

    return res.json({
      success: true,
      data: {
        token: signAdminToken(user),
        user
      }
    });
  } catch (error) {
    return sendError(res, 500, '管理端登录失败', error.message);
  }
});

app.get('/api/auth/me', requireAdminAccess, async (req, res) => {
  try {
    if (req.adminUser?.id) {
      const user = await adminService.getAdminUserById(req.adminUser.id);
      return res.json({ success: true, data: user || req.adminUser });
    }

    return res.json({
      success: true,
      data: {
        username: 'secret-admin',
        roles: ['admin'],
        authType: 'secret'
      }
    });
  } catch (error) {
    return sendError(res, 500, '获取当前管理员失败', error.message);
  }
});

app.get('/api/dashboard/stats', requireAdminAccess, async (req, res) => {
  try {
    const stats = await adminService.getDashboardStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    sendError(res, 500, '获取仪表盘统计失败', error.message);
  }
});

app.get('/api/warehouses', requireAdminAccess, async (req, res) => {
  try {
    res.json({ success: true, data: await adminService.listWarehouses() });
  } catch (error) {
    sendError(res, 500, '查询仓库失败', error.message);
  }
});

app.post('/api/warehouses', requireAdminAccess, async (req, res) => {
  try {
    res.status(201).json({ success: true, data: await adminService.createWarehouse(req.body || {}) });
  } catch (error) {
    sendError(res, 400, '创建仓库失败', error.message);
  }
});

app.put('/api/warehouses/:id', requireAdminAccess, async (req, res) => {
  try {
    res.json({ success: true, data: await adminService.updateWarehouse(req.params.id, req.body || {}) });
  } catch (error) {
    sendError(res, 400, '更新仓库失败', error.message);
  }
});

app.get('/api/device-management/overview', requireAdminAccess, async (req, res) => {
  try {
    const stats = await adminService.getDashboardStats();
    res.json({
      success: true,
      data: {
        customers: stats.customers,
        soldDevices: stats.soldDevices,
        inStockDevices: stats.inStockDevices,
        warehouses: stats.warehouses,
        soldDevicesByCustomer: stats.soldDevicesByCustomer
      }
    });
  } catch (error) {
    sendError(res, 500, '查询设备管理总览失败', error.message);
  }
});

app.get('/api/device-management/inventory', requireAdminAccess, async (req, res) => {
  try {
    const result = await adminService.listDeviceInventory(req.query || {});
    res.json({ success: true, data: result });
  } catch (error) {
    sendError(res, 500, '查询设备库存失败', error.message);
  }
});

app.get('/api/device-management/available-devices', requireAdminAccess, async (req, res) => {
  try {
    res.json({ success: true, data: await adminService.listAvailableDevices() });
  } catch (error) {
    sendError(res, 500, '查询可入库设备失败', error.message);
  }
});

app.post('/api/device-management/inventory', requireAdminAccess, async (req, res) => {
  try {
    const result = await adminService.stockDevice(req.body || {});
    res.status(201).json({ success: true, data: result, message: '设备已入库' });
  } catch (error) {
    sendError(res, 400, '设备入库失败', error.message);
  }
});

app.post('/api/device-management/sales', requireAdminAccess, async (req, res) => {
  try {
    const result = await adminService.sellDevice(req.body || {}, req.adminUser?.id || null);
    res.status(201).json({ success: true, data: result, message: '设备已售出并绑定客户' });
  } catch (error) {
    sendError(res, 400, '设备销售失败', error.message);
  }
});

app.post('/api/device-management/inventory/:id/return', requireAdminAccess, async (req, res) => {
  try {
    const result = await adminService.returnDevice(req.params.id);
    res.json({ success: true, data: result, message: '设备已退回仓库' });
  } catch (error) {
    sendError(res, 400, '设备退回失败', error.message);
  }
});

app.get('/api/customers', requireAdminAccess, async (req, res) => {
  try {
    const customers = await taskService.listCustomers();
    res.json({ success: true, data: customers });
  } catch (error) {
    sendError(res, 500, '查询客户失败', error.message);
  }
});

app.post('/api/customers', requireAdminAccess, async (req, res) => {
  try {
    const customer = await taskService.createCustomer(req.body || {});
    res.status(201).json({ success: true, data: customer });
  } catch (error) {
    sendError(res, 400, '创建客户失败', error.message);
  }
});

app.get('/api/customers/:id/upper-devices', requireAdminAccess, async (req, res) => {
  try {
    const upperDevices = await taskService.getUpperDevicesForCustomer(req.params.id);
    res.json({ success: true, data: upperDevices });
  } catch (error) {
    sendError(res, 400, '查询客户绑定上位机失败', error.message);
  }
});

app.put('/api/customers/:id/upper-devices', requireAdminAccess, async (req, res) => {
  try {
    const upperDevices = await taskService.replaceCustomerUpperDevices(
      req.params.id,
      req.body?.upperDeviceIds || []
    );
    res.json({ success: true, data: upperDevices });
  } catch (error) {
    sendError(res, 400, '更新客户绑定上位机失败', error.message);
  }
});

app.put('/api/customers/:id', requireAdminAccess, async (req, res) => {
  try {
    const customer = await adminService.updateCustomer(req.params.id, req.body || {});
    res.json({ success: true, data: customer });
  } catch (error) {
    sendError(res, 400, '更新客户失败', error.message);
  }
});

app.delete('/api/customers/:id', requireAdminAccess, async (req, res) => {
  try {
    await adminService.deleteCustomer(req.params.id);
    res.json({ success: true, message: '客户已删除' });
  } catch (error) {
    sendError(res, 400, '删除客户失败', error.message);
  }
});

app.get('/api/admin-users', requireAdminAccess, async (req, res) => {
  try {
    const result = await adminService.listAdminUsers(req.query || {});
    res.json({ success: true, data: result });
  } catch (error) {
    sendError(res, 500, '查询管理员用户失败', error.message);
  }
});

app.post('/api/admin-users', requireAdminAccess, async (req, res) => {
  try {
    const user = await adminService.createAdminUser(req.body || {});
    res.status(201).json({ success: true, data: user });
  } catch (error) {
    sendError(res, 400, '创建管理员用户失败', error.message);
  }
});

app.put('/api/admin-users/:id', requireAdminAccess, async (req, res) => {
  try {
    const user = await adminService.updateAdminUser(req.params.id, req.body || {});
    res.json({ success: true, data: user });
  } catch (error) {
    sendError(res, 400, '更新管理员用户失败', error.message);
  }
});

app.delete('/api/admin-users/:id', requireAdminAccess, async (req, res) => {
  try {
    await adminService.deleteAdminUser(req.params.id);
    res.json({ success: true, message: '管理员用户已删除' });
  } catch (error) {
    sendError(res, 400, '删除管理员用户失败', error.message);
  }
});

app.get('/api/upper-devices', requireAdminAccess, async (req, res) => {
  try {
    const result = await adminService.listUpperDevices(req.query || {});
    res.json({ success: true, data: result });
  } catch (error) {
    sendError(res, 500, '查询上位机失败', error.message);
  }
});

app.put('/api/upper-devices/:id/mileage-thresholds', requireAdminAccess, async (req, res) => {
  try {
    const upperDevice = await adminService.updateUpperDeviceMileageThresholds(req.params.id, req.body || {});
    res.json({ success: true, data: upperDevice, message: '上位机里程预警值已更新' });
  } catch (error) {
    sendError(res, 400, '更新上位机里程预警值失败', error.message);
  }
});

app.get('/api/upper-devices/:id/tasks', requireAdminAccess, async (req, res) => {
  try {
    const upperDevice = await adminService.getUpperDeviceById(req.params.id);
    if (!upperDevice) {
      return sendError(res, 404, '上位机不存在');
    }

    const tasks = await taskService.listTasksForAdmin({
      imei: upperDevice.imei,
      limit: req.query.limit
    });
    res.json({
      success: true,
      data: {
        upperDevice,
        list: tasks
      }
    });
  } catch (error) {
    sendError(res, 500, '查询上位机监测任务失败', error.message);
  }
});

app.post('/api/upper-devices/:id/send-command', requireAdminAccess, async (req, res) => {
  try {
    const upperDevice = await adminService.getUpperDeviceById(req.params.id);
    if (!upperDevice) {
      return sendError(res, 404, '上位机不存在');
    }
    if (upperDevice.network_status !== 'online') {
      return sendError(res, 400, '上位机离线，无法发送指令');
    }

    const result = await adminService.sendUpperDeviceCommand(upperDevice.imei, req.body || {});
    res.json({
      success: true,
      message: result.message || '指令发送成功',
      data: result.data || null
    });
  } catch (error) {
    sendError(res, error.statusCode || 400, '发送自定义指令失败', error.message);
  }
});

app.get('/api/upper-devices/:id/command-logs', requireAdminAccess, async (req, res) => {
  try {
    const upperDevice = await adminService.getUpperDeviceById(req.params.id);
    if (!upperDevice) {
      return sendError(res, 404, '上位机不存在');
    }

    const result = await adminService.getUpperDeviceCommandLogs(upperDevice.imei, req.query || {});
    res.json({
      success: true,
      data: {
        imei: upperDevice.imei,
        list: result.data?.list || []
      }
    });
  } catch (error) {
    sendError(res, error.statusCode || 500, '查询自定义指令通信日志失败', error.message);
  }
});

app.post('/api/upper-devices/:id/set-params', requireAdminAccess, async (req, res) => {
  try {
    const upperDevice = await adminService.getUpperDeviceById(req.params.id);
    if (!upperDevice) {
      return sendError(res, 404, '上位机不存在');
    }
    const customer = await taskService.getCustomerByUpperDeviceId(upperDevice.id);
    if (!customer) {
      return sendError(res, 400, '上位机未绑定启用客户，无法创建任务');
    }

    const task = await taskService.createTask(customer, {
      imei: upperDevice.imei,
      taskType: 'set_params',
      params: req.body?.params,
      metadata: {
        triggerSource: 'admin-upper-device-workbench',
        adminUpperDeviceId: upperDevice.id
      }
    });
    res.status(201).json({
      success: true,
      message: '参数配置任务已创建',
      data: task
    });
  } catch (error) {
    sendError(res, error.statusCode || 400, '创建参数配置任务失败', error.message);
  }
});

// 修复说明：管理端工作台“读取配置”入口，对应通讯服务 POST /params/fetch，
// 创建一个参数读取任务，任务完成后参数快照会写入任务结果。
app.post('/api/upper-devices/:id/params/fetch', requireAdminAccess, async (req, res) => {
  try {
    const upperDevice = await adminService.getUpperDeviceById(req.params.id);
    if (!upperDevice) {
      return sendError(res, 404, '上位机不存在');
    }
    const customer = await taskService.getCustomerByUpperDeviceId(upperDevice.id);
    if (!customer) {
      return sendError(res, 400, '上位机未绑定启用客户，无法创建任务');
    }

    const task = await taskService.createTask(customer, {
      imei: upperDevice.imei,
      taskType: 'params_fetch',
      metadata: {
        triggerSource: 'admin-upper-device-workbench',
        adminUpperDeviceId: upperDevice.id
      }
    });
    res.status(201).json({
      success: true,
      message: '参数读取任务已创建',
      data: task
    });
  } catch (error) {
    sendError(res, error.statusCode || 400, '创建参数读取任务失败', error.message);
  }
});

// 修复说明：直接读取网关库 dg_device_params 中的参数快照，供工作台打开时异步回填表单。
app.get('/api/upper-devices/:id/params', requireAdminAccess, async (req, res) => {
  try {
    const upperDevice = await adminService.getUpperDeviceById(req.params.id);
    if (!upperDevice) {
      return sendError(res, 404, '上位机不存在');
    }

    const deviceParams = await taskService.readDeviceParamSnapshot(upperDevice.imei);
    res.json({ success: true, data: deviceParams });
  } catch (error) {
    sendError(res, 404, '读取设备参数失败', error.message);
  }
});

// 修复说明：管理端轮询单个任务状态（参数读取任务需要），复用管理端任务视图。
app.get('/api/upper-devices/:id/tasks/:taskId', requireAdminAccess, async (req, res) => {
  try {
    const upperDevice = await adminService.getUpperDeviceById(req.params.id);
    if (!upperDevice) {
      return sendError(res, 404, '上位机不存在');
    }

    const task = await taskService.getTaskForAdmin(req.params.taskId);
    if (!task || task.imei !== upperDevice.imei) {
      return sendError(res, 404, '任务不存在');
    }

    res.json({ success: true, data: task });
  } catch (error) {
    sendError(res, 500, '查询任务失败', error.message);
  }
});

app.delete('/api/upper-devices/:id', requireAdminAccess, async (req, res) => {
  try {
    const upperDevice = await adminService.deleteUpperDevice(req.params.id);
    res.json({
      success: true,
      data: upperDevice,
      message: `上位机 ${upperDevice.imei} 已删除`
    });
  } catch (error) {
    sendError(res, 400, '删除上位机失败', error.message);
  }
});

app.post('/api/upper-devices/:id/home-move', requireAdminAccess, async (req, res) => {
  try {
    const upperDevice = await adminService.getUpperDeviceById(req.params.id);
    if (!upperDevice) {
      return sendError(res, 404, '上位机不存在');
    }
    const customer = await taskService.getCustomerByUpperDeviceId(upperDevice.id);
    if (!customer) {
      return sendError(res, 400, '上位机未绑定启用客户，无法创建任务');
    }
    const result = await taskService.createTask(customer, {
      imei: upperDevice.imei,
      taskType: 'home_move',
      metadata: {
        triggerSource: 'admin-upper-device-list',
        adminUpperDeviceId: upperDevice.id
      }
    });
    res.json({
      success: true,
      message: '归位任务已创建',
      data: result
    });
  } catch (error) {
    sendError(res, 400, '创建归位任务失败', error.message);
  }
});

app.post('/api/upper-devices/:id/bottom-test', requireAdminAccess, async (req, res) => {
  try {
    const upperDevice = await adminService.getUpperDeviceById(req.params.id);
    if (!upperDevice) {
      return sendError(res, 404, '上位机不存在');
    }
    const customer = await taskService.getCustomerByUpperDeviceId(upperDevice.id);
    if (!customer) {
      return sendError(res, 400, '上位机未绑定启用客户，无法创建任务');
    }
    const result = await taskService.createTask(customer, {
      imei: upperDevice.imei,
      taskType: 'bottom_test',
      metadata: {
        triggerSource: 'admin-upper-device-list',
        adminUpperDeviceId: upperDevice.id
      }
    });
    res.json({
      success: true,
      message: '底部检测任务已创建',
      data: result
    });
  } catch (error) {
    sendError(res, 400, '创建底部检测任务失败', error.message);
  }
});

app.post('/api/upper-devices/:id/status-check', requireAdminAccess, async (req, res) => {
  try {
    const upperDevice = await adminService.getUpperDeviceById(req.params.id);
    if (!upperDevice) {
      return sendError(res, 404, '上位机不存在');
    }
    const customer = await taskService.getCustomerByUpperDeviceId(upperDevice.id);
    if (!customer) {
      return sendError(res, 400, '上位机未绑定启用客户，无法创建任务');
    }
    const result = await taskService.createTask(customer, {
      imei: upperDevice.imei,
      taskType: 'status_check',
      metadata: {
        triggerSource: 'admin-upper-device-workbench',
        adminUpperDeviceId: upperDevice.id
      }
    });
    res.status(201).json({
      success: true,
      message: '状态检查任务已创建',
      data: result
    });
  } catch (error) {
    sendError(res, error.statusCode || 400, '创建状态检查任务失败', error.message);
  }
});

app.post('/api/upper-devices/sync-status', requireAdminAccess, async (req, res) => {
  try {
    const result = await adminService.syncUpperDevicesFromGateway();
    res.json({
      success: true,
      data: result,
      message: `已同步 ${result.updated} 台上位机状态`
    });
  } catch (error) {
    sendError(res, 500, '同步上位机状态失败', error.message);
  }
});

app.get('/api/upper-devices/available', requireAdminAccess, async (req, res) => {
  try {
    const upperDevices = await taskService.listBindableUpperDevices(req.query.customerId || null);
    res.json({ success: true, data: upperDevices });
  } catch (error) {
    sendError(res, 500, '查询可绑定上位机失败', error.message);
  }
});

app.get('/api/lower-devices', requireAdminAccess, async (req, res) => {
  try {
    const result = await adminService.listLowerDevices(req.query || {});
    res.json({ success: true, data: result });
  } catch (error) {
    sendError(res, 500, '查询下位机失败', error.message);
  }
});

app.put('/api/lower-devices/:id/calibration', requireAdminAccess, async (req, res) => {
  try {
    const result = await adminService.updateLowerDeviceCalibration(req.params.id, req.body || {});
    if (!result) {
      return sendError(res, 404, '下位机不存在');
    }
    res.json({ success: true, data: result, message: '下位机校准信息已更新' });
  } catch (error) {
    sendError(res, 500, '更新下位机校准信息失败', error.message);
  }
});

app.get('/api/projects', requireAdminAccess, async (req, res) => {
  try {
    // 修复说明：管理端新增工程管理菜单后，/api/projects 需要统一承担工程列表与原始数据筛选的工程下拉来源，避免重复维护两套路由。
    const result = await adminService.listProjects();
    res.json({ success: true, data: result });
  } catch (error) {
    sendError(res, 500, '查询工程列表失败', error.message);
  }
});

app.get('/api/projects/:id', requireAdminAccess, async (req, res) => {
  try {
    // 修复说明：工程详情页需要一次性获取工程基本信息、测孔列表、上位机列表和下位机列表，这里由后端统一聚合返回，减少前端多接口拼接误差。
    const result = await adminService.getProjectDetail(req.params.id);
    if (!result) {
      return sendError(res, 404, '工程不存在');
    }
    res.json({ success: true, data: result });
  } catch (error) {
    sendError(res, 500, '查询工程详情失败', error.message);
  }
});

app.get('/api/monitoring-holes', requireAdminAccess, async (req, res) => {
  try {
    // 修复说明：管理端原始数据页新增“工程 -> 测孔”联动筛选，这里按工程返回已有监测任务关联的测孔列表。
    const result = await adminService.listMonitoringHolesForRawData(req.query || {});
    res.json({ success: true, data: result });
  } catch (error) {
    sendError(res, 500, '查询测孔列表失败', error.message);
  }
});

app.get('/api/raw-data', requireAdminAccess, async (req, res) => {
  try {
    const result = await adminService.listRawData(req.query || {});
    res.json({ success: true, data: result });
  } catch (error) {
    sendError(res, 500, '查询原始数据失败', error.message);
  }
});

app.get('/api/me', requireClientKey, async (req, res) => {
  res.json({ success: true, data: req.customer });
});

app.get('/api/client/upper-devices', requireClientKey, async (req, res) => {
  try {
    await adminService.syncUpperDevicesFromGateway();
    const upperDevices = await taskService.getUpperDevicesForCustomer(req.customer.id);
    res.json({ success: true, data: upperDevices });
  } catch (error) {
    sendError(res, 500, '查询客户绑定上位机失败', error.message);
  }
});

app.get('/api/client/lower-devices', requireClientKey, async (req, res) => {
  try {
    const lowerDevices = await taskService.getLowerDevicesForCustomer(req.customer.id);
    res.json({ success: true, data: lowerDevices });
  } catch (error) {
    sendError(res, 500, '查询客户绑定下位机失败', error.message);
  }
});

app.put('/api/client/upper-devices/:imei/mileage-thresholds', requireClientKey, async (req, res) => {
  try {
    await taskService.assertCustomerOwnsUpperDevice(req.customer.id, req.params.imei);
    const upperDevice = await taskService.getUpperDeviceByImei(req.params.imei);
    const updated = await adminService.updateUpperDeviceMileageThresholds(upperDevice.id, req.body || {});
    res.json({ success: true, data: updated, message: '上位机里程预警值已更新' });
  } catch (error) {
    sendError(res, 400, '更新上位机里程预警值失败', error.message);
  }
});

app.get('/api/tasks', requireClientKey, async (req, res) => {
  try {
    const tasks = await taskService.listTasksForCustomer(req.customer.id, {
      limit: req.query.limit,
      imei: req.query.imei
    });
    res.json({ success: true, data: tasks });
  } catch (error) {
    sendError(res, 500, '查询任务失败', error.message);
  }
});

app.get('/api/tasks/:taskId', requireClientKey, async (req, res) => {
  try {
    let task = await taskService.getTaskForCustomer(req.params.taskId, req.customer.id);
    if (!task) {
      return sendError(res, 404, '任务不存在');
    }

    if (task.status === 'created') {
      await taskService.dispatchTask(task.taskId);
      task = await taskService.getTaskForCustomer(req.params.taskId, req.customer.id);
    }

    if (task && ['queued', 'polling'].includes(task.status)) {
      await taskService.pollTask(task.taskId);
      task = await taskService.getTaskForCustomer(req.params.taskId, req.customer.id);
    }

    return res.json({ success: true, data: task });
  } catch (error) {
    return sendError(res, 500, '查询任务失败', error.message);
  }
});

app.post('/api/tasks', requireClientKey, async (req, res) => {
  try {
    const task = await taskService.createTask(req.customer, req.body || {});
    res.status(201).json({
      success: true,
      data: task,
      message: '任务已创建，服务将自动下发设备指令并轮询状态'
    });
  } catch (error) {
    sendError(res, 400, '创建任务失败', error.message);
  }
});

app.post('/api/tasks/:taskId/cancel', requireClientKey, async (req, res) => {
  try {
    const task = await taskService.cancelTaskForCustomer(req.params.taskId, req.customer.id);
    res.json({
      success: true,
      data: task,
      // 修复说明：明确告诉客户端这是“管理端侧取消”，便于前端正确提示用户当前残余风险。
      message: task?.errorMessage || '任务已取消'
    });
  } catch (error) {
    sendError(res, 400, '取消任务失败', error.message);
  }
});

app.use((error, req, res, next) => {
  if (error?.message?.includes('CORS')) {
    return sendError(res, 403, '跨域请求未被允许', error.message);
  }
  return next(error);
});

app.use((req, res) => {
  sendError(res, 404, '接口不存在');
});

async function start() {
  await db.init();
  await gatewayDb.init();
  await taskService.resumePendingTasks();

  app.listen(config.server.port, config.server.host, () => {
    console.log(`[admin-backend] listening on http://${config.server.host}:${config.server.port}`);
    console.log(`[admin-backend] tcp api base url: ${config.tcpApi.baseUrl}`);
    console.log('[admin-backend] admin frontend can use Bearer token or x-admin-secret');
  });
}

async function shutdown(signal) {
  console.log(`[admin-backend] received ${signal}, shutting down`);
  taskService.stopAllPollers();
  await gatewayDb.close();
  await db.close();
  process.exit(0);
}

process.on('SIGINT', () => {
  shutdown('SIGINT').catch(error => {
    console.error('[admin-backend] shutdown failed:', error);
    process.exit(1);
  });
});

process.on('SIGTERM', () => {
  shutdown('SIGTERM').catch(error => {
    console.error('[admin-backend] shutdown failed:', error);
    process.exit(1);
  });
});

start().catch(error => {
  console.error('[admin-backend] failed to start:', error);
  process.exit(1);
});
