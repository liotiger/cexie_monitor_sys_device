/**
 * 测试辅助函数
 * 提供集成测试常用的辅助方法
 */

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'cexie-monitor-jwt-secret-2026';

/**
 * 创建模拟的请求对象
 * @param {Object} options - 请求选项
 * @returns {Object} 模拟请求对象
 */
const createMockRequest = (options = {}) => {
  const {
    body = {},
    params = {},
    query = {},
    user = null,
    headers = {},
    method = 'GET',
    path = '/'
  } = options;

  return {
    body,
    params,
    query,
    user,
    headers,
    method,
    path,
    get: (header) => headers[header.toLowerCase()]
  };
};

/**
 * 创建模拟的响应对象
 * @returns {Object} 模拟响应对象
 */
const createMockResponse = () => {
  const res = {};
  
  res.statusCode = 200;
  res._headers = {};
  res._body = null;
  res._statusCalled = false;
  res._statusValue = null;
  
  res.status = jest.fn((code) => {
    res._statusCalled = true;
    res._statusValue = code;
    res.statusCode = code;
    return res;
  });
  
  res.json = jest.fn((data) => {
    res._body = data;
    return res;
  });
  
  res.send = jest.fn((data) => {
    res._body = data;
    return res;
  });
  
  res.serverError = jest.fn((err) => {
    res._statusCalled = true;
    res._statusValue = 500;
    res.statusCode = 500;
    res._body = { success: false, message: err.message || '服务器错误' };
    return res;
  });
  
  res.set = jest.fn((key, value) => {
    res._headers[key] = value;
    return res;
  });
  
  res.setHeader = jest.fn((key, value) => {
    res._headers[key] = value;
    return res;
  });

  return res;
};

/**
 * 生成测试用的JWT Token
 * @param {Object} payload - Token载荷
 * @param {string} expiresIn - 过期时间
 * @returns {string} JWT Token
 */
const generateTestToken = (payload = {}, expiresIn = '24h') => {
  const defaultPayload = {
    id: 1,
    username: 'testuser',
    roles: ['user']
  };
  
  return jwt.sign(
    { ...defaultPayload, ...payload },
    JWT_SECRET,
    { expiresIn }
  );
};

/**
 * 验证JWT Token
 * @param {string} token - JWT Token
 * @returns {Object|null} 解码后的载荷
 */
const verifyTestToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
};

/**
 * 创建带有认证信息的请求
 * @param {Object} options - 请求选项
 * @param {Object} user - 用户信息
 * @returns {Object} 带认证的请求对象
 */
const createAuthenticatedRequest = (options = {}, user = {}) => {
  const defaultUser = {
    id: 1,
    username: 'testuser',
    roles: ['user']
  };
  
  return createMockRequest({
    ...options,
    user: { ...defaultUser, ...user }
  });
};

/**
 * 创建管理员请求
 * @param {Object} options - 请求选项
 * @returns {Object} 管理员请求对象
 */
const createAdminRequest = (options = {}) => {
  return createAuthenticatedRequest(options, {
    id: 1,
    username: 'admin',
    roles: ['admin']
  });
};

/**
 * 等待指定毫秒数
 * @param {number} ms - 毫秒数
 * @returns {Promise} Promise对象
 */
const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * 创建测试数据库连接模拟
 * @returns {Object} 数据库连接模拟对象
 */
const createMockDatabase = () => {
  const data = {
    users: [],
    devices: [],
    projects: [],
    holes: [],
    rawData: [],
    processedData: [],
    reports: []
  };
  
  let idCounter = 1;
  
  const generateId = () => idCounter++;
  
  return {
    data,
    generateId,
    reset: () => {
      Object.keys(data).forEach(key => {
        data[key] = [];
      });
      idCounter = 1;
    }
  };
};

/**
 * 断言响应成功
 * @param {Object} res - 响应对象
 * @param {number} expectedStatus - 预期状态码
 */
const assertSuccessResponse = (res, expectedStatus = 200) => {
  if (expectedStatus !== 200) {
    expect(res._statusCalled).toBe(true);
    expect(res._statusValue).toBe(expectedStatus);
  }
  expect(res.json).toHaveBeenCalled();
  const response = res._body || (res.json.mock.calls[0] && res.json.mock.calls[0][0]);
  expect(response).toBeDefined();
  expect(response.success).toBe(true);
  return response;
};

/**
 * 断言响应失败
 * @param {Object} res - 响应对象
 * @param {number} expectedStatus - 预期状态码
 * @param {string} expectedMessage - 预期错误消息
 */
const assertErrorResponse = (res, expectedStatus, expectedMessage = null) => {
  expect(res._statusCalled || res.serverError.mock.calls.length > 0).toBe(true);
  if (expectedStatus && res._statusValue) {
    expect(res._statusValue).toBe(expectedStatus);
  }
  expect(res.json).toHaveBeenCalled();
  const response = res._body || (res.json.mock.calls[0] && res.json.mock.calls[0][0]);
  expect(response).toBeDefined();
  expect(response.success).toBe(false);
  if (expectedMessage && response.message) {
    expect(response.message).toBe(expectedMessage);
  }
  return response;
};

/**
 * 创建分页查询参数
 * @param {Object} options - 分页选项
 * @returns {Object} 分页参数
 */
const createPaginationQuery = (options = {}) => {
  const {
    page = 1,
    limit = 10,
    search = '',
    status = ''
  } = options;
  
  const query = {};
  if (page) query.page = page;
  if (limit) query.limit = limit;
  if (search) query.search = search;
  if (status) query.status = status;
  
  return query;
};

/**
 * 验证分页响应格式
 * @param {Object} response - 响应数据
 */
const assertPaginationResponse = (response) => {
  expect(response.data).toHaveProperty('list');
  expect(response.data).toHaveProperty('pagination');
  expect(Array.isArray(response.data.list)).toBe(true);
  expect(response.data.pagination).toHaveProperty('page');
  expect(response.data.pagination).toHaveProperty('limit');
  expect(response.data.pagination).toHaveProperty('total');
  expect(response.data.pagination).toHaveProperty('totalPages');
};

module.exports = {
  createMockRequest,
  createMockResponse,
  generateTestToken,
  verifyTestToken,
  createAuthenticatedRequest,
  createAdminRequest,
  sleep,
  createMockDatabase,
  assertSuccessResponse,
  assertErrorResponse,
  createPaginationQuery,
  assertPaginationResponse
};
