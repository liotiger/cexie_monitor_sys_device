# device_gateway 数据库说明（管理端只读对接）

数据库名：`device_gateway`  
数据库类型：MySQL  
默认端口：`3306`

本对接文档覆盖表：
- `dg_device`
- `dg_device_params`
- `dg_result`
- `dg_result_point`

> 建议：管理端使用**只读账号**（仅 SELECT 权限）连接生产库，避免误写/误删。

---

## 1) 连接信息（对接方需要）

- Host：`<mysql_host>`
- Port：`3306`
- Database：`device_gateway`
- Username：`<readonly_user>`
- Password：`<readonly_password>`

### 1.1 推荐只读账号（由你/运维执行）
```sql
CREATE USER 'dg_reader'@'%' IDENTIFIED BY '<strong-password>';
GRANT SELECT ON device_gateway.* TO 'dg_reader'@'%';
FLUSH PRIVILEGES;
```

---

## 2) 表：dg_device（设备在线与会话信息）

### 2.1 用途
device-gateway 维护的设备状态表（每个 IMEI 一行），用于：
- 设备在线/离线展示
- 当前会话、最近心跳、最近通信时间查询
- 排查某 IMEI 是否掉线

### 2.2 表结构（精确）
- `imei` VARCHAR(20) NOT NULL —— **主键**，设备 IMEI
- `online` TINYINT(1) NOT NULL DEFAULT 0 —— 是否在线（0/1）
- `remote_addr` VARCHAR(60) DEFAULT NULL —— 远端地址（`ip:port`）
- `session_id` VARCHAR(120) DEFAULT NULL —— 会话 ID
- `connected_at` DATETIME(3) DEFAULT NULL —— 连接时间
- `disconnected_at` DATETIME(3) DEFAULT NULL —— 断开时间
- `last_seen_at` DATETIME(3) DEFAULT NULL —— 最近一次收到任何数据的时间
- `last_hb_at` DATETIME(3) DEFAULT NULL —— 最近一次心跳时间
- `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
- `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)

索引：
- PK：`PRIMARY KEY (imei)`
- `INDEX idx_online (online)`
- `INDEX idx_updated_at (updated_at)`

### 2.3 常用查询 SQL
**1) 查询设备状态**
```sql
SELECT *
FROM dg_device
WHERE imei = '865229085206945';
```

**2) 查询在线设备列表（最近更新时间）**
```sql
SELECT imei, online, remote_addr, session_id, connected_at, last_seen_at, last_hb_at, updated_at
FROM dg_device
WHERE online = 1
ORDER BY updated_at DESC
LIMIT 200;
```

---

## 3) 表：dg_device_params（设备参数快照）

### 3.1 用途
保存设备参数采集结果（每个 IMEI 最新一条；通过唯一键保证），用于管理端展示设备参数。

### 3.2 表结构（精确）
- `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT —— 主键（内部使用）
- `imei` VARCHAR(32) NOT NULL —— 设备 IMEI（**唯一**：每台设备最多一行）
- `unit_id` TINYINT UNSIGNED NOT NULL DEFAULT 1 —— Modbus Unit Id（默认 1）
- `param_version_hex` CHAR(10) DEFAULT NULL —— 参数版本号（字符串形如 `0x01000001`）
- `params_json` JSON NOT NULL —— 参数内容（JSON）
- `collected_at` DATETIME(3) NOT NULL —— 采集时间
- `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)

约束与索引：
- PK：`PRIMARY KEY (id)`
- 唯一键：`UNIQUE KEY uq_device_params_imei (imei)`
- `INDEX idx_device_params_collected_at (collected_at)`

### 3.3 常用查询 SQL
**1) 查询某设备最新参数**
```sql
SELECT imei, unit_id, param_version_hex, collected_at, params_json, updated_at
FROM dg_device_params
WHERE imei = '865229085206945';
```

