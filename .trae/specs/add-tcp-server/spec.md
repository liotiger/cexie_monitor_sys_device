# TCP数据接收服务规范

## Why
测斜仪设备通过DTU（数据传输单元）进行通讯，需要建立一个独立的TCP服务来接收设备上传的测量数据，并将数据写入原始数据库表。该服务作为独立进程运行，与主后端服务解耦，提高系统的可扩展性和稳定性。

## What Changes
- 新增独立的TCP服务模块（tcp-server目录）
- 实现TCP Socket服务器，监听设备连接
- 实现DTU协议解析，支持设备注册、心跳、数据上报
- 实现数据验证和存储逻辑
- 实现设备连接管理和状态同步
- 实现与主数据库的交互
- 添加TCP服务配置和启动脚本

## Impact
- Affected specs: 设备管理、原始数据管理
- Affected code: 
  - 新增: tcp-server/* (独立TCP服务)
  - 数据库: raw_measurement_data表、devices表

## ADDED Requirements

### Requirement: TCP服务器启动与监听
系统应提供独立的TCP服务器，监听指定端口接收设备连接。

#### Scenario: TCP服务启动成功
- **WHEN** 启动TCP服务
- **THEN** 服务在配置的端口上监听，并输出启动日志

#### Scenario: 设备连接建立
- **WHEN** DTU设备发起TCP连接
- **THEN** 服务器接受连接并创建连接会话

### Requirement: DTU协议解析
系统应支持DTU设备通讯协议的解析。

#### Scenario: 设备注册包解析
- **WHEN** 收到设备注册包
- **THEN** 解析设备ID，验证设备合法性，返回注册响应

#### Scenario: 心跳包处理
- **WHEN** 收到设备心跳包
- **THEN** 更新设备在线状态，返回心跳响应

#### Scenario: 测量数据包解析
- **WHEN** 收到测量数据包
- **THEN** 解析数据内容，验证数据格式，存储到数据库

### Requirement: 设备连接管理
系统应管理所有设备的连接状态。

#### Scenario: 设备上线
- **WHEN** 设备成功注册
- **THEN** 更新设备在线状态为online，记录连接时间

#### Scenario: 设备离线
- **WHEN** 设备断开连接或心跳超时
- **THEN** 更新设备在线状态为offline，记录断开时间

### Requirement: 数据存储
系统应将接收的测量数据存储到原始数据表。

#### Scenario: 数据存储成功
- **WHEN** 收到有效的测量数据
- **THEN** 数据写入raw_measurement_data表，更新设备统计信息

#### Scenario: 数据验证失败
- **WHEN** 收到无效的测量数据
- **THEN** 记录错误日志，不写入数据库，返回错误响应

### Requirement: 配置管理
系统应支持通过配置文件管理TCP服务参数。

#### Scenario: 读取配置
- **WHEN** TCP服务启动
- **THEN** 从配置文件读取端口、超时时间、数据库连接等参数

## MODIFIED Requirements
无修改的需求。

## REMOVED Requirements
无移除的需求。
