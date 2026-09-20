# device-gateway HTTP API 文档（管理端对接）

服务默认监听：
- Host: `0.0.0.0`
- Port: `3001`（可通过环境变量 `HTTP_PORT` 修改）

统一返回格式：
- 成功：`{ "success": true, "data": ... }`
- 失败：`{ "success": false, "error": "<message>" }`

> 注意：本文档基于 `src/index.js` 中 Fastify 路由实现整理。 citeturn1fetch0

---

## 1) GET /sessions

### 描述
获取当前 TCP 在线会话列表（来自 TCP Server 内存会话）。

### 请求
- Method: `GET`
- Path: `/sessions`
- Query: 无

### 响应（200）
```json
{
  "success": true,
  "data": {
    "list": [
      {
        "sessionId": "1.2.3.4:56789_...",
        "imei": "865229085206945",
        "remoteAddress": "1.2.3.4:56789",
        "connectedAt": 1779181576708,
        "lastSeenAt": 1779181636918
      }
    ]
  }
}
```

---

## 2) POST /params/fetch

### 描述
触发对指定设备的“参数拉取任务”，返回 taskId（异步任务）。 citeturn1fetch0

### 请求
- Method: `POST`
- Path: `/params/fetch`
- Content-Type: `application/json`

Body：
```json
{
  "imei": "865229085206945"
}
```

### 响应（200）
```json
{ "success": true, "data": { "taskId": 123 } }
```

### 失败响应
- `500` 或 `err.statusCode || 500`
```json
{ "success": false, "error": "..." }
```

---

## 3) POST /monitor/start

### 描述
启动对某个设备的“自动监测任务”，返回 `taskId`。 citeturn1fetch0

> 备注：如果设备不在线/任务冲突/参数非法等，可能返回 4xx/5xx（取决于 `MonitorService.startTask` 抛出的错误以及 `statusCode`）。

### 请求
- Method: `POST`
- Path: `/monitor/start`
- Content-Type: `application/json`

Body：
```json
{
  "imei": "865229085206945",
  "holeNo": 1
}
```

字段说明：
- `imei`：设备 IMEI（string）
- `holeNo`：孔号（number，传给监测服务；建议传正整数）

### 响应（200）
```json
{ "success": true, "data": { "taskId": 123 } }
```

### 失败响应
- `err.statusCode || 500`
```json
{ "success": false, "error": "..." }
```

---

## 4) POST /monitor/homemove

### 描述
启动对指定设备的"归位任务"，返回 taskId（异步任务）。


### 请求
Method: POST
Path: /monitor/homemove
Content-Type: application/json

Body：

json
json
{
  "imei": "865229085206945"
}

字段说明：

imei：设备 IMEI（string）

### 响应（200）
json
json
{ "success": true, "data": { "taskId": 123 } }

### 失败响应
- `err.statusCode || 500`
json
json
{ "success": false, "error": "..." }


## 5) POST /monitor/bottomtest

### 描述
启动对指定设备的"底部检测任务"，返回 taskId（异步任务）。


### 请求
Method: POST
Path: /monitor/bottomtest
Content-Type: application/json

Body：

json
json
{
  "imei": "865229085206945"
}

字段说明：

imei：设备 IMEI（string）

### 响应（200）
json
json
{ "success": true, "data": { "taskId": 123 } }

### 失败响应
- `err.statusCode || 500`
json
json
{ "success": false, "error": "..." }


## 6) POST /monitor/status/refresh/start

### 描述
启动指定设备的监测状态自动刷新任务，返回当前状态快照。


### 请求
Method: POST
Path: /monitor/status/refresh/start
Content-Type: application/json

Body：

json
json
{
  "imei": "865229085206945",
  "taskId": 123,
  "intervalMs": 5000,
  "clientIdleTimeoutMs": 60000
}

字段说明：

imei（必填）：设备 IMEI（string）
taskId（可选，默认 null）：关联的任务 ID
intervalMs（可选）：刷新间隔（毫秒）
clientIdleTimeoutMs（可选）：客户端空闲超时时间（毫秒）

### 响应（200）
json
json
{ "success": true, "data": { "...": "当前状态快照" } }

### 失败响应
400：缺少参数
missing imei
500：其他错误
json
json
{ "success": false, "error": "..." }


## 7) POST /monitor/status/refresh/stop

### 描述
停止指定设备的监测状态自动刷新任务。


### 请求
Method: POST
Path: /monitor/status/refresh/stop
Content-Type: application/json

Body：

json
json
{
  "imei": "865229085206945"
}

字段说明：

imei（必填）：设备 IMEI（string）

### 响应（200）
json
json
{ "success": true, "data": { "...": "停止结果" } }

### 失败响应
400：缺少参数
missing imei
500：其他错误
json
json
{ "success": false, "error": "..." }


## 8) GET /monitor/status

