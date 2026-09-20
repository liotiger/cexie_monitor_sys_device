import { API_BASE_URL, API_PREFIX } from '../config';
import { getToken } from './storage';
import { logout } from './auth';

function buildQuery(params) {
  const source = params || {};
  const items = [];
  Object.keys(source).forEach((key) => {
    const value = source[key];
    if (value === undefined || value === null || value === '') {
      return;
    }
    items.push([key, value]);
  });
  if (items.length === 0) {
    return '';
  }
  return `?${items.map(item => `${encodeURIComponent(item[0])}=${encodeURIComponent(String(item[1]))}`).join('&')}`;
}

function normalizePath(path) {
  if (!path) {
    return API_PREFIX;
  }
  return path.startsWith('/') ? `${API_PREFIX}${path}` : `${API_PREFIX}/${path}`;
}

function buildUrl(path, params) {
  const baseUrl = String(API_BASE_URL || '').replace(/\/$/, '');
  return `${baseUrl}${normalizePath(path)}${buildQuery(params)}`;
}

export function request(options) {
  const opts = options || {};
  const method = String(opts.method || 'GET').toUpperCase();
  const url = buildUrl(opts.path || '/', opts.params);
  const token = getToken();
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'X-Api-Target': 'client',
  };
  if (opts.headers) {
    Object.keys(opts.headers).forEach((key) => {
      headers[key] = opts.headers[key];
    });
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return new Promise((resolve, reject) => {
    uni.request({
      url,
      method,
      data: opts.data || undefined,
      header: headers,
      timeout: 15000,
      success: (res) => {
        const statusCode = res && res.statusCode;
        const body = res && res.data;
        const isAuthApi = typeof opts.path === 'string' && opts.path.indexOf('/auth/') === 0;

        if (statusCode === 401 && !isAuthApi) {
          logout({ silent: true });
          reject(new Error('未登录或登录已过期'));
          return;
        }

        if (statusCode && statusCode >= 400) {
          reject(new Error((body && body.message) || `请求失败(${statusCode})`));
          return;
        }

        if (body && body.success === false) {
          reject(new Error(body.message || '请求失败'));
          return;
        }

        resolve(body);
      },
      fail: (err) => {
        reject(new Error((err && err.errMsg) || '网络请求失败'));
      }
    });
  });
}
