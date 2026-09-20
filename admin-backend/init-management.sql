-- 测斜仪监测系统数据库初始化脚本
-- 修复版：调整表创建顺序，解决外键约束问题

-- 1. 基础用户和角色表
CREATE TABLE IF NOT EXISTS users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    real_name VARCHAR(50),
    phone VARCHAR(20),
    email VARCHAR(100),
    status ENUM('active', 'inactive', 'locked') DEFAULT 'active',
    last_login_time TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS roles (
    id INT PRIMARY KEY AUTO_INCREMENT,
    role_code VARCHAR(50) UNIQUE NOT NULL,
    role_name VARCHAR(100) NOT NULL,
    role_type ENUM('system', 'project') DEFAULT 'system',
    description VARCHAR(500),
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_roles (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    role_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_user_role (user_id, role_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS permissions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    permission_code VARCHAR(100) UNIQUE NOT NULL,
    permission_name VARCHAR(200) NOT NULL,
    permission_type ENUM('system', 'project', 'data') DEFAULT 'system',
    description VARCHAR(500),
    module VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS role_permissions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    role_id INT NOT NULL,
    permission_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_role_permission (role_id, permission_id),
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
    FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

-- 2. 项目表 (必须在 project_members 之前)
CREATE TABLE IF NOT EXISTS projects (
    id INT PRIMARY KEY AUTO_INCREMENT,
    project_code VARCHAR(50) UNIQUE NOT NULL,
    project_name VARCHAR(200) NOT NULL,
    location VARCHAR(500),
    client_name VARCHAR(100),
    contractor VARCHAR(100),
    supervisor VARCHAR(100),
    start_date DATE,
    end_date DATE,
    status ENUM('planning', 'ongoing', 'paused', 'completed') DEFAULT 'planning',
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- 3. 项目成员表
CREATE TABLE IF NOT EXISTS project_members (
    id INT PRIMARY KEY AUTO_INCREMENT,
    project_id INT NOT NULL,
    user_id INT NOT NULL,
    project_role ENUM('manager', 'member', 'viewer') NOT NULL,
    join_date DATE NOT NULL,
    leave_date DATE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_project_user (project_id, user_id),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 4. 设备表 (不包含外键约束，后续添加)
CREATE TABLE IF NOT EXISTS devices (
    id INT PRIMARY KEY AUTO_INCREMENT,
    device_id VARCHAR(50) UNIQUE NOT NULL,
    device_name VARCHAR(100),
    device_type VARCHAR(50),
    manufacturer VARCHAR(100),
    model VARCHAR(50),
    serial_number VARCHAR(100),
    purchase_date DATE,
    dtu_id VARCHAR(50),
    network_status ENUM('online', 'offline') DEFAULT 'offline',
    last_online_time TIMESTAMP,
    ip_address VARCHAR(45),
    communication_protocol VARCHAR(50),
    signal_strength DECIMAL(6,2),
    K_value DECIMAL(10,6),
    beta_value DECIMAL(10,6),
    calibration_date DATE,
    calibration_org VARCHAR(100),
    valid_until DATE,
    calibration_status ENUM('valid', 'expired', 'pending') DEFAULT 'valid',
    status ENUM('idle', 'measuring', 'maintenance', 'fault', 'calibrating', 'charging') DEFAULT 'idle',
    battery_level DECIMAL(5,2),
    temperature DECIMAL(6,2),
    current_hole_id INT,
    current_project_id INT,
    total_usage_hours DECIMAL(10,2) DEFAULT 0,
    total_measurement_count INT DEFAULT 0,
    total_measurement_depth DECIMAL(12,2) DEFAULT 0,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 4.1 上位机表 (DTU数据传输单元)
CREATE TABLE IF NOT EXISTS upper_devices (
    id INT PRIMARY KEY AUTO_INCREMENT,
    imei VARCHAR(20) UNIQUE NOT NULL COMMENT 'IMEI号，唯一标识',
    device_name VARCHAR(100) COMMENT '设备名称',
    manufacturer VARCHAR(100) COMMENT '生产厂商',
    model VARCHAR(50) COMMENT '设备型号',
    serial_number VARCHAR(100) COMMENT '序列号',
    firmware_version VARCHAR(50) COMMENT '固件版本',
    network_status ENUM('online', 'offline') DEFAULT 'offline' COMMENT '网络状态',
    connected_at TIMESTAMP COMMENT '连接时间',
    last_online_time TIMESTAMP COMMENT '最后在线时间',
    ip_address VARCHAR(45) COMMENT 'IP地址',
    signal_strength DECIMAL(6,2) COMMENT '信号强度',
    wire_change_mileage DECIMAL(12,2) DEFAULT 0 COMMENT '换线预警里程(m)',
    total_mileage DECIMAL(14,2) DEFAULT 0 COMMENT '上位机累计监测里程(m)',
    inspection_mileage DECIMAL(12,2) DEFAULT 0 COMMENT '检查预警里程(m)',
    status ENUM('idle', 'active', 'fault', 'calibration_expired') DEFAULT 'idle' COMMENT '设备状态',
    created_by INT COMMENT '创建人',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_imei (imei),
    INDEX idx_network_status (network_status)
) COMMENT='上位机表(DTU)';

-- 修复说明：上位机设备状态收敛为“空闲/使用中/故障/校准过期”，老库先迁移旧值再收窄 ENUM。
ALTER TABLE upper_devices
  MODIFY COLUMN status ENUM('idle', 'active', 'maintenance', 'fault', 'calibration_expired') DEFAULT 'idle' COMMENT '设备状态';
UPDATE upper_devices SET status = 'calibration_expired' WHERE status = 'maintenance';
ALTER TABLE upper_devices
  MODIFY COLUMN status ENUM('idle', 'active', 'fault', 'calibration_expired') DEFAULT 'idle' COMMENT '设备状态';

-- 4.2 下位机表 (测斜仪设备)
CREATE TABLE IF NOT EXISTS lower_devices (
    id INT PRIMARY KEY AUTO_INCREMENT,
    device_code VARCHAR(50) UNIQUE NOT NULL COMMENT '设备编号，唯一标识',
    device_name VARCHAR(100) COMMENT '设备名称',
    manufacturer VARCHAR(100) COMMENT '生产厂商',
    model VARCHAR(50) COMMENT '设备型号',
    serial_number VARCHAR(100) COMMENT '序列号',
    k_value DECIMAL(18,6) COMMENT 'K值(校准参数，修复大于4位整数部分时写入溢出的问题)',
    beta_value DECIMAL(10,6) COMMENT 'β值(校准参数)',
    calibration_date DATE COMMENT '校准日期',
    calibration_org VARCHAR(100) COMMENT '校准机构',
    valid_until DATE COMMENT '校准有效期至',
    calibration_status ENUM('valid', 'expired', 'pending') DEFAULT 'valid' COMMENT '校准状态',
    current_hole_id INT COMMENT '当前绑定的测孔ID',
    current_project_id INT COMMENT '当前绑定的项目ID',
    total_measurement_count INT DEFAULT 0 COMMENT '累计测量次数',
    total_measurement_depth DECIMAL(12,2) DEFAULT 0 COMMENT '累计测量深度',
    status ENUM('idle', 'measuring', 'maintenance', 'fault', 'calibrating') DEFAULT 'idle' COMMENT '设备状态',
    created_by INT COMMENT '创建人',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_device_code (device_code),
    INDEX idx_calibration_status (calibration_status),
    INDEX idx_current_hole_id (current_hole_id)
) COMMENT='下位机表(测斜仪)';

-- 4.3 设备绑定关联表
CREATE TABLE IF NOT EXISTS device_bindings (
    id INT PRIMARY KEY AUTO_INCREMENT,
    upper_device_id INT NOT NULL COMMENT '上位机ID',
    lower_device_id INT NOT NULL COMMENT '下位机ID',
    binding_type ENUM('permanent', 'temporary') DEFAULT 'permanent' COMMENT '绑定类型',
    status ENUM('active', 'inactive') DEFAULT 'active' COMMENT '绑定状态',
    bind_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '绑定时间',
    unbind_time TIMESTAMP COMMENT '解绑时间',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_device_binding (upper_device_id, lower_device_id),
    INDEX idx_upper_device_id (upper_device_id),
    INDEX idx_lower_device_id (lower_device_id),
    INDEX idx_status (status),
    FOREIGN KEY (upper_device_id) REFERENCES upper_devices(id) ON DELETE CASCADE,
    FOREIGN KEY (lower_device_id) REFERENCES lower_devices(id) ON DELETE CASCADE
) COMMENT='设备绑定关联表';

-- 5. 测孔表
CREATE TABLE IF NOT EXISTS monitoring_holes (
    id INT PRIMARY KEY AUTO_INCREMENT,
    hole_number VARCHAR(50) NOT NULL,
    project_id INT NOT NULL,
    hole_name VARCHAR(100),
    hole_type ENUM('retaining_structure', 'soil_body') NOT NULL,
    location_description VARCHAR(500),
    coordinates JSON,
    depth DECIMAL(8,2) NOT NULL,
    measurement_interval DECIMAL(6,2) DEFAULT 0.5,
    initial_measurement_distance DECIMAL(6,3) DEFAULT 0.05 COMMENT '初始测量距离（米），对应设备参数 fMonitorFromStartDis',
    calculation_reference ENUM('top', 'bottom') DEFAULT 'bottom',
    warning_standard DECIMAL(10,2),
    collection_method ENUM('manual', 'auto') DEFAULT 'manual',
    lower_device_id INT,
    upper_device_id INT COMMENT '关联上位机ID；修复管理端设备列表按上位机关联测孔查询时缺少字段的问题',
    timer_enabled BOOLEAN DEFAULT FALSE,
    timer_type ENUM('interval', 'fixed_time') DEFAULT 'interval',
    timer_interval_minutes INT,
    fixed_times JSON,
    timer_start_date DATE,
    timer_end_date DATE,
    status ENUM('active', 'inactive', 'completed') DEFAULT 'active',
    last_measurement_time TIMESTAMP,
    next_scheduled_time TIMESTAMP,
    total_measurements INT DEFAULT 0,
    warning_count INT DEFAULT 0,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (lower_device_id) REFERENCES lower_devices(id),
    KEY idx_monitoring_holes_upper_device_id (upper_device_id),
    FOREIGN KEY (upper_device_id) REFERENCES upper_devices(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id),
    UNIQUE KEY uk_hole_project (hole_number, project_id)
);

-- 修复说明：测孔状态收敛为“监测中/停测/已完成”，预警级别改由成果数据 warning_level 表达。
UPDATE monitoring_holes SET status = 'active' WHERE status = 'warning';
ALTER TABLE monitoring_holes
  MODIFY COLUMN status ENUM('active', 'inactive', 'completed') DEFAULT 'active';

-- 6. 项目进度表
CREATE TABLE IF NOT EXISTS project_progress (
    id INT PRIMARY KEY AUTO_INCREMENT,
    project_id INT NOT NULL,
    progress_date DATE NOT NULL,
    progress_description TEXT,
    progress_percentage DECIMAL(5,2),
    photo_urls JSON,
    recorded_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (recorded_by) REFERENCES users(id)
);

-- 7. 设备使用日志
CREATE TABLE IF NOT EXISTS device_usage_logs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    device_id INT NOT NULL,
    user_id INT NOT NULL,
    project_id INT NOT NULL,
    hole_id INT NOT NULL,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP,
    measurement_count INT DEFAULT 0,
    total_measurement_depth DECIMAL(12,2),
    total_measurement_time INT,
    average_depth_per_measurement DECIMAL(8,2),
    start_battery_level DECIMAL(5,2),
    end_battery_level DECIMAL(5,2),
    start_temperature DECIMAL(6,2),
    end_temperature DECIMAL(6,2),
    start_signal_strength DECIMAL(6,2),
    end_signal_strength DECIMAL(6,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES devices(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (project_id) REFERENCES projects(id),
    FOREIGN KEY (hole_id) REFERENCES monitoring_holes(id),
    INDEX idx_usage_time (start_time, end_time),
    INDEX idx_user_device (user_id, device_id)
);

-- 8. 设备标定日志
CREATE TABLE IF NOT EXISTS device_calibration_logs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    device_id INT NOT NULL,
    calibration_date DATE NOT NULL,
    calibration_org VARCHAR(100) NOT NULL,
    calibrator VARCHAR(50),
    K_value DECIMAL(10,6) NOT NULL,
    beta_value DECIMAL(10,6) NOT NULL,
    temperature DECIMAL(6,2),
    humidity DECIMAL(6,2),
    calibration_data JSON,
    calibration_points INT,
    standard_deviation DECIMAL(10,6),
    correlation_coefficient DECIMAL(6,4),
    certificate_number VARCHAR(100),
    certificate_file VARCHAR(500),
    valid_until DATE,
    calibration_status ENUM('passed', 'failed', 'pending') DEFAULT 'passed',
    review_status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    created_by INT,
    reviewed_by INT,
    reviewed_at TIMESTAMP,
    review_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES devices(id),
    FOREIGN KEY (created_by) REFERENCES users(id),
    FOREIGN KEY (reviewed_by) REFERENCES users(id)
);

-- 9. 测孔绑定历史
CREATE TABLE IF NOT EXISTS hole_binding_history (
    id INT PRIMARY KEY AUTO_INCREMENT,
    hole_id INT NOT NULL,
    device_id INT NOT NULL,
    bind_time TIMESTAMP NOT NULL,
    unbind_time TIMESTAMP,
    bind_type ENUM('manual', 'auto', 'scheduled') DEFAULT 'manual',
    bind_reason VARCHAR(200),
    unbind_reason VARCHAR(200),
    bind_operator INT,
    unbind_operator INT,
    measurement_count INT DEFAULT 0,
    total_measurement_time INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (hole_id) REFERENCES monitoring_holes(id),
    FOREIGN KEY (device_id) REFERENCES devices(id),
    FOREIGN KEY (bind_operator) REFERENCES users(id),
    FOREIGN KEY (unbind_operator) REFERENCES users(id),
    INDEX idx_binding_time (bind_time, unbind_time),
    INDEX idx_hole_binding (hole_id, bind_time)
);

-- 10. 定时任务表
CREATE TABLE IF NOT EXISTS scheduled_tasks (
    id INT PRIMARY KEY AUTO_INCREMENT,
    task_name VARCHAR(100) NOT NULL,
    hole_id INT NOT NULL,
    task_type ENUM('interval', 'fixed_time', 'immediate') NOT NULL,
    interval_seconds INT,
    fixed_time TIME,
    start_date DATE,
    end_date DATE,
    enabled BOOLEAN DEFAULT TRUE,
    last_executed TIMESTAMP,
    next_execution TIMESTAMP,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (hole_id) REFERENCES monitoring_holes(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- 11. 原始测量数据表
CREATE TABLE IF NOT EXISTS raw_measurement_data (
    id INT PRIMARY KEY AUTO_INCREMENT,
    measurement_uuid VARCHAR(36) UNIQUE NOT NULL,
    hole_id INT NOT NULL,
    device_id INT NOT NULL,
    measurement_time TIMESTAMP NOT NULL,
    measurement_mode ENUM('manual', 'auto', 'scheduled') NOT NULL,
    operator_id INT,
    batch_number VARCHAR(50),
    depth DECIMAL(8,2) NOT NULL,
    positive_value DECIMAL(12,6) NOT NULL,
    negative_value DECIMAL(12,6) NOT NULL,
    temperature DECIMAL(6,2),
    battery_voltage DECIMAL(6,2),
    signal_strength DECIMAL(6,2),
    data_status ENUM('raw', 'processed', 'invalid', 'warning') DEFAULT 'raw',
    quality_flag ENUM('good', 'fair', 'poor') DEFAULT 'good',
    upload_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_time TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (hole_id) REFERENCES monitoring_holes(id),
    FOREIGN KEY (device_id) REFERENCES devices(id),
    FOREIGN KEY (operator_id) REFERENCES users(id),
    INDEX idx_measurement_time (measurement_time),
    INDEX idx_hole_depth (hole_id, depth),
    INDEX idx_device_measurement (device_id, measurement_time)
);

-- 12. 任务执行日志
CREATE TABLE IF NOT EXISTS task_execution_logs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    task_id INT NOT NULL,
    execution_time TIMESTAMP NOT NULL,
    status ENUM('success', 'failed', 'skipped') NOT NULL,
    error_message TEXT,
    measurement_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES scheduled_tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (measurement_id) REFERENCES raw_measurement_data(id)
);

-- 13. 测量批次表
CREATE TABLE IF NOT EXISTS measurement_batches (
    id INT PRIMARY KEY AUTO_INCREMENT,
    batch_number VARCHAR(50) UNIQUE NOT NULL,
    hole_id INT NOT NULL,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP,
    total_points INT DEFAULT 0,
    operator_id INT,
    batch_status ENUM('measuring', 'completed', 'aborted') DEFAULT 'measuring',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (hole_id) REFERENCES monitoring_holes(id),
    FOREIGN KEY (operator_id) REFERENCES users(id)
);

-- 14. 处理结果数据表
CREATE TABLE IF NOT EXISTS processed_result_data (
    id INT PRIMARY KEY AUTO_INCREMENT,
    raw_data_id INT NOT NULL,
    hole_id INT NOT NULL,
    device_id INT NOT NULL,
    measurement_time TIMESTAMP NOT NULL,
    depth DECIMAL(8,2) NOT NULL,
    Y_average DECIMAL(12,6) NOT NULL,
    inclination_angle DECIMAL(10,6) NOT NULL,
    depth_offset DECIMAL(10,4) NOT NULL,
    current_pipe_value DECIMAL(12,4),
    initial_pipe_value DECIMAL(12,4),
    cumulative_displacement DECIMAL(12,4),
    previous_pipe_value DECIMAL(12,4),
    current_displacement DECIMAL(12,4),
    deformation_rate DECIMAL(12,4),
    warning_level ENUM('normal', 'warning', 'alarm') DEFAULT 'normal',
    warning_message VARCHAR(200),
    processed_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (raw_data_id) REFERENCES raw_measurement_data(id),
    FOREIGN KEY (hole_id) REFERENCES monitoring_holes(id),
    FOREIGN KEY (device_id) REFERENCES devices(id),
    UNIQUE KEY uk_raw_data (raw_data_id)
);

-- 15. 变形曲线表
CREATE TABLE IF NOT EXISTS deformation_curves (
    id INT PRIMARY KEY AUTO_INCREMENT,
    hole_id INT NOT NULL,
    curve_type ENUM('single', 'history') NOT NULL,
    measurement_time TIMESTAMP NOT NULL,
    depth_data JSON NOT NULL,
    displacement_data JSON NOT NULL,
    curve_parameters JSON,
    image_url VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (hole_id) REFERENCES monitoring_holes(id),
    INDEX idx_hole_time (hole_id, measurement_time)
);

-- 16. 监测报告表
CREATE TABLE IF NOT EXISTS monitoring_reports (
    id INT PRIMARY KEY AUTO_INCREMENT,
    report_number VARCHAR(50) UNIQUE NOT NULL,
    report_name VARCHAR(200) NOT NULL,
    project_id INT NOT NULL,
    report_type ENUM('daily', 'weekly', 'monthly', 'special') NOT NULL,
    report_date DATE NOT NULL,
    period_start DATE,
    period_end DATE,
    summary TEXT,
    hole_count INT DEFAULT 0,
    measurement_count INT DEFAULT 0,
    warning_count INT DEFAULT 0,
    max_displacement DECIMAL(10,2),
    file_format ENUM('excel', 'pdf', 'word') DEFAULT 'pdf',
    file_path VARCHAR(500),
    file_size INT,
    generated_by INT,
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_by INT,
    reviewed_at TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id),
    FOREIGN KEY (generated_by) REFERENCES users(id),
    FOREIGN KEY (reviewed_by) REFERENCES users(id)
);

-- 17. 系统配置表
CREATE TABLE IF NOT EXISTS system_config (
    id INT PRIMARY KEY AUTO_INCREMENT,
    config_key VARCHAR(100) UNIQUE NOT NULL,
    config_value TEXT,
    config_type VARCHAR(50),
    description VARCHAR(200),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 18. 操作日志表
CREATE TABLE IF NOT EXISTS operation_logs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    operation_type VARCHAR(50) NOT NULL,
    operation_target VARCHAR(100),
    target_id INT,
    operation_details TEXT,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    operation_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 添加 devices 表的外键约束
SET @devices_hole_fk_exists = (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'devices'
    AND CONSTRAINT_NAME = 'fk_devices_hole'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @devices_hole_fk_sql = IF(
  @devices_hole_fk_exists = 0,
  'ALTER TABLE devices ADD CONSTRAINT fk_devices_hole FOREIGN KEY (current_hole_id) REFERENCES monitoring_holes(id)',
  'SELECT 1'
);
PREPARE stmt FROM @devices_hole_fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @devices_project_fk_exists = (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'devices'
    AND CONSTRAINT_NAME = 'fk_devices_project'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @devices_project_fk_sql = IF(
  @devices_project_fk_exists = 0,
  'ALTER TABLE devices ADD CONSTRAINT fk_devices_project FOREIGN KEY (current_project_id) REFERENCES projects(id)',
  'SELECT 1'
);
PREPARE stmt FROM @devices_project_fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @devices_creator_fk_exists = (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'devices'
    AND CONSTRAINT_NAME = 'fk_devices_creator'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @devices_creator_fk_sql = IF(
  @devices_creator_fk_exists = 0,
  'ALTER TABLE devices ADD CONSTRAINT fk_devices_creator FOREIGN KEY (created_by) REFERENCES users(id)',
  'SELECT 1'
);
PREPARE stmt FROM @devices_creator_fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =====================================================
-- 初始化数据
-- =====================================================

-- 1. 创建默认角色
INSERT IGNORE INTO roles (role_code, role_name, role_type, description, is_default, created_at, updated_at) VALUES
('admin', '超级管理员', 'system', '拥有系统所有权限，可管理所有功能和数据', 0, NOW(), NOW()),
('user', '普通用户', 'system', '普通用户权限，可查看已授权的项目和数据', 1, NOW(), NOW()),
('project_manager', '项目管理员', 'project', '项目管理权限，可管理所属项目的测孔和数据', 0, NOW(), NOW()),
('project_user', '项目成员', 'project', '项目成员权限，只能查看数据，无法操作', 0, NOW(), NOW()),
('operator', '操作员', 'system', '设备操作权限，可进行测量操作和数据采集', 0, NOW(), NOW());

-- 2. 创建超级管理员用户 (密码: admin123)
-- bcrypt hash for 'admin123': $2a$10$Po8JFmr04Y.V6Qr5PNnJde8l5on4EKbPxJtLrmDjDHdXq9BBptomq
INSERT IGNORE INTO users (username, email, password_hash, real_name, phone, status, created_at, updated_at) VALUES
('admin', 'admin@example.com', '$2a$10$Po8JFmr04Y.V6Qr5PNnJde8l5on4EKbPxJtLrmDjDHdXq9BBptomq', '超级管理员', '', 'active', NOW(), NOW());

-- 3. 创建权限
INSERT IGNORE INTO permissions (permission_code, permission_name, permission_type, description, module, created_at, updated_at) VALUES
-- 用户管理权限
('user:view', '查看用户', 'system', '查看用户列表和详情', 'user', NOW(), NOW()),
('user:create', '创建用户', 'system', '创建新用户', 'user', NOW(), NOW()),
('user:edit', '编辑用户', 'system', '编辑用户信息', 'user', NOW(), NOW()),
('user:delete', '删除用户', 'system', '删除用户', 'user', NOW(), NOW()),
('user:assign_role', '分配角色', 'system', '为用户分配角色', 'user', NOW(), NOW()),

-- 角色管理权限
('role:view', '查看角色', 'system', '查看角色列表和详情', 'role', NOW(), NOW()),
('role:create', '创建角色', 'system', '创建新角色', 'role', NOW(), NOW()),
('role:edit', '编辑角色', 'system', '编辑角色信息', 'role', NOW(), NOW()),
('role:delete', '删除角色', 'system', '删除角色', 'role', NOW(), NOW()),
('role:assign_permission', '分配权限', 'system', '为角色分配权限', 'role', NOW(), NOW()),

-- 权限管理权限
('permission:view', '查看权限', 'system', '查看权限列表', 'permission', NOW(), NOW()),

-- 项目管理权限
('project:view', '查看项目', 'project', '查看项目列表和详情', 'project', NOW(), NOW()),
('project:create', '创建项目', 'project', '创建新项目', 'project', NOW(), NOW()),
('project:edit', '编辑项目', 'project', '编辑项目信息', 'project', NOW(), NOW()),
('project:delete', '删除项目', 'project', '删除项目', 'project', NOW(), NOW()),
('project:manage_member', '管理成员', 'project', '管理项目成员', 'project', NOW(), NOW()),

-- 测孔管理权限
('hole:view', '查看测孔', 'project', '查看测孔列表和详情', 'hole', NOW(), NOW()),
('hole:create', '创建测孔', 'project', '创建新测孔', 'hole', NOW(), NOW()),
('hole:edit', '编辑测孔', 'project', '编辑测孔信息', 'hole', NOW(), NOW()),
('hole:delete', '删除测孔', 'project', '删除测孔', 'hole', NOW(), NOW()),
('hole:bind_device', '绑定设备', 'project', '为测孔绑定设备', 'hole', NOW(), NOW()),

-- 设备管理权限
('device:view', '查看设备', 'system', '查看设备列表和详情', 'device', NOW(), NOW()),
('device:create', '创建设备', 'system', '添加新设备', 'device', NOW(), NOW()),
('device:edit', '编辑设备', 'system', '编辑设备信息', 'device', NOW(), NOW()),
('device:delete', '删除设备', 'system', '删除设备', 'device', NOW(), NOW()),
('device:calibrate', '设备标定', 'system', '进行设备标定操作', 'device', NOW(), NOW()),
('device:control', '控制设备', 'system', '远程控制设备', 'device', NOW(), NOW()),

-- 数据管理权限
('data:view', '查看数据', 'data', '查看测量数据', 'data', NOW(), NOW()),
('data:export', '导出数据', 'data', '导出测量数据', 'data', NOW(), NOW()),
('data:import', '导入数据', 'data', '导入测量数据', 'data', NOW(), NOW()),
('data:delete', '删除数据', 'data', '删除测量数据', 'data', NOW(), NOW()),
('data:process', '处理数据', 'data', '处理原始数据', 'data', NOW(), NOW()),

-- 报表管理权限
('report:view', '查看报表', 'data', '查看监测报表', 'report', NOW(), NOW()),
('report:create', '创建报表', 'data', '生成监测报表', 'report', NOW(), NOW()),
('report:export', '导出报表', 'data', '导出监测报表', 'report', NOW(), NOW()),

-- 系统管理权限
('system:config', '系统配置', 'system', '修改系统配置', 'system', NOW(), NOW()),
('system:log', '查看日志', 'system', '查看操作日志', 'system', NOW(), NOW()),
('system:backup', '数据备份', 'system', '备份系统数据', 'system', NOW(), NOW()),
('system:restore', '数据恢复', 'system', '恢复系统数据', 'system', NOW(), NOW());

-- 4. 为超级管理员分配管理员角色
SET @admin_user_id = (SELECT id FROM users WHERE username = 'admin' LIMIT 1);
SET @admin_role_id = (SELECT id FROM roles WHERE role_code = 'admin' LIMIT 1);

INSERT IGNORE INTO user_roles (user_id, role_id, created_at, updated_at) VALUES
(@admin_user_id, @admin_role_id, NOW(), NOW());

-- 5. 为超级管理员角色分配所有权限
INSERT IGNORE INTO role_permissions (role_id, permission_id, created_at)
SELECT @admin_role_id, id, NOW() FROM permissions;

-- 6. 为普通用户角色分配基础权限
SET @user_role_id = (SELECT id FROM roles WHERE role_code = 'user' LIMIT 1);

INSERT IGNORE INTO role_permissions (role_id, permission_id, created_at)
SELECT @user_role_id, id, NOW() FROM permissions 
WHERE permission_code IN (
    'project:view', 'hole:view', 'device:view', 'data:view', 'report:view'
);

-- 7. 为项目管理员角色分配项目相关权限
SET @pm_role_id = (SELECT id FROM roles WHERE role_code = 'project_manager' LIMIT 1);

INSERT IGNORE INTO role_permissions (role_id, permission_id, created_at)
SELECT @pm_role_id, id, NOW() FROM permissions 
WHERE permission_code IN (
    'project:view', 'project:edit', 'project:manage_member',
    'hole:view', 'hole:create', 'hole:edit', 'hole:bind_device',
    'device:view', 'device:control',
    'data:view', 'data:export', 'data:process',
    'report:view', 'report:create', 'report:export'
);

-- 8. 为操作员角色分配操作相关权限
SET @operator_role_id = (SELECT id FROM roles WHERE role_code = 'operator' LIMIT 1);

INSERT IGNORE INTO role_permissions (role_id, permission_id, created_at)
SELECT @operator_role_id, id, NOW() FROM permissions 
WHERE permission_code IN (
    'project:view', 'hole:view',
    'device:view', 'device:control',
    'data:view', 'data:export'
);

-- 9. 为项目成员角色分配只读权限
SET @project_user_role_id = (SELECT id FROM roles WHERE role_code = 'project_user' LIMIT 1);

INSERT IGNORE INTO role_permissions (role_id, permission_id, created_at)
SELECT @project_user_role_id, id, NOW() FROM permissions 
WHERE permission_code IN (
    'project:view', 'hole:view', 'device:view', 'data:view', 'report:view'
);

-- 10. 创建默认系统配置
INSERT IGNORE INTO system_config (config_key, config_value, config_type, description, created_at, updated_at) VALUES
('system_name', '测斜仪监测系统', 'string', '系统名称', NOW(), NOW()),
('system_version', '1.0.0', 'string', '系统版本', NOW(), NOW()),
('default_language', 'zh-CN', 'string', '默认语言', NOW(), NOW()),
('session_timeout', '86400', 'number', '会话超时时间(秒)', NOW(), NOW()),
('max_login_attempts', '5', 'number', '最大登录尝试次数', NOW(), NOW()),
('password_min_length', '6', 'number', '密码最小长度', NOW(), NOW()),
('data_retention_days', '365', 'number', '数据保留天数', NOW(), NOW()),
('auto_backup_enabled', 'true', 'boolean', '是否启用自动备份', NOW(), NOW()),
('backup_interval_hours', '24', 'number', '备份间隔(小时)', NOW(), NOW()),
('warning_notification_enabled', 'true', 'boolean', '是否启用预警通知', NOW(), NOW());

-- 显示初始化结果
SELECT '========================================' AS '';
SELECT '数据库初始化完成' AS '状态';
SELECT '========================================' AS '';
SELECT '超级管理员账户:' AS '';
SELECT '  用户名: admin' AS '';
SELECT '  密码: admin123' AS '';
SELECT '  请登录后立即修改密码!' AS '';
SELECT '========================================' AS '';
SELECT CONCAT('已创建 ', (SELECT COUNT(*) FROM roles), ' 个角色') AS '角色统计';
SELECT CONCAT('已创建 ', (SELECT COUNT(*) FROM permissions), ' 个权限') AS '权限统计';
SELECT CONCAT('超级管理员已分配 ', (SELECT COUNT(*) FROM role_permissions WHERE role_id = @admin_role_id), ' 个权限') AS '管理员权限';
SELECT '========================================' AS '';


-- 16. �����˿ͻ��������Žӱ�

CREATE TABLE IF NOT EXISTS admin_customers (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  customer_code VARCHAR(64) NOT NULL,
  customer_name VARCHAR(128) NOT NULL,
  contact_person VARCHAR(64) NULL,
  contact_phone VARCHAR(32) NULL,
  client_key VARCHAR(128) NOT NULL,
  callback_url VARCHAR(500) NULL,
  callback_key VARCHAR(255) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_admin_customers_code (customer_code),
  UNIQUE KEY uk_admin_customers_key (client_key),
  KEY idx_admin_customers_status (status)
);

CREATE TABLE IF NOT EXISTS admin_customer_upper_devices (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  customer_id BIGINT NOT NULL,
  upper_device_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_admin_customer_upper_device (customer_id, upper_device_id),
  UNIQUE KEY uk_admin_customer_upper_device_unique (upper_device_id),
  KEY idx_admin_customer_upper_devices_customer_id (customer_id),
  KEY idx_admin_customer_upper_devices_upper_device_id (upper_device_id),
  CONSTRAINT fk_admin_customer_upper_devices_customer_id FOREIGN KEY (customer_id)
    REFERENCES admin_customers(id) ON DELETE CASCADE,
  CONSTRAINT fk_admin_customer_upper_devices_upper_device_id FOREIGN KEY (upper_device_id)
    REFERENCES upper_devices(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS admin_device_tasks (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  task_id VARCHAR(80) NOT NULL,
  customer_id BIGINT NOT NULL,
  scheduled_task_id BIGINT NULL,
  raw_measurement_id BIGINT NULL,
  imei VARCHAR(32) NOT NULL,
  command_text TEXT NOT NULL,
  command_format VARCHAR(16) NOT NULL DEFAULT 'hex',
  callback_url VARCHAR(500) NULL,
  poll_interval_ms INT NOT NULL DEFAULT 3000,
  timeout_seconds INT NOT NULL DEFAULT 120,
  status VARCHAR(32) NOT NULL DEFAULT 'created',
  callback_status VARCHAR(32) NOT NULL DEFAULT 'pending',
  callback_http_status INT NULL,
  callback_response_text TEXT NULL,
  request_payload LONGTEXT NULL,
  metadata_json LONGTEXT NULL,
  send_response_json LONGTEXT NULL,
  result_payload LONGTEXT NULL,
  error_message VARCHAR(500) NULL,
  sent_at TIMESTAMP NULL,
  deadline_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_admin_device_tasks_task_id (task_id),
  KEY idx_admin_device_tasks_customer_id (customer_id),
  KEY idx_admin_device_tasks_scheduled_task_id (scheduled_task_id),
  KEY idx_admin_device_tasks_imei (imei),
  KEY idx_admin_device_tasks_status (status),
  CONSTRAINT fk_admin_device_tasks_customer_id FOREIGN KEY (customer_id)
    REFERENCES admin_customers(id) ON DELETE CASCADE
);

-- 修复说明：管理端客户列表新增“客户端回调 key”配置后，老库如果缺少 callback_key 字段会直接导致查询和更新失败，这里在初始化阶段自动补列。
ALTER TABLE admin_customers
  ADD COLUMN callback_key VARCHAR(255) NULL AFTER callback_url;

-- 修复说明：管理端设备列表已经按 monitoring_holes.upper_device_id 关联测孔，老库若缺少该字段会直接报 Unknown column，这里对现网做幂等补列。
SET @monitoring_holes_upper_device_column_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'monitoring_holes'
    AND COLUMN_NAME = 'upper_device_id'
);
SET @monitoring_holes_upper_device_column_sql = IF(
  @monitoring_holes_upper_device_column_exists = 0,
  "ALTER TABLE monitoring_holes ADD COLUMN upper_device_id INT NULL COMMENT '关联上位机ID；修复管理端设备列表按上位机关联测孔查询时缺少字段的问题' AFTER lower_device_id",
  'SELECT 1'
);
PREPARE stmt FROM @monitoring_holes_upper_device_column_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 修复说明：补列后需要补索引，避免设备列表按上位机查询测孔时出现全表扫描。
SET @monitoring_holes_upper_device_index_exists = (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'monitoring_holes'
    AND INDEX_NAME = 'idx_monitoring_holes_upper_device_id'
);
SET @monitoring_holes_upper_device_index_sql = IF(
  @monitoring_holes_upper_device_index_exists = 0,
  'ALTER TABLE monitoring_holes ADD INDEX idx_monitoring_holes_upper_device_id (upper_device_id)',
  'SELECT 1'
);
PREPARE stmt FROM @monitoring_holes_upper_device_index_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 修复说明：补索引后继续补外键，保证上位机删除或解绑时测孔引用可以安全置空，避免悬挂引用。
SET @monitoring_holes_upper_device_fk_exists = (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'monitoring_holes'
    AND CONSTRAINT_NAME = 'fk_monitoring_holes_upper_device_id'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @monitoring_holes_upper_device_fk_sql = IF(
  @monitoring_holes_upper_device_fk_exists = 0,
  'ALTER TABLE monitoring_holes ADD CONSTRAINT fk_monitoring_holes_upper_device_id FOREIGN KEY (upper_device_id) REFERENCES upper_devices(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @monitoring_holes_upper_device_fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 修复说明：开始监测前需要按“孔深 = fMonitorTestDis*(wMonitorNodesNum-1) + fMonitorFromStartDis”反算设备参数，
-- 该换算依赖测孔的初始测量距离，这里为老库幂等补齐该字段（单位：米）。
SET @monitoring_holes_initial_distance_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'monitoring_holes'
    AND COLUMN_NAME = 'initial_measurement_distance'
);
SET @monitoring_holes_initial_distance_sql = IF(
  @monitoring_holes_initial_distance_exists = 0,
  "ALTER TABLE monitoring_holes ADD COLUMN initial_measurement_distance DECIMAL(6,3) DEFAULT 0.05 COMMENT '初始测量距离（米），对应设备参数 fMonitorFromStartDis' AFTER measurement_interval",
  'SELECT 1'
);
PREPARE stmt FROM @monitoring_holes_initial_distance_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

ALTER TABLE scheduled_tasks
  ADD COLUMN command_text TEXT NULL,
  ADD COLUMN command_format VARCHAR(16) NOT NULL DEFAULT 'hex',
  ADD COLUMN source_task_id VARCHAR(80) NULL,
  ADD COLUMN source_customer_id BIGINT NULL;

-- 设备仓库与销售管理：每台上位机/下位机独立维护当前库存状态和销售历史。
CREATE TABLE IF NOT EXISTS warehouses (
  id INT PRIMARY KEY AUTO_INCREMENT,
  warehouse_code VARCHAR(64) NOT NULL,
  warehouse_name VARCHAR(128) NOT NULL,
  address VARCHAR(255) NULL,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_warehouses_code (warehouse_code),
  KEY idx_warehouses_status (status)
);

CREATE TABLE IF NOT EXISTS device_inventory (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  warehouse_id INT NOT NULL,
  device_type ENUM('upper', 'lower') NOT NULL,
  upper_device_id INT NULL,
  lower_device_id INT NULL,
  inventory_status ENUM('in_stock', 'sold', 'returned', 'scrapped') NOT NULL DEFAULT 'in_stock',
  customer_id BIGINT NULL,
  stocked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sold_at TIMESTAMP NULL,
  returned_at TIMESTAMP NULL,
  notes VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_device_inventory_upper (upper_device_id),
  UNIQUE KEY uk_device_inventory_lower (lower_device_id),
  KEY idx_device_inventory_status (inventory_status),
  KEY idx_device_inventory_customer (customer_id),
  KEY idx_device_inventory_warehouse (warehouse_id),
  CONSTRAINT fk_device_inventory_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
  CONSTRAINT fk_device_inventory_upper FOREIGN KEY (upper_device_id) REFERENCES upper_devices(id) ON DELETE CASCADE,
  CONSTRAINT fk_device_inventory_lower FOREIGN KEY (lower_device_id) REFERENCES lower_devices(id) ON DELETE CASCADE,
  CONSTRAINT fk_device_inventory_customer FOREIGN KEY (customer_id) REFERENCES admin_customers(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS device_sales (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  inventory_id BIGINT NOT NULL,
  customer_id BIGINT NOT NULL,
  sold_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  returned_at TIMESTAMP NULL,
  sale_status ENUM('active', 'returned') NOT NULL DEFAULT 'active',
  operator_id INT NULL,
  notes VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_device_sales_inventory (inventory_id),
  KEY idx_device_sales_customer (customer_id),
  KEY idx_device_sales_status (sale_status),
  CONSTRAINT fk_device_sales_inventory FOREIGN KEY (inventory_id) REFERENCES device_inventory(id) ON DELETE CASCADE,
  CONSTRAINT fk_device_sales_customer FOREIGN KEY (customer_id) REFERENCES admin_customers(id) ON DELETE RESTRICT,
  CONSTRAINT fk_device_sales_operator FOREIGN KEY (operator_id) REFERENCES users(id) ON DELETE SET NULL
);

INSERT IGNORE INTO warehouses (warehouse_code, warehouse_name, address, status)
VALUES ('MAIN', '主仓库', NULL, 'active');

-- 老数据迁移：没有销售归属的设备进入主仓库，已有客户绑定的上位机按已售出处理。
INSERT IGNORE INTO device_inventory (warehouse_id, device_type, upper_device_id, inventory_status, stocked_at)
SELECT w.id, 'upper', ud.id, 'in_stock', COALESCE(ud.created_at, CURRENT_TIMESTAMP)
FROM warehouses w
CROSS JOIN upper_devices ud
WHERE w.warehouse_code = 'MAIN';

INSERT IGNORE INTO device_inventory (warehouse_id, device_type, lower_device_id, inventory_status, stocked_at)
SELECT w.id, 'lower', ld.id, 'in_stock', COALESCE(ld.created_at, CURRENT_TIMESTAMP)
FROM warehouses w
CROSS JOIN lower_devices ld
WHERE w.warehouse_code = 'MAIN';

UPDATE device_inventory di
JOIN admin_customer_upper_devices acu ON acu.upper_device_id = di.upper_device_id
SET di.inventory_status = 'sold', di.customer_id = acu.customer_id,
    di.sold_at = COALESCE(di.sold_at, CURRENT_TIMESTAMP)
WHERE di.device_type = 'upper';

UPDATE device_inventory di
JOIN device_bindings db ON db.lower_device_id = di.lower_device_id AND db.status = 'active'
JOIN admin_customer_upper_devices acu ON acu.upper_device_id = db.upper_device_id
SET di.inventory_status = 'sold', di.customer_id = acu.customer_id,
    di.sold_at = COALESCE(di.sold_at, CURRENT_TIMESTAMP)
WHERE di.device_type = 'lower';

INSERT INTO device_sales (inventory_id, customer_id, sold_at, sale_status, notes)
SELECT di.id, di.customer_id, COALESCE(di.sold_at, CURRENT_TIMESTAMP), 'active', '历史客户绑定迁移'
FROM device_inventory di
LEFT JOIN device_sales ds ON ds.inventory_id = di.id AND ds.sale_status = 'active'
WHERE di.inventory_status = 'sold' AND di.customer_id IS NOT NULL AND ds.id IS NULL;
