/**
 * Jest 测试环境设置文件
 * 配置全局测试环境和模拟对象
 */

jest.setTimeout(10000);

global.mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.serverError = jest.fn().mockReturnValue(res);
  return res;
};

global.mockRequest = (body = {}, params = {}, query = {}, user = null) => {
  return {
    body,
    params,
    query,
    user
  };
};

const createMockModel = () => {
  const model = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
    updateOne: jest.fn(() => ({
      set: jest.fn().mockResolvedValue(null)
    })),
    update: jest.fn().mockResolvedValue([]),
    destroy: jest.fn().mockResolvedValue([]),
    destroyOne: jest.fn().mockResolvedValue(null),
    count: jest.fn().mockResolvedValue(0),
    sum: jest.fn().mockResolvedValue(0),
    avg: jest.fn().mockResolvedValue(0)
  };
  return model;
};

beforeAll(() => {
  global.User = createMockModel();
  global.Role = createMockModel();
  global.Permission = createMockModel();
  global.UserRole = createMockModel();
  global.RolePermission = createMockModel();
  global.Device = createMockModel();
  global.DeviceUsageLog = createMockModel();
  global.DeviceCalibrationLog = createMockModel();
  global.Project = createMockModel();
  global.ProjectProgress = createMockModel();
  global.ProjectMember = createMockModel();
  global.MonitoringHole = createMockModel();
  global.HoleBindingHistory = createMockModel();
  global.ScheduledTask = createMockModel();
  global.TaskExecutionLog = createMockModel();
  global.RawMeasurementData = createMockModel();
  global.MeasurementBatch = createMockModel();
  global.ProcessedResultData = createMockModel();
  global.DeformationCurve = createMockModel();
  global.MonitoringReport = createMockModel();
  global.SystemConfig = createMockModel();
  global.OperationLog = createMockModel();
  
  console.log('测试开始...');
});

afterAll(() => {
  console.log('测试结束...');
});

const resetModel = (model) => {
  model.find.mockResolvedValue([]);
  model.findOne.mockResolvedValue(null);
  model.create.mockResolvedValue({});
  model.updateOne.mockImplementation(() => ({
    set: jest.fn().mockResolvedValue(null)
  }));
  model.update.mockResolvedValue([]);
  model.destroy.mockResolvedValue([]);
  model.destroyOne.mockResolvedValue(null);
  model.count.mockResolvedValue(0);
  model.sum.mockResolvedValue(0);
  model.avg.mockResolvedValue(0);
};

beforeEach(() => {
  jest.clearAllMocks();
  
  if (global.User) resetModel(global.User);
  if (global.Role) resetModel(global.Role);
  if (global.Permission) resetModel(global.Permission);
  if (global.UserRole) resetModel(global.UserRole);
  if (global.RolePermission) resetModel(global.RolePermission);
  if (global.Device) resetModel(global.Device);
  if (global.Project) resetModel(global.Project);
  if (global.MonitoringHole) resetModel(global.MonitoringHole);
});