**2) 查询最近采集参数的设备**
```sql
SELECT imei, unit_id, param_version_hex, collected_at, updated_at
FROM dg_device_params
ORDER BY collected_at DESC
LIMIT 200;
```

---

## 4) 表：dg_result（任务/指令状态：每个 IMEI 最新一条）

### 4.1 用途
按 IMEI 记录“最近一次任务/指令”的执行状态（常用于：
- 管理端展示任务是否运行中/成功/失败/超时
- device-gateway 内部做并发控制/状态机）

### 4.2 表结构（精确）
- `imei` VARCHAR(32) NOT NULL —— **主键**
- `task_id` BIGINT UNSIGNED DEFAULT NULL —— 任务 ID（来源通常为 `dg_task.id`）
- `cmd` VARCHAR(40) NOT NULL DEFAULT '' —— 命令名称（字符串）
- `status` VARCHAR(20) NOT NULL DEFAULT 'SUCCESS' —— 状态（字符串）
- `err_message` TEXT DEFAULT NULL —— 错误信息（失败/超时场景）
- `started_at` DATETIME(3) DEFAULT NULL —— 任务开始时间
- `finished_at` DATETIME(3) DEFAULT NULL —— 任务结束时间
- `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)

索引：
- PK：`PRIMARY KEY (imei)`
- `INDEX idx_status (status)`
- `INDEX idx_task_id (task_id)`

### 4.3 常用查询 SQL
**1) 查询某设备最近任务状态**
```sql
SELECT imei, task_id, cmd, status, started_at, finished_at, err_message, updated_at
FROM dg_result
WHERE imei = '865229085206945';
```

**2) 查询 RUNNING 状态的任务（排查卡住）**
```sql
SELECT imei, task_id, cmd, status, started_at, updated_at
FROM dg_result
WHERE status = 'RUNNING'
ORDER BY updated_at ASC
LIMIT 200;
```

---

## 5) 表：dg_result_point（最新自动监测点位结果：每 IMEI 一行覆盖）

### 5.1 用途
保存每个 IMEI 最新一次自动监测（A0/A180）的点位数据结果（不保留历史；同一 IMEI 覆盖写）。

### 5.2 表结构（精确）
- `imei` VARCHAR(32) NOT NULL —— **主键**
- `id_1_hex` CHAR(10) DEFAULT NULL —— 设备 ID1（HEX 字符串，如 `0x......`）
- `id_2_hex` CHAR(10) DEFAULT NULL —— 设备 ID2
- `id_3_hex` CHAR(10) DEFAULT NULL —— 设备 ID3
- `task_id` BIGINT NOT NULL —— 本次监测任务 ID
- `hole_no` INT NOT NULL —— 孔号
- `node_num` INT NOT NULL —— 节点数
- `result_a0_json` JSON NOT NULL —— A0 点位 JSON
- `result_a180_json` JSON NOT NULL —— A180 点位 JSON
- `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)

索引：
- PK：`PRIMARY KEY (imei)`
- `INDEX idx_result_point_task (task_id)`

### 5.3 JSON 结构说明（管理端重点）
`result_a0_json` / `result_a180_json` 内部保存点位数组，建议/常见结构为：

```json
{
  "points": [
    { "idx": 1, "node": 1, "depth": 123, "value": 456 },
    { "idx": 2, "node": 1, "depth": 124, "value": 457 }
  ]
}
```

字段说明（来自 device-gateway 组合后的点位语义）：
- `idx`：点序号（从 1 开始递增）
- `node`：节点号（设备协议字段 `wNode`）
- `depth`：编码器深度（设备协议字段 `nEncDepth`）
- `value`：采样值（设备协议字段 `dwData`）

> 备注：device-gateway 内部原始点结构（未入库前）是：
> - A0：`a0EncDepth`, `a0Value`
> - A180：`a180EncDepth`, `a180Value`
> 入库时通常转换/归一成 `depth/value` 结构，便于管理端统一解析。

