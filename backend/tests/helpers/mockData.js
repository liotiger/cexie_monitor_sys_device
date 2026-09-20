/**
 * 模拟数据
 * 提供集成测试所需的测试数据
 */

/**
 * 生成唯一ID
 */
let idCounter = 1;
const generateId = () => idCounter++;

/**
 * 重置ID计数器
 */
const resetIdCounter = () => {
  idCounter = 1;
};

/**
 * 创建模拟用户数据
 * @param {Object} overrides - 覆盖字段
 * @returns {Object} 用户数据
 */
const createMockUser = (overrides = {}) => {
  const id = overrides.id || generateId();
  const timestamp = Date.now();
  
  return {
    id,
    username: `testuser_${id}`,
    email: `test${id}@example.com`,
    password_hash: '$2a$10$XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
    real_name: `测试用户${id}`,
    phone: `1380013800${id % 10}`,
    status: 'active',
    last_login_time: timestamp,
    created_at: timestamp,
    updated_at: timestamp,
    ...overrides
  };
};

/**
 * 创建模拟设备数据
 * @param {Object} overrides - 覆盖字段
 * @returns {Object} 设备数据
 */
const createMockDevice = (overrides = {}) => {
  const id = overrides.id || generateId();
  const timestamp = Date.now();
  
  return {
    id,
    device_id: `DEV-${String(id).padStart(4, '0')}`,
    device_name: `测试设备${id}`,
    device_type: 'inclinometer',
    manufacturer: '测试制造商',
    model: 'TEST-MODEL-001',
    serial_number: `SN${timestamp}`,
    purchase_date: '2024-01-01',
    dtu_id: `DTU-${id}`,
    network_status: 'offline',
    last_online_time: null,
    ip_address: '192.168.1.100',
    communication_protocol: 'TCP',
    signal_strength: 80,
    K_value: 1000.0,
    beta_value: 0.0,
    calibration_date: '2024-01-01',
    calibration_org: '测试校准机构',
    valid_until: '2025-01-01',
    calibration_status: 'valid',
    status: 'idle',
    battery_level: 100,
    temperature: 25.0,
    current_hole_id: null,
    current_project_id: null,
    total_usage_hours: 0,
    total_measurement_count: 0,
    total_measurement_depth: 0,
    created_at: timestamp,
    updated_at: timestamp,
    created_by: null,
    ...overrides
  };
};

/**
 * 创建模拟项目数据
 * @param {Object} overrides - 覆盖字段
 * @returns {Object} 项目数据
 */
const createMockProject = (overrides = {}) => {
  const id = overrides.id || generateId();
  const timestamp = Date.now();
  
  return {
    id,
    project_code: `PRJ-${String(id).padStart(4, '0')}`,
    project_name: `测试项目${id}`,
    location: '测试地点',
    client_name: '测试客户',
    contractor: '测试承包商',
    supervisor: '测试监理',
    start_date: '2024-01-01',
    end_date: '2024-12-31',
    status: 'planning',
    created_at: timestamp,
    updated_at: timestamp,
    created_by: null,
    ...overrides
  };
};

/**
 * 创建模拟测孔数据
 * @param {Object} overrides - 覆盖字段
 * @returns {Object} 测孔数据
 */
const createMockHole = (overrides = {}) => {
  const id = overrides.id || generateId();
  const timestamp = Date.now();
  
  return {
    id,
    hole_number: `HOLE-${String(id).padStart(3, '0')}`,
    project_id: 1,
    hole_name: `测试测孔${id}`,
    hole_type: 'retaining_structure',
    location_description: '测试位置描述',
    coordinates: { latitude: 30.0, longitude: 120.0 },
    depth: 20.0,
    measurement_interval: 0.5,
    calculation_reference: 'bottom',
    warning_standard: 50.0,
    collection_method: 'manual',
    device_id: null,
    timer_enabled: false,
    timer_type: 'interval',
    timer_interval_minutes: null,
    fixed_times: null,
    timer_start_date: null,
    timer_end_date: null,
    status: 'active',
    last_measurement_time: null,
    next_scheduled_time: null,
    total_measurements: 0,
    warning_count: 0,
    created_at: timestamp,
    updated_at: timestamp,
    created_by: null,
    ...overrides
  };
};

/**
 * 创建模拟原始测量数据
 * @param {Object} overrides - 覆盖字段
 * @returns {Object} 原始测量数据
 */
const createMockRawData = (overrides = {}) => {
  const id = overrides.id || generateId();
  const timestamp = Date.now();
  
  return {
    id,
    measurement_uuid: `uuid-${timestamp}-${id}`,
    hole_id: 1,
    device_id: 1,
    measurement_time: timestamp,
    measurement_mode: 'manual',
    operator_id: 1,
    batch_number: `BATCH-${timestamp}`,
    depth: 0.5,
    positive_value: 5000,
    negative_value: -5000,
    temperature: 25.0,
    battery_voltage: 12.0,
    signal_strength: 80,
    data_status: 'raw',
    quality_flag: 'good',
    upload_time: timestamp,
    processed_time: null,
    ...overrides
  };
};

/**
 * 创建模拟处理结果数据
 * @param {Object} overrides - 覆盖字段
 * @returns {Object} 处理结果数据
 */
