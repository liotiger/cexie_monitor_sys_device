# 上位机指令发送功能 Spec

## Why
当前上位机管理页面只能查看和管理设备信息，无法主动向设备发送指令。运维人员需要能够通过TCP连接向下位机发送自定义指令，实现远程控制、参数配置、固件升级等操作。

## What Changes
- 上位机管理列表增加"发送指令"按钮
- 新增指令发送弹窗组件，支持输入自定义指令
- 后端新增指令发送API，通过TCP连接下发指令到设备
- TCP服务器支持指令下发功能

## Impact
- Affected specs: 上位机管理、TCP服务器
- Affected code: 
  - `frontend/src/views/UpperDevices.vue`
  - `backend/api/controllers/UpperDeviceController.js`
  - `tcp-server/lib/TcpServer.js`
  - `tcp-server/lib/Session.js`

## ADDED Requirements

### Requirement: 指令发送功能
系统应允许管理员通过上位机管理页面向在线设备发送自定义指令。

#### Scenario: 发送指令成功
- **GIVEN** 上位机设备在线
- **WHEN** 管理员点击"发送指令"按钮，输入指令内容并点击发送
- **THEN** 系统通过TCP连接将指令发送到设备，并显示发送结果

#### Scenario: 设备离线
- **GIVEN** 上位机设备离线
- **WHEN** 管理员点击"发送指令"按钮
- **THEN** 系统提示"设备离线，无法发送指令"

#### Scenario: 指令发送失败
- **GIVEN** 上位机设备在线
- **WHEN** 管理员发送指令但TCP连接异常
- **THEN** 系统显示发送失败信息

### Requirement: 指令格式
系统应支持发送符合TCP协议规范的文本指令。

#### Scenario: 指令格式
- **WHEN** 管理员输入指令内容
- **THEN** 系统将指令内容通过TCP连接发送到设备

### Requirement: 发送历史记录
系统应记录指令发送历史，便于追溯。

#### Scenario: 记录发送历史
- **WHEN** 指令发送成功或失败
- **THEN** 系统记录发送时间、指令内容、发送结果

## MODIFIED Requirements

### Requirement: 上位机管理页面
在上位机列表操作栏增加"发送指令"按钮，仅对在线设备可用。

## Technical Design

### 前端实现
1. UpperDevices.vue 增加"发送指令"按钮和弹窗
2. 弹窗包含指令输入框和发送按钮
3. 调用后端API发送指令

### 后端实现
1. 新增 `POST /api/upper-devices/:id/send-command` API
2. 通过Session ID找到对应的TCP连接
3. 通过TCP连接发送指令

### TCP服务器实现
1. Session类增加发送数据的方法
2. TcpServer维护session映射，支持按IMEI查找session
3. 提供发送指令的接口
