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

-- 修复说明：现网老库中的 admin_customers 早于 callback_key 字段创建，这里通过补列语句保证客户列表升级后可直接配置客户端回调 key。
ALTER TABLE admin_customers
  ADD COLUMN callback_key VARCHAR(255) NULL AFTER callback_url;

ALTER TABLE scheduled_tasks
  ADD COLUMN command_text TEXT NULL,
  ADD COLUMN command_format VARCHAR(16) NOT NULL DEFAULT 'hex',
  ADD COLUMN source_task_id VARCHAR(80) NULL,
  ADD COLUMN source_customer_id BIGINT NULL;
