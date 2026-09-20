const baseRoutes = {
  'GET /': function(req, res) {
    return res.json({
      name: '测斜监测客户端业务服务',
      version: '1.0.0',
      service_role: 'client',
      status: 'running'
    });
  },
  
  'POST /api/auth/login': 'AuthController.login',
  'POST /api/auth/register': 'AuthController.register',
  'POST /api/auth/logout': 'AuthController.logout',
  'GET /api/auth/me': 'AuthController.me',
  'GET /api/client/auth/helper': 'AuthController.clientHelper',
  'POST /api/admin/task-callback': 'AdminCallbackController.receiveTaskCallback',
  
  'GET /api/users': 'UserController.find',
  'GET /api/users/:id': 'UserController.findOne',
  'POST /api/users': 'UserController.create',
  'PUT /api/users/:id': 'UserController.update',
  'DELETE /api/users/:id': 'UserController.destroy',

  'GET /api/roles': 'RoleController.find',
  'GET /api/roles/:id': 'RoleController.findOne',
  'POST /api/roles': 'RoleController.create',
  'PUT /api/roles/:id': 'RoleController.update',
  'DELETE /api/roles/:id': 'RoleController.destroy',

  'GET /api/dashboard/stats': 'DashboardController.stats',
  'GET /api/dashboard/recent-measurements': 'DashboardController.recentMeasurements',
  'GET /api/dashboard/alerts': 'DashboardController.alerts',
  'GET /api/dashboard/recent-devices': 'DashboardController.recentDevices',
  
  'GET /api/permissions': 'PermissionController.find',
  'GET /api/permissions/:id': 'PermissionController.findOne',
  'POST /api/permissions': 'PermissionController.create',
  'PUT /api/permissions/:id': 'PermissionController.update',
  'DELETE /api/permissions/:id': 'PermissionController.destroy',

  'POST /api/user-roles/assign': 'UserRoleController.assign',
  'POST /api/user-roles/remove': 'UserRoleController.remove',
  'GET /api/user-roles/user/:userId': 'UserRoleController.findByUser',
  'GET /api/user-roles/role/:roleId': 'UserRoleController.findByRole',

  'POST /api/role-permissions/assign': 'RolePermissionController.assign',
  'POST /api/role-permissions/remove': 'RolePermissionController.remove',
  'GET /api/role-permissions/role/:roleId': 'RolePermissionController.findByRole',
  'GET /api/role-permissions/permission/:permissionId': 'RolePermissionController.findByPermission',

  'GET /api/devices': 'DeviceController.find',
  'GET /api/devices/:id': 'DeviceController.findOne',
  'POST /api/devices': 'DeviceController.create',
  'PUT /api/devices/:id': 'DeviceController.update',
  'DELETE /api/devices/:id': 'DeviceController.destroy',
  'POST /api/devices/:id/bind': 'DeviceController.bindHole',
  'POST /api/devices/:id/unbind': 'DeviceController.unbindHole',

  'GET /api/projects': 'ProjectController.find',
  'GET /api/projects/:id': 'ProjectController.findOne',
  'POST /api/projects': 'ProjectController.create',
  'PUT /api/projects/:id': 'ProjectController.update',
  'DELETE /api/projects/:id': 'ProjectController.destroy',

  'GET /api/projects/:projectId/progress': 'ProjectProgressController.find',
  'POST /api/projects/:projectId/progress': 'ProjectProgressController.create',
  'GET /api/project-progress/:id': 'ProjectProgressController.findOne',
  'PUT /api/project-progress/:id': 'ProjectProgressController.update',
  'DELETE /api/project-progress/:id': 'ProjectProgressController.destroy',

  'GET /api/projects/:projectId/members': 'ProjectMemberController.find',
  'POST /api/projects/:projectId/members': 'ProjectMemberController.add',
  'PUT /api/project-members/:id': 'ProjectMemberController.update',
  'DELETE /api/project-members/:id': 'ProjectMemberController.remove',
  'GET /api/users/:userId/projects': 'ProjectMemberController.findByUser',

  'GET /api/device-usage-logs': 'DeviceUsageLogController.find',
  'GET /api/device-usage-logs/stats': 'DeviceUsageLogController.stats',
  'GET /api/device-usage-logs/:id': 'DeviceUsageLogController.findOne',
  'POST /api/device-usage-logs': 'DeviceUsageLogController.create',
  'PUT /api/device-usage-logs/:id/end': 'DeviceUsageLogController.end',
  'GET /api/devices/:id/usage-logs': 'DeviceUsageLogController.findByDevice',

  'GET /api/device-calibration-logs': 'DeviceCalibrationLogController.find',
  'GET /api/device-calibration-logs/:id': 'DeviceCalibrationLogController.findOne',
  'POST /api/device-calibration-logs': 'DeviceCalibrationLogController.create',
  'PUT /api/device-calibration-logs/:id': 'DeviceCalibrationLogController.update',
  'PUT /api/device-calibration-logs/:id/review': 'DeviceCalibrationLogController.review',
  'GET /api/devices/:id/calibration-logs': 'DeviceCalibrationLogController.findByDevice',

  'GET /api/monitoring-holes': 'MonitoringHoleController.find',
  'GET /api/monitoring-holes/stats': 'MonitoringHoleController.stats',
  'POST /api/monitoring-holes': 'MonitoringHoleController.create',
  'PUT /api/monitoring-holes/:id': 'MonitoringHoleController.update',
  'DELETE /api/monitoring-holes/:id': 'MonitoringHoleController.destroy',
  'PUT /api/monitoring-holes/:id/timer': 'MonitoringHoleController.setTimer',
  'POST /api/monitoring-holes/:id/bind-device': 'MonitoringHoleController.bindDevice',
  'POST /api/monitoring-holes/:id/unbind-device': 'MonitoringHoleController.unbindDevice',
  // 修复说明：客户端已下线独立测孔详情页，这里同步移除仅供详情页读取单孔和预警历史的 GET 接口，避免继续暴露无页面入口的详情能力。
  'GET /api/projects/:id/holes': 'MonitoringHoleController.findByProject',

  'GET /api/scheduled-tasks': 'ScheduledTaskController.find',
  'GET /api/scheduled-tasks/:id': 'ScheduledTaskController.findOne',
  'POST /api/scheduled-tasks': 'ScheduledTaskController.create',
  'PUT /api/scheduled-tasks/:id': 'ScheduledTaskController.update',
  'DELETE /api/scheduled-tasks/:id': 'ScheduledTaskController.destroy',
  'PUT /api/scheduled-tasks/:id/enable': 'ScheduledTaskController.enable',
  'PUT /api/scheduled-tasks/:id/disable': 'ScheduledTaskController.disable',
  'GET /api/scheduled-tasks/:id/logs': 'ScheduledTaskController.executionLogs',

  'GET /api/task-execution-logs': 'TaskExecutionLogController.find',
  'GET /api/task-execution-logs/:id': 'TaskExecutionLogController.findOne',
  'POST /api/task-execution-logs': 'TaskExecutionLogController.create',
  'GET /api/task-execution-logs/stats': 'TaskExecutionLogController.stats',

  'GET /api/monitoring-holes/:id/tasks': 'ScheduledTaskController.find',

  'GET /api/hole-binding-history': 'HoleBindingHistoryController.find',
  'GET /api/hole-binding-history/:id': 'HoleBindingHistoryController.findOne',
  'GET /api/monitoring-holes/:id/binding-history': 'HoleBindingHistoryController.findByHole',
  'GET /api/monitoring-holes/:id/current-binding': 'HoleBindingHistoryController.getCurrentBinding',
  'GET /api/devices/:id/binding-history': 'HoleBindingHistoryController.findByDevice',

  'GET /api/processed-result-data': 'ProcessedResultDataController.find',
  'GET /api/processed-result-data/:id': 'ProcessedResultDataController.findOne',
  'POST /api/processed-result-data/process': 'ProcessedResultDataController.process',
  'GET /api/monitoring-holes/:id/processed-results': 'ProcessedResultDataController.findByHole',
  'POST /api/processed-result-data/generate-curve': 'ProcessedResultDataController.generateCurve',

  'GET /api/results': 'ProcessedResultDataController.find',
  // 修复说明：新增成果趋势图查询入口，必须放在 /api/results/:id 之前，避免被动态路由误匹配成详情接口。
  'GET /api/results/trends': 'ProcessedResultDataController.findTrends',
  'GET /api/results/:id': 'ProcessedResultDataController.findOne',
  'GET /api/results/:id/all-details': 'ProcessedResultDataController.findAllDetails',

  'GET /api/deformation-curves': 'DeformationCurveController.find',
  'GET /api/deformation-curves/:id': 'DeformationCurveController.findOne',
  'POST /api/deformation-curves/generate': 'DeformationCurveController.generate',
  'GET /api/monitoring-holes/:id/curves': 'DeformationCurveController.findByHole',

  'GET /api/monitoring-reports': 'MonitoringReportController.find',
  'GET /api/monitoring-reports/:id': 'MonitoringReportController.findOne',
  'POST /api/monitoring-reports': 'MonitoringReportController.create',
  'POST /api/monitoring-reports/generate': 'MonitoringReportController.generate',
  'PUT /api/monitoring-reports/:id/review': 'MonitoringReportController.review',

  'GET /api/reports': 'MonitoringReportController.find',
  'GET /api/reports/:id': 'MonitoringReportController.findOne',
  'POST /api/reports': 'MonitoringReportController.create',
  'POST /api/reports/:id/generate': 'MonitoringReportController.generate',
  'PUT /api/reports/:id/review': 'MonitoringReportController.review',
  'GET /api/reports/:id/download': 'MonitoringReportController.download',
  'DELETE /api/reports/:id': 'MonitoringReportController.destroy',

  'GET /api/raw-measurement-data': 'RawMeasurementDataController.find',
  'GET /api/raw-measurement-data/:id': 'RawMeasurementDataController.findOne',
  'POST /api/raw-measurement-data': 'RawMeasurementDataController.create',
  'POST /api/raw-measurement-data/batch': 'RawMeasurementDataController.batchCreate',
  'PUT /api/raw-measurement-data/:id/status': 'RawMeasurementDataController.updateStatus',
  'GET /api/raw-measurement-data/batch/:batch_number': 'RawMeasurementDataController.findByBatch',
  'GET /api/raw-measurement-data/export': 'RawMeasurementDataController.export',

  'GET /api/raw-data': 'RawMeasurementDataController.find',
  'GET /api/raw-data/:id': 'RawMeasurementDataController.findOne',
  'POST /api/raw-data': 'RawMeasurementDataController.create',
  'PUT /api/raw-data/:id/status': 'RawMeasurementDataController.updateStatus',
  'POST /api/raw-data/set-initial-pipe': 'RawMeasurementDataController.setInitialPipeValue',
  'GET /api/raw-data/export': 'RawMeasurementDataController.export',

  'GET /api/measurement-batches': 'MeasurementBatchController.find',
  'GET /api/measurement-batches/:id': 'MeasurementBatchController.findOne',
  'POST /api/measurement-batches': 'MeasurementBatchController.create',
  'PUT /api/measurement-batches/:id/complete': 'MeasurementBatchController.complete',
  'PUT /api/measurement-batches/:id/abort': 'MeasurementBatchController.abort',
  'GET /api/monitoring-holes/:id/batches': 'MeasurementBatchController.findByHole',

  'GET /api/upper-devices': 'UpperDeviceController.find',
  'GET /api/upper-devices/online': 'UpperDeviceController.getOnlineList',
  'POST /api/upper-devices/sync-admin': 'UpperDeviceController.syncFromAdmin',
  'GET /api/upper-devices/imei/:imei': 'UpperDeviceController.getByImei',
  // 修复说明：快捷指令路由必须放在 GET /api/upper-devices/:id 之前，避免被动态参数路由抢先匹配
  'POST /api/upper-devices/:id/start-monitor': 'UpperDeviceController.startMonitor',
  'POST /api/upper-devices/:id/home-move': 'UpperDeviceController.homeMove',
  'POST /api/upper-devices/:id/bottom-test': 'UpperDeviceController.bottomTest',
  'POST /api/upper-devices/:id/status-check': 'UpperDeviceController.statusCheck',
  'GET /api/upper-devices/:id/latest-monitor-task': 'UpperDeviceController.getLatestMonitorTask',
  'GET /api/upper-devices/:id/monitor-tasks': 'UpperDeviceController.getMonitorTasks',
  'GET /api/monitor-tasks/:taskId': 'UpperDeviceController.getMonitorTask',
  'POST /api/monitor-tasks/:taskId/cancel': 'UpperDeviceController.cancelMonitorTask',
  'GET /api/upper-devices/:id/bindings': 'UpperDeviceController.getBindings',
  'GET /api/upper-devices/:id': 'UpperDeviceController.findOne',
  'PUT /api/upper-devices/:id': 'UpperDeviceController.update',
  'DELETE /api/upper-devices/:id': 'UpperDeviceController.destroy',

  'GET /api/lower-devices': 'LowerDeviceController.find',
  'POST /api/lower-devices/sync-admin': 'LowerDeviceController.syncFromAdmin',
  'GET /api/lower-devices/:id': 'LowerDeviceController.findOne',
  'PUT /api/lower-devices/:id': 'LowerDeviceController.update',
  'DELETE /api/lower-devices/:id': 'LowerDeviceController.destroy',
  'PUT /api/lower-devices/:id/bind-hole': 'LowerDeviceController.bindHole',
  'PUT /api/lower-devices/:id/unbind-hole': 'LowerDeviceController.unbindHole',
  'GET /api/lower-devices/:id/bindings': 'LowerDeviceController.getBindings',

  'GET /api/device-bindings': 'DeviceBindingController.find',
  'POST /api/device-bindings': 'DeviceBindingController.create',
  'PUT /api/device-bindings/:id': 'DeviceBindingController.update',
  'DELETE /api/device-bindings/:id': 'DeviceBindingController.destroy',
  'GET /api/device-bindings/upper/:upper_device_id': 'DeviceBindingController.getActiveByUpperDevice',
  'GET /api/device-bindings/lower/:lower_device_id': 'DeviceBindingController.getActiveByLowerDevice',

  'GET /api/system-config': 'SystemConfigController.find',
  'GET /api/system-config/:id': 'SystemConfigController.findOne',
  'GET /api/system-config/key/:key': 'SystemConfigController.get',
  'POST /api/system-config': 'SystemConfigController.create',
  'PUT /api/system-config/:id': 'SystemConfigController.update',
  'POST /api/system-config/upsert': 'SystemConfigController.upsert',
  'DELETE /api/system-config/:id': 'SystemConfigController.destroy',

  'GET /api/operation-logs': 'OperationLogController.find',
  'GET /api/operation-logs/stats': 'OperationLogController.stats',
  'GET /api/operation-logs/:id': 'OperationLogController.findOne',
  'POST /api/operation-logs': 'OperationLogController.create',
  'GET /api/users/:id/operation-logs': 'OperationLogController.findByUser',
};

function buildAppRoutes(routes) {
  const appRoutes = {};

  Object.keys(routes).forEach((routeKey) => {
    const spaceIndex = routeKey.indexOf(' ');
    if (spaceIndex <= 0) {
      return;
    }

    const method = routeKey.slice(0, spaceIndex);
    const pathname = routeKey.slice(spaceIndex + 1);
    if (!pathname.startsWith('/api/')) {
      return;
    }

    const appKey = `${method} ${pathname.replace(/^\/api\//, '/api/app/')}`;
    if (appKey === routeKey || appRoutes[appKey]) {
      return;
    }

    appRoutes[appKey] = routes[routeKey];
  });

  return appRoutes;
}

module.exports.routes = {
  ...baseRoutes,
  ...buildAppRoutes(baseRoutes)
};
