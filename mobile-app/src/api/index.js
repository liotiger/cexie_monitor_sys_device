import { request } from '../utils/request';

export const authApi = {
  login(payload) {
    return request({ path: '/auth/login', method: 'POST', data: payload });
  },
  me() {
    return request({ path: '/auth/me', method: 'GET' });
  },
  logout() {
    return request({ path: '/auth/logout', method: 'POST' });
  }
};

export const dashboardApi = {
  stats() {
    return request({ path: '/dashboard/stats', method: 'GET' });
  },
  alerts(params) {
    return request({ path: '/dashboard/alerts', method: 'GET', params });
  },
  recentMeasurements(params) {
    return request({ path: '/dashboard/recent-measurements', method: 'GET', params });
  }
};

export const projectApi = {
  list(params) {
    return request({ path: '/projects', method: 'GET', params });
  },
  detail(id) {
    return request({ path: `/projects/${id}`, method: 'GET' });
  },
  holes(projectId) {
    return request({ path: `/projects/${projectId}/holes`, method: 'GET' });
  }
};

export const holeApi = {
  list(params) {
    return request({ path: '/monitoring-holes', method: 'GET', params });
  },
  createHole(data) {
    return request({ path: '/monitoring-holes', method: 'POST', data });
  },
  updateHole(id, data) {
    return request({ path: `/monitoring-holes/${id}`, method: 'PUT', data });
  },
  stats(params) {
    return request({ path: '/monitoring-holes/stats', method: 'GET', params });
  },
  tasks(holeId, params) {
    return request({ path: `/monitoring-holes/${holeId}/tasks`, method: 'GET', params });
  },
  processedResults(holeId, params) {
    return request({ path: `/monitoring-holes/${holeId}/processed-results`, method: 'GET', params });
  },
  bindDevice(holeId, data) {
    return request({ path: `/monitoring-holes/${holeId}/bind-device`, method: 'POST', data });
  }
};

export const resultsApi = {
  trends(params) {
    return request({ path: '/results/trends', method: 'GET', params });
  },
  list(params) {
    return request({ path: '/results', method: 'GET', params });
  }
};

export const rawDataApi = {
  list(params) {
    return request({ path: '/raw-data', method: 'GET', params });
  }
};

export const reportsApi = {
  list(params) {
    return request({ path: '/reports', method: 'GET', params });
  },
  detail(id) {
    return request({ path: `/reports/${id}`, method: 'GET' });
  },
  download(id) {
    return request({ path: `/reports/${id}/download`, method: 'GET' });
  }
};

export const upperDeviceApi = {
  list(params) {
    return request({ path: '/upper-devices', method: 'GET', params });
  },
  detail(id) {
    return request({ path: `/upper-devices/${id}`, method: 'GET' });
  },
  startMonitor(id, data) {
    return request({ path: `/upper-devices/${id}/start-monitor`, method: 'POST', data });
  },
  homeMove(id) {
    return request({ path: `/upper-devices/${id}/home-move`, method: 'POST' });
  },
  bottomTest(id) {
    return request({ path: `/upper-devices/${id}/bottom-test`, method: 'POST' });
  },
  statusCheck(id) {
    return request({ path: `/upper-devices/${id}/status-check`, method: 'POST' });
  },
  monitorTasks(id, params) {
    return request({ path: `/upper-devices/${id}/monitor-tasks`, method: 'GET', params });
  }
};
