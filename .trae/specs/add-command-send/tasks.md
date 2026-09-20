# Tasks

- [x] Task 1: TCP服务器支持指令下发
  - [x] SubTask 1.1: Session类增加send方法，支持发送数据到客户端
  - [x] SubTask 1.2: TcpServer维护IMEI到Session的映射，支持按IMEI查找session
  - [x] SubTask 1.3: 提供sendCommand接口，通过IMEI发送指令

- [x] Task 2: 后端API实现指令发送
  - [x] SubTask 2.1: UpperDeviceController增加sendCommand方法
  - [x] SubTask 2.2: 添加路由 `POST /api/upper-devices/:id/send-command`
  - [x] SubTask 2.3: 验证设备在线状态，调用TCP服务器发送指令

- [x] Task 3: 前端指令发送功能
  - [x] SubTask 3.1: UpperDevices.vue增加"发送指令"按钮
  - [x] SubTask 3.2: 创建指令发送弹窗组件
  - [x] SubTask 3.3: 调用后端API发送指令并显示结果

- [x] Task 4: 指令发送日志记录
  - [x] SubTask 4.1: 使用OperationLog记录发送日志
  - [x] SubTask 4.2: 记录发送时间、指令内容、结果

# Task Dependencies
- [Task 2] depends on [Task 1]
- [Task 3] depends on [Task 2]
- [Task 4] depends on [Task 2]
