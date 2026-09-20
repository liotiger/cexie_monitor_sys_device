# Checklist

## TCP服务器
- [x] Session类有send方法，可以向客户端发送数据
- [x] TcpServer维护IMEI到Session的映射
- [x] TcpServer提供sendCommand接口（通过HTTP API: POST /send-command）

## 后端API
- [x] POST /api/upper-devices/:id/send-command 路由已配置
- [x] sendCommand方法验证设备在线状态
- [x] sendCommand方法调用TCP服务器发送指令
- [x] 返回发送结果（成功/失败）

## 前端功能
- [x] 上位机列表有"发送指令"按钮
- [x] 离线设备按钮禁用
- [x] 点击按钮弹出指令输入窗口
- [x] 窗口有指令输入框和发送按钮
- [x] 发送后显示结果提示
- [x] 发送成功/失败有明确提示

## 日志记录
- [x] 指令发送操作有日志记录（OperationLog表）
