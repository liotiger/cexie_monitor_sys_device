# 上位机与下位机分离管理规格说明

## 1. 概述

### 1.1 背景
当前系统将上位机（DTU数据传输单元）和下位机（测斜仪设备）混合在同一个设备表中管理，导致：
- 设备属性混淆，DTU的网络属性与测斜仪的测量属性混在一起
- 无法准确追踪设备间的绑定关系
- 设备状态管理不清晰

### 1.2 目标
将上位机和下位机分离为两个独立的表进行管理，通过关联表建立绑定关系，实现：
- 清晰的设备分类管理
- 准确的设备属性定义
- 灵活的设备绑定机制

## 2. 设备定义

### 2.1 上位机（Upper Device / DTU）
- **定义**：数据传输单元（DTU），负责与服务器进行TCP通信
- **主要功能**：
  - 建立TCP连接
  - 发送注册包（ZC+IMEI）
  - 发送心跳包（HB+IMEI）
  - 透传下位机业务数据（SJ+...）
- **关键属性**：
  - IMEI号（唯一标识）
  - 网络状态（在线/离线）
  - IP地址
  - 信号强度
  - 最后在线时间

### 2.2 下位机（Lower Device / Inclinometer）
- **定义**：测斜仪设备，负责采集测量数据
- **主要功能**：
  - 采集深度数据
  - 采集正测值、反测值（AD转换原始值）
  - 通过串口（TTL/RS485）与上位机通信
- **关键属性**：
  - 设备编号（唯一标识）
  - K值、β值（校准参数）
  - 校准信息（校准日期、有效期、校准机构）
  - 当前绑定的测孔
  - 测量统计信息

## 3. 数据库设计

### 3.1 上位机表（upper_devices）

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | INT | 主键，自增 |
| imei | VARCHAR(20) | IMEI号，唯一标识 |
| device_name | VARCHAR(100) | 设备名称 |
| manufacturer | VARCHAR(100) | 生产厂商 |
| model | VARCHAR(50) | 设备型号 |
| serial_number | VARCHAR(100) | 序列号 |
| network_status | ENUM | 网络状态：online/offline |
| last_online_time | TIMESTAMP | 最后在线时间 |
| ip_address | VARCHAR(45) | IP地址 |
| signal_strength | DECIMAL(6,2) | 信号强度 |
| firmware_version | VARCHAR(50) | 固件版本 |
| status | ENUM | 设备状态：idle/active/maintenance/fault |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

### 3.2 下位机表（lower_devices）

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | INT | 主键，自增 |
| device_code | VARCHAR(50) | 设备编号，唯一标识 |
| device_name | VARCHAR(100) | 设备名称 |
| manufacturer | VARCHAR(100) | 生产厂商 |
| model | VARCHAR(50) | 设备型号 |
| serial_number | VARCHAR(100) | 序列号 |
| k_value | DECIMAL(10,6) | K值（校准参数） |
| beta_value | DECIMAL(10,6) | β值（校准参数） |
| calibration_date | DATE | 校准日期 |
| calibration_org | VARCHAR(100) | 校准机构 |
| valid_until | DATE | 校准有效期至 |
| calibration_status | ENUM | 校准状态：valid/expired/pending |
| current_hole_id | INT | 当前绑定的测孔ID |
| current_project_id | INT | 当前绑定的项目ID |
| total_measurement_count | INT | 累计测量次数 |
| total_measurement_depth | DECIMAL(12,2) | 累计测量深度 |
| status | ENUM | 设备状态：idle/measuring/maintenance/fault/calibrating |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

### 3.3 设备绑定关联表（device_bindings）

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | INT | 主键，自增 |
| upper_device_id | INT | 上位机ID，外键 |
| lower_device_id | INT | 下位机ID，外键 |
| binding_type | ENUM | 绑定类型：permanent/temporary |
| status | ENUM | 绑定状态：active/inactive |
| bind_time | TIMESTAMP | 绑定时间 |
| unbind_time | TIMESTAMP | 解绑时间 |
| created_at | TIMESTAMP | 创建时间 |

### 3.4 ER关系图

```
┌─────────────────┐     ┌─────────────────────┐     ┌─────────────────┐
│  upper_devices  │     │   device_bindings   │     │  lower_devices  │
├─────────────────┤     ├─────────────────────┤     ├─────────────────┤
│ id              │◄────│ upper_device_id     │     │ id              │
│ imei            │     │ lower_device_id     │────►│ device_code     │
│ device_name     │     │ binding_type        │     │ device_name     │
│ network_status  │     │ status              │     │ k_value         │
│ last_online_time│     │ bind_time           │     │ beta_value      │
│ ...             │     │ unbind_time         │     │ calibration_... │
└─────────────────┘     └─────────────────────┘     │ current_hole_id │
                                                    │ ...             │
                                                    └─────────────────┘
```

## 4. API设计

### 4.1 上位机管理API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/upper-devices | 获取上位机列表 |
| GET | /api/upper-devices/:id | 获取上位机详情 |
| POST | /api/upper-devices | 创建上位机 |
| PUT | /api/upper-devices/:id | 更新上位机 |
| DELETE | /api/upper-devices/:id | 删除上位机 |
| GET | /api/upper-devices/:id/bindings | 获取上位机绑定的下位机 |
| GET | /api/upper-devices/online | 获取在线上位机列表 |

### 4.2 下位机管理API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/lower-devices | 获取下位机列表 |
| GET | /api/lower-devices/:id | 获取下位机详情 |
| POST | /api/lower-devices | 创建下位机 |
| PUT | /api/lower-devices/:id | 更新下位机 |
| DELETE | /api/lower-devices/:id | 删除下位机 |
| GET | /api/lower-devices/:id/bindings | 获取下位机绑定的上位机 |
| PUT | /api/lower-devices/:id/bind-hole | 绑定测孔 |
| PUT | /api/lower-devices/:id/unbind-hole | 解绑测孔 |

### 4.3 设备绑定API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/device-bindings | 创建设备绑定 |
| DELETE | /api/device-bindings/:id | 解除设备绑定 |
| GET | /api/device-bindings | 获取绑定列表 |
| PUT | /api/device-bindings/:id | 更新绑定状态 |

## 5. TCP通信处理变更

### 5.1 注册包处理
- 解析IMEI号，在 `upper_devices` 表中查找或创建记录
- 更新上位机的网络状态为在线
- 记录IP地址和连接时间

### 5.2 心跳包处理
- 解析IMEI号，更新 `upper_devices` 表中的 `last_online_time`
- 保持网络状态为在线

### 5.3 业务数据包处理
- 解析IMEI号，找到对应的上位机
- 通过 `device_bindings` 表查找绑定的下位机
- 将测量数据关联到下位机
- 更新下位机的测量统计信息

## 6. 前端页面变更

### 6.1 设备管理页面
- 分离为"上位机管理"和"下位机管理"两个独立页面
- 上位机管理页面：显示网络状态、在线时间、信号强度等
- 下位机管理页面：显示校准信息、测量统计、测孔绑定等

### 6.2 设备绑定页面
- 新增设备绑定管理页面
- 支持上位机与下位机的绑定/解绑操作
- 显示当前绑定关系列表

## 7. 数据迁移

### 7.1 迁移策略
1. 创建新表（upper_devices, lower_devices, device_bindings）
2. 从现有 devices 表迁移数据：
   - 网络相关字段迁移到 upper_devices
   - 测量相关字段迁移到 lower_devices
3. 建立设备绑定关系
4. 验证数据完整性
5. 删除旧表（可选，建议保留备份）

### 7.2 数据映射
- devices.dtu_id → upper_devices.imei（如果存在）
- devices.device_id → 根据设备类型分别处理
- devices.K_value, beta_value, calibration_* → lower_devices
- devices.network_status, last_online_time, ip_address → upper_devices