const createMockProcessedData = (overrides = {}) => {
  const id = overrides.id || generateId();
  const timestamp = Date.now();
  
  return {
    id,
    raw_data_id: 1,
    hole_id: 1,
    device_id: 1,
    measurement_time: timestamp,
    depth: 0.5,
    Y_average: 5000,
    inclination_angle: 0.005,
    depth_offset: 2.5,
    current_pipe_value: 2.5,
    initial_pipe_value: 0,
    cumulative_displacement: 2.5,
    previous_pipe_value: 0,
    current_displacement: 2.5,
    deformation_rate: 0.1,
    warning_level: 'normal',
    warning_message: '',
    processed_time: timestamp,
    ...overrides
  };
};

/**
 * 创建模拟报表数据
 * @param {Object} overrides - 覆盖字段
 * @returns {Object} 报表数据
 */
const createMockReport = (overrides = {}) => {
  const id = overrides.id || generateId();
  const timestamp = Date.now();
  const dateStr = new Date(timestamp).toISOString().split('T')[0];
  
  return {
    id,
    report_number: `RPT-${dateStr.replace(/-/g, '')}-${String(id).padStart(4, '0')}`,
    report_name: `测试报表${id}`,
    project_id: 1,
    report_type: 'daily',
    report_date: dateStr,
    period_start: dateStr,
    period_end: dateStr,
    summary: '测试报表摘要',
    hole_count: 5,
    measurement_count: 10,
    warning_count: 0,
    max_displacement: 5.0,
    file_format: 'pdf',
    file_path: '/reports/test.pdf',
    file_size: 1024,
    generated_by: 1,
    generated_at: timestamp,
    reviewed_by: null,
    reviewed_at: null,
    ...overrides
  };
};

/**
 * 创建模拟项目成员数据
 * @param {Object} overrides - 覆盖字段
 * @returns {Object} 项目成员数据
 */
const createMockProjectMember = (overrides = {}) => {
  const id = overrides.id || generateId();
  const timestamp = Date.now();
  
  return {
    id,
    project_id: 1,
    user_id: 1,
    project_role: 'member',
    join_date: new Date(timestamp).toISOString().split('T')[0],
    leave_date: null,
    is_active: true,
    created_at: timestamp,
    updated_at: timestamp,
    ...overrides
  };
};

/**
 * 创建模拟项目进度数据
 * @param {Object} overrides - 覆盖字段
 * @returns {Object} 项目进度数据
 */
const createMockProjectProgress = (overrides = {}) => {
  const id = overrides.id || generateId();
  const timestamp = Date.now();
  
  return {
    id,
    project_id: 1,
    progress_date: new Date(timestamp).toISOString().split('T')[0],
    progress_description: '测试进度描述',
    progress_percentage: 50.0,
    photo_urls: [],
    recorded_by: 1,
    created_at: timestamp,
    updated_at: timestamp,
    ...overrides
  };
};

/**
 * 创建模拟角色数据
 * @param {Object} overrides - 覆盖字段
 * @returns {Object} 角色数据
 */
const createMockRole = (overrides = {}) => {
  const id = overrides.id || generateId();
  const timestamp = Date.now();
  
  return {
    id,
    role_name: `role_${id}`,
    role_code: `ROLE_${id}`,
    description: `测试角色${id}`,
    is_system: false,
    created_at: timestamp,
    updated_at: timestamp,
    ...overrides
  };
};

/**
 * 创建模拟权限数据
 * @param {Object} overrides - 覆盖字段
 * @returns {Object} 权限数据
 */
const createMockPermission = (overrides = {}) => {
  const id = overrides.id || generateId();
  const timestamp = Date.now();
  
  return {
    id,
    permission_name: `permission_${id}`,
    permission_code: `PERM_${id}`,
    resource: 'test',
    action: 'read',
    description: `测试权限${id}`,
    created_at: timestamp,
    updated_at: timestamp,
    ...overrides
  };
};

/**
 * 创建批量测试数据
 * @param {Function} createFn - 创建函数
 * @param {number} count - 数量
 * @param {Object} baseData - 基础数据
 * @returns {Array} 数据数组
 */
const createBatchData = (createFn, count, baseData = {}) => {
  return Array.from({ length: count }, (_, index) => {
    return createFn({ ...baseData, index });
  });
};

/**
 * 登录请求数据
 */
const loginRequestData = {
  validUser: {
    username: 'testuser',
    password: 'password123'
  },
  invalidPassword: {
    username: 'testuser',
    password: 'wrongpassword'
  },
  nonExistentUser: {
    username: 'nonexistent',
    password: 'password123'
  },
  emptyFields: {
    username: '',
    password: ''
  }
};

/**
 * 注册请求数据
 */
const registerRequestData = {
  validUser: {
    username: 'newuser',
    email: 'newuser@example.com',
    password: 'password123',
    real_name: '新用户',
    phone: '13900139000'
  },
  missingFields: {
    username: 'incomplete'
  },
  duplicateUser: {
    username: 'existinguser',
    email: 'existing@example.com',
    password: 'password123'
  }
};

module.exports = {
  generateId,
  resetIdCounter,
  createMockUser,
  createMockDevice,
  createMockProject,
  createMockHole,
  createMockRawData,
  createMockProcessedData,
  createMockReport,
  createMockProjectMember,
  createMockProjectProgress,
  createMockRole,
  createMockPermission,
  createBatchData,
  loginRequestData,
  registerRequestData
};
