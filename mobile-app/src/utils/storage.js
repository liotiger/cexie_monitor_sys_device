const TOKEN_KEY = 'token:client';
const USER_KEY = 'user:client';
const PROJECT_KEY = 'selectedProjectId';

export function getToken() {
  return uni.getStorageSync(TOKEN_KEY) || '';
}

export function setToken(token) {
  uni.setStorageSync(TOKEN_KEY, token || '');
}

export function clearToken() {
  uni.removeStorageSync(TOKEN_KEY);
}

export function getUser() {
  return uni.getStorageSync(USER_KEY) || null;
}

export function setUser(user) {
  if (user) {
    uni.setStorageSync(USER_KEY, user);
    return;
  }
  uni.removeStorageSync(USER_KEY);
}

export function clearUser() {
  uni.removeStorageSync(USER_KEY);
}

export function getSelectedProjectId() {
  const value = uni.getStorageSync(PROJECT_KEY);
  const id = parseInt(String(value || ''), 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export function setSelectedProjectId(projectId) {
  if (projectId === null || projectId === undefined || projectId === '') {
    uni.removeStorageSync(PROJECT_KEY);
    return;
  }
  uni.setStorageSync(PROJECT_KEY, String(projectId));
}