### 5.4 常用查询 SQL
**1) 查询某设备最新监测结果**
```sql
SELECT imei, id_1_hex, id_2_hex, id_3_hex, task_id, hole_no, node_num,
       result_a0_json, result_a180_json, updated_at
FROM dg_result_point
WHERE imei = '865229085206945';
```

**2) 仅查询 A0**
```sql
SELECT imei, task_id, hole_no, node_num, result_a0_json, updated_at
FROM dg_result_point
WHERE imei = '865229085206945';
```

## 6) 表：dg_monitor_status（设备实时监测状态）

### 6.1 用途
保存每台设备的实时监测状态快照（每个 IMEI 一行，覆盖写），用于：

管理端展示设备当前监测任务状态（空闲/运行中/完成等）
展示设备实时寄存器数据（轴位置、角度、电池电压、PLC 时间等）
控制自动刷新（refresh_enabled）及客户端拉取间隔
排查监测任务卡住、超时、报错等问题

### 6.2 表结构（精确）

主键与任务控制

imei VARCHAR(32) NOT NULL —— 主键，设备 IMEI
task_id BIGINT UNSIGNED DEFAULT NULL —— 当前关联的任务 ID
cmd VARCHAR(64) NOT NULL DEFAULT 'MONITOR_STATUS' —— 命令名称
task_status VARCHAR(16) NOT NULL DEFAULT 'IDLE' —— 任务状态（如 IDLE、RUNNING 等）
started_at DATETIME(3) DEFAULT NULL —— 任务开始时间
finished_at DATETIME(3) DEFAULT NULL —— 任务结束时间
last_error_message VARCHAR(255) DEFAULT NULL —— 最近一次错误信息

自动刷新控制

refresh_enabled TINYINT(1) NOT NULL DEFAULT 0 —— 是否启用自动刷新（0/1）
refresh_interval_ms INT NOT NULL DEFAULT 5000 —— 自动刷新间隔（毫秒）
client_idle_timeout_ms INT NOT NULL DEFAULT 60000 —— 客户端空闲超时时间（毫秒）
stale TINYINT(1) NOT NULL DEFAULT 0 —— 是否已过期（0/1）

时间追踪

sampled_at DATETIME(3) DEFAULT NULL —— 最近一次采样时间
last_poll_at DATETIME(3) DEFAULT NULL —— 最近一次设备轮询时间
last_client_pull_at DATETIME(3) DEFAULT NULL —— 最近一次客户端拉取时间
updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)

系统状态寄存器

sys_status_word BIGINT UNSIGNED DEFAULT NULL —— 上部主板系统状态字
main_in_status INT UNSIGNED DEFAULT NULL —— 上部主板输入状态
main_in_status2 INT UNSIGNED DEFAULT NULL —— 下部主板主输入状态
plc_xbuff_status INT UNSIGNED DEFAULT NULL —— 上部X缓冲状态
plc_xbuff_status2 INT UNSIGNED DEFAULT NULL —— 下部X缓冲状态
main_out_status BIGINT UNSIGNED DEFAULT NULL —— 上部主板输出状态
sys_err_code INT UNSIGNED DEFAULT NULL —— 系统错误码
sensor_status_word BIGINT UNSIGNED DEFAULT NULL —— 下部主板系统状态字

位置信息

axis_pos_mm FLOAT DEFAULT NULL —— 轴位置（毫米）
axis_pos_pul INT DEFAULT NULL —— 轴位置（脉冲）
fb_pos_mm FLOAT DEFAULT NULL —— 反馈位置（毫米）
fb_pos_pul INT DEFAULT NULL —— 反馈位置（脉冲）

PLC 时钟

