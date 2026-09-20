import { clearToken, clearUser, getToken } from './storage';

export function isAuthed() {
  return Boolean(getToken());
}

export function logout(options) {
  const silent = Boolean(options && options.silent);
  clearToken();
  clearUser();
  if (!silent) {
    uni.showToast({ title: '已退出登录', icon: 'none' });
  }
  uni.reLaunch({ url: '/pages/login/index' });
}

export function ensureAuthRedirect() {
  if (isAuthed()) {
    return;
  }
  const pages = getCurrentPages();
  const current = pages.length ? pages[pages.length - 1] : null;
  const route = current && current.route ? `/${current.route}` : '';
  if (route && route.indexOf('/pages/login/index') >= 0) {
    return;
  }
  uni.reLaunch({ url: '/pages/login/index' });
}