### 描述
获取指定设备的最新监测状态快照。


### 请求
Method: GET
Path: /monitor/status
Query：
imei（必填）：设备 IMEI（string）

示例：/monitor/status?imei=865229085206945


### 响应（200）
json
json
{ "success": true, "data": { "...": "最新状态快照" } }

### 失败响应
400：缺少参数
missing imei
404：未找到该设备的监测状态
monitor status for IMEI xxx not found
500：其他错误
json
json
{ "success": false, "error": "..." }

## 9) POST /monitor/set-params

### 描述
向指定设备写入一组运行参数（通过 Modbus 寄存器），返回 taskId（异步任务）。支持批量写入多个参数，接口会逐一校验参数名合法性及值类型后统一下发。


### 请求
Method: POST
Path: /monitor/set-params
Content-Type: application/json

Body：

json
json
{
  "imei": "865229085206945",
  "params": {
    "monitorNodesNum": 8,
    "monitorTestDis": 2.5,
    "workSpd": 50.0
  }
}

字段说明：

imei（必填）：设备 IMEI（string）
params（必填）：要写入的参数键值对（object），至少包含一个参数；键名必须来自下表，否则返回 400

支持的参数列表

参数名	寄存器地址	数据类型	说明
必要参数			
monitorNodesNum	280	UINT16	监测节点数
默认参数			
deviceNode	676	UINT16	设备节点号
monitorTestDis	272	FLOAT32	监测测试距离
monitorClosetoDis	274	FLOAT32	监测接近距离
monitorNodeOnDelayMs	281	UINT16	节点开启延迟（毫秒）
monitorFromStartDis	282	FLOAT32	监测起始距离
高级参数			
startSpd	128	FLOAT32	启动速度
orgLowSpd	130	FLOAT32	原点低速
orgAccSpd	132	FLOAT32	原点加速度
manualSpd	134	FLOAT32	手动速度
manualAccSpd	136	FLOAT32	手动加速度
workSpd	138	FLOAT32	工作速度
workAccSpd	140	FLOAT32	工作加速度
spaceSpd	146	FLOAT32	空间速度

值类型校验规则
UINT16：必须为 非负整数（0, 1, 2, ...）
FLOAT32：必须为 数字（整数或浮点数均可）

### 成功响应（200）
json
json
{ "success": true, "data": { "taskId": 123 } }

### 失败响应（常见）

HTTP 状态码	错误信息示例	原因
400	missing imei	未传 imei
400	missing params	未传 params 或传入了空对象
400	unknown param: xxx	参数名不在支持列表中
400	xxx must be a non-negative integer	UINT16 类型参数传入了非法值
400	xxx must be a number	FLOAT32 类型参数传入了非数字值
404	IMEI xxx not connected	设备不在线
409	IMEI xxx already has a task in progress	该设备有其他任务正在执行
500	其他错误	服务端异常

调用示例

bash
bash
curl -X POST http://<host>:3001/monitor/set-params \
  -H "Content-Type: application/json" \
  -d '{
    "imei": "865229085206945",
    "params": {
      "monitorNodesNum": 8,
      "monitorTestDis": 2.5,
      "monitorClosetoDis": 0.5,
      "workSpd": 50.0
    }
  }'

注意：该接口为异步任务，返回的 taskId 仅表示任务已创建并开始执行。同一设备同一时刻只能有一个任务在执行（包括 set-params、fetch、monitor/start、homemove、bottomtest 等），若存在冲突会返回 409。

## 10) POST /send-command（附：联调用）

### 描述
向指定 IMEI 发送命令并等待响应；请求会写入 `dg_command` 日志。 citeturn1fetch0

### 请求
- Method: `POST`
- Path: `/send-command`
- Content-Type: `application/json`

Body：
```json
{
  "imei": "865229085206945",
  "format": "hex",
  "command": "01 03 00 00 00 0E C4 0E"
}
```

字段说明：
- `imei`（必填）
- `command`（必填）
- `format`（可选，默认 `hex`）
  - `hex`：按十六进制字节解析（允许空格或逗号分隔；每段必须是 2 位 hex）
  - 其他值：按 UTF-8 字符串发送

### 成功响应（200）
```json
{
  "success": true,
  "message": "sent",
  "data": {
    "imei": "865229085206945",
    "len": 8,
    "normalizedCommand": "01 03 00 00 00 0E C4 0E",
    "payloadHex": "01 03 00 00 00 0E C4 0E",
    "responseHex": "01 03 ..."
  }
}
```

### 失败响应（常见）
- `400`：缺少参数
  - `missing imei`
  - `missing command`
- `404`：设备不在线：`IMEI xxx not connected`
- `409`：该 IMEI 正在进行 monitor task：`IMEI xxx has a monitor task in progress`
- `504`：超时（当错误信息为 `Modbus response timeout` 时）
- `500`：其他错误

---