plc_year INT UNSIGNED DEFAULT NULL —— PLC 年
plc_mon INT UNSIGNED DEFAULT NULL —— PLC 月
plc_day INT UNSIGNED DEFAULT NULL —— PLC 日
plc_hour INT UNSIGNED DEFAULT NULL —— PLC 时
plc_minute INT UNSIGNED DEFAULT NULL —— PLC 分
plc_second INT UNSIGNED DEFAULT NULL —— PLC 秒
plc_week_day INT UNSIGNED DEFAULT NULL —— PLC 星期

设备与电池

battery_volt_pc0 INT UNSIGNED DEFAULT NULL —— 上部电池电压百分比（0-100）
battery_volt_pa0 INT UNSIGNED DEFAULT NULL —— 下部备用电池电压百分比（0-100）
battery_volt_pa1 INT UNSIGNED DEFAULT NULL —— 下部主电池电压百分比（0-100）
device_node INT UNSIGNED DEFAULT NULL —— 设备节点号
data_node INT UNSIGNED DEFAULT NULL —— 数据节点号
monitor_test_pos INT DEFAULT NULL —— 监测测试位置
monitor_closeto_pos INT DEFAULT NULL —— 监测接近位置

角度信息

real_time_angle BIGINT UNSIGNED DEFAULT NULL —— 下部监测实时倾角值
norm_average_angle BIGINT UNSIGNED DEFAULT NULL —— 归一化平均监测值
norm_average_a0_angle BIGINT UNSIGNED DEFAULT NULL —— 归一化平均正向监测值
norm_average_a180_angle BIGINT UNSIGNED DEFAULT NULL —— 归一化平均反向监测值

扩展 JSON

status_json JSON DEFAULT NULL —— 状态扩展字段（完整状态快照）
registers_json JSON DEFAULT NULL —— 原始寄存器数据（完整寄存器映射）

索引：

PK：PRIMARY KEY (imei)
INDEX idx_monitor_status_task_id (task_id)
INDEX idx_monitor_status_task_status (task_status)
INDEX idx_monitor_status_refresh_enabled (refresh_enabled)
INDEX idx_monitor_status_sampled_at (sampled_at)

### 6.3 常用查询 SQL

1) 查询某设备最新监测状态

sql
sql
SELECT imei, task_id, task_status, refresh_enabled, stale,
       sampled_at, last_poll_at, last_client_pull_at,
       sys_status_word, sys_err_code,
       axis_pos_mm, fb_pos_mm,
       real_time_angle, norm_average_angle,
       last_error_message, updated_at
FROM dg_monitor_status
WHERE imei = '865229085206945';

2) 查询所有正在运行的监测任务

sql
sql
SELECT imei, task_id, task_status, refresh_enabled,
       started_at, sampled_at, last_poll_at, updated_at
FROM dg_monitor_status
WHERE task_status = 'RUNNING'
ORDER BY updated_at ASC
LIMIT 200;

3) 查询启用自动刷新的设备

sql
sql
SELECT imei, task_id, task_status,
       refresh_interval_ms, client_idle_timeout_ms,
       sampled_at, last_client_pull_at, stale, updated_at
FROM dg_monitor_status
WHERE refresh_enabled = 1
ORDER BY updated_at DESC
LIMIT 200;


备注：dg_monitor_status 与 dg_device_params、dg_result_point 类似，均为每 IMEI 最新一行覆盖写，不保留历史记录。status_json 和 registers_json 为扩展 JSON 字段，管理端详情页可按需取用，列表页建议仅查询标量列以避免大 JSON 返回影响性能。

---

## 7) 对接建议（给管理端同事）

1. **只读账号**连生产库（SELECT only）。
2. `dg_device_params` 与 `dg_result_point` 都是“每 IMEI 最新一条”，需要历史请另行归档设计。
3. 列表页面避免直接 SELECT 大 JSON 字段（`params_json/result_a0_json/result_a180_json`），建议“列表只取摘要，详情页再取 JSON”。
4. 生产环境建议限制查询频率，尤其是全表扫描与大 JSON 返回。