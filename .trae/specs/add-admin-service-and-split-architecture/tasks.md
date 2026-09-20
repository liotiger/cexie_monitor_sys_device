# Tasks

- [x] Task 1: 明确三层架构与双数据库边界
  - [x] SubTask 1.1: 梳理管理端、通讯服务、客户端三者的职责划分
  - [x] SubTask 1.2: 明确管理库与业务库的表归属、连接配置和读写边界
  - [x] SubTask 1.3: 识别现有 `backend/`、`frontend/`、`tcp-server/` 中需要保留、迁移和重构的模块

- [x] Task 2: 新增管理端基础能力
  - [x] SubTask 2.1: 搭建管理端项目结构与配置
  - [x] SubTask 2.2: 建立客户表、任务表及其基础数据模型
  - [x] SubTask 2.3: 实现客户端请求鉴权中间件，支持客户独立 key

- [x] Task 3: 实现管理端任务编排链路
  - [x] SubTask 3.1: 提供客户端调用的设备任务创建接口
  - [x] SubTask 3.2: 管理端写入任务表并轮询任务执行状态
  - [x] SubTask 3.3: 任务完成后调用客户端接口回传原始数据结果

- [x] Task 4: 调整通讯服务与任务表协作
  - [x] SubTask 4.1: 保持通讯服务设备通讯与原始数据入库逻辑不变
  - [x] SubTask 4.2: 增加通讯服务对任务表的轮询与任务领取能力
  - [x] SubTask 4.3: 完成设备交互后回写任务状态、原始数据关联信息和失败原因

- [x] Task 5: 重构客户端为独立业务侧服务
  - [x] SubTask 5.1: 调整客户端配置，使其只连接业务库
  - [x] SubTask 5.2: 保留并重构原始数据查询、成果数据处理、变形曲线等面向用户的能力
  - [x] SubTask 5.3: 提供管理端回调接收接口，将任务原始数据同步到业务库

- [x] Task 6: 重构前端与接口调用方式
  - [x] SubTask 6.1: 将前端依赖的管理类接口切换到管理端入口
  - [x] SubTask 6.2: 将面向用户的查询与成果展示接口切换到客户端服务入口
  - [x] SubTask 6.3: 校正登录、鉴权、错误提示和任务等待中的交互体验

- [x] Task 7: 完成数据库初始化与迁移方案
  - [x] SubTask 7.1: 拆分现有数据库初始化脚本为管理库与业务库两套脚本
  - [x] SubTask 7.2: 补充客户表、任务表、原始数据流转表或映射字段
  - [x] SubTask 7.3: 明确旧数据迁移和环境变量配置方案

- [x] Task 8: 完成联调与验证
  - [x] SubTask 8.1: 验证客户端请求鉴权成功与失败场景
  - [x] SubTask 8.2: 验证管理端创建任务、通讯服务执行任务、客户端接收回调的完整链路
  - [x] SubTask 8.3: 验证双数据库隔离和原始数据到成果数据的业务流程

# Task Dependencies
- [Task 2] depends on [Task 1]
- [Task 3] depends on [Task 2]
- [Task 4] depends on [Task 2]
- [Task 5] depends on [Task 1]
- [Task 6] depends on [Task 3] and [Task 5]
- [Task 7] depends on [Task 1]
- [Task 8] depends on [Task 3], [Task 4], [Task 5], [Task 6], and [Task 7]
