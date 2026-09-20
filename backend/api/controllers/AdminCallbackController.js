const AuthSupportService = require('../services/AuthSupportService');
const MeasurementProcessingService = require('../services/MeasurementProcessingService');

const ALLOWED_STATUSES = ['completed', 'failed', 'skipped', 'timeout'];

function normalizeOptionalString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const text = String(value).trim();
  return text || null;
}

function normalizeOptionalNumber(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDateTime(value, fallback = new Date()) {
  if (!value) {
    return fallback;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeDateOnly(value) {
  const text = normalizeOptionalString(value);
  if (!text) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    const dateMatch = text.match(/^(\d{4}-\d{2}-\d{2})/);
    return dateMatch ? dateMatch[1] : null;
  }

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(date);
}

function getRawDataDeviceCode(rawData, callbackBody) {
  return normalizeOptionalString(
    rawData.device_code ||
    rawData.deviceCode ||
    (callbackBody.lowerDevice && (callbackBody.lowerDevice.device_code || callbackBody.lowerDevice.deviceCode)) ||
    (callbackBody.metadata && callbackBody.metadata.lowerDeviceCode)
  );
}

function getRawDataUpperImei(rawData, callbackBody) {
  return normalizeOptionalString(
    rawData.upper_imei ||
    rawData.upperImei ||
    (callbackBody.upperDevice && callbackBody.upperDevice.imei) ||
    callbackBody.imei
  );
}

function getRawDataHoleId(rawData, callbackBody) {
  return rawData.hole_id || (callbackBody.metadata && callbackBody.metadata.holeId) || null;
}

function buildMeasurementGroupKey(rawData, callbackBody) {
  return [
    getRawDataDeviceCode(rawData, callbackBody) || '',
    getRawDataHoleId(rawData, callbackBody) || '',
    rawData.measurement_time || '',
    rawData.batch_number || callbackBody.taskId || callbackBody.task_id || ''
  ].join('|');
}

function roundCalculatedNumber(value, digits = 6) {
  if (!Number.isFinite(value)) {
    return null;
  }

  return Number(value.toFixed(digits));
}

function calculateDerivedMeasurements(rawDataItems, callbackBody, lowerDeviceMap) {
  const measurementDerivedMap = new Map();
  const groupedMeasurements = new Map();

  rawDataItems.forEach((rawData) => {
    const measurementUuid = normalizeOptionalString(rawData?.measurement_uuid);
    if (!measurementUuid) {
      return;
    }

    const groupKey = buildMeasurementGroupKey(rawData, callbackBody);
    if (!groupedMeasurements.has(groupKey)) {
      groupedMeasurements.set(groupKey, []);
    }

    groupedMeasurements.get(groupKey).push(rawData);
  });

  groupedMeasurements.forEach((items) => {
    const deviceCode = getRawDataDeviceCode(items[0], callbackBody);
    const lowerDevice = deviceCode ? lowerDeviceMap.get(deviceCode) || null : null;
    // 修复说明：倾角公式依赖下位机标定参数 K 和 beta；这里沿用既有处理逻辑的兜底值，避免缺少标定参数时整批回调直接失败。
    const calibrationK = normalizeOptionalNumber(lowerDevice?.k_value) || 1;
    const calibrationBeta = normalizeOptionalNumber(lowerDevice?.beta_value) || 0;
    let pipeShapeAccumulator = 0;

    items
      .slice()
      // 修复说明：深度管形值要求“从测孔底部往上累加”，因此按深度从大到小排序后逐层累加深度偏移值。
      .sort((left, right) => {
        const leftDepth = normalizeOptionalNumber(left?.depth) || 0;
        const rightDepth = normalizeOptionalNumber(right?.depth) || 0;
        return rightDepth - leftDepth;
      })
      .forEach((rawData) => {
        const measurementUuid = normalizeOptionalString(rawData?.measurement_uuid);
        const positiveValue = normalizeOptionalNumber(rawData?.positive_value);
        const negativeValue = normalizeOptionalNumber(rawData?.negative_value);
        if (!measurementUuid || positiveValue === null || negativeValue === null) {
          return;
        }

        const yAverage = (positiveValue - negativeValue) / 2;
        // 修复说明：Math.asin 只接受 [-1, 1]，这里仅对边界浮点误差做收敛，避免合法临界值因 1.0000000001 这类误差变成 NaN。
        const yOverK = Math.max(-1, Math.min(1, yAverage / calibrationK));
        const inclinationAngle = Math.asin(yOverK) - calibrationBeta;
        const depthOffset = 500 * Math.sin(inclinationAngle);
        pipeShapeAccumulator += depthOffset;

        measurementDerivedMap.set(measurementUuid, {
          y_average: roundCalculatedNumber(yAverage),
          inclination_angle: roundCalculatedNumber(inclinationAngle, 8),
          depth_offset: roundCalculatedNumber(depthOffset),
          pipe_shape_value: roundCalculatedNumber(pipeShapeAccumulator)
        });
      });
  });

  return measurementDerivedMap;
}

async function ensureLowerDevice(rawData, callbackBody) {
  const deviceCode = getRawDataDeviceCode(rawData, callbackBody);
  if (!deviceCode) {
    return null;
  }

  const adminLowerDevice = callbackBody.lowerDevice || {};
  const deviceName = normalizeOptionalString(
    rawData.device_name ||
    rawData.deviceName ||
    adminLowerDevice.device_name ||
    adminLowerDevice.deviceName
  ) || `下位机${deviceCode}`;
  const holeId = getRawDataHoleId(rawData, callbackBody);
  let lowerDevice = await LowerDevice.findOne({ device_code: deviceCode });
  const adminProfilePatch = {
    manufacturer: normalizeOptionalString(adminLowerDevice.manufacturer),
    model: normalizeOptionalString(adminLowerDevice.model),
    serial_number: normalizeOptionalString(adminLowerDevice.serial_number),
    k_value: normalizeOptionalNumber(adminLowerDevice.k_value),
    beta_value: normalizeOptionalNumber(adminLowerDevice.beta_value),
    calibration_date: normalizeDateOnly(adminLowerDevice.calibration_date),
    calibration_org: normalizeOptionalString(adminLowerDevice.calibration_org),
    valid_until: normalizeDateOnly(adminLowerDevice.valid_until),
    calibration_status: ['valid', 'expired', 'pending'].includes(adminLowerDevice.calibration_status)
      ? adminLowerDevice.calibration_status
      : undefined,
    total_measurement_count: normalizeOptionalNumber(adminLowerDevice.total_measurement_count) ?? undefined,
    total_measurement_depth: normalizeOptionalNumber(adminLowerDevice.total_measurement_depth) ?? undefined
  };

  // 修复说明：管理端回调下发原始数据时，客户端若还没有该下位机编码，需要自动补建，避免后续绑定同步和原始数据展示断链。
  if (!lowerDevice) {
    lowerDevice = await LowerDevice.create({
      device_code: deviceCode,
      device_name: deviceName,
      current_hole_id: holeId,
      status: 'measuring',
      ...Object.fromEntries(Object.entries(adminProfilePatch).filter(([, value]) => value !== undefined))
    }).fetch();
    return lowerDevice;
  }

  const patch = {};
  if (!lowerDevice.device_name && deviceName) {
    patch.device_name = deviceName;
  }
  if (holeId && lowerDevice.current_hole_id !== holeId) {
    patch.current_hole_id = holeId;
  }
  if (lowerDevice.status !== 'measuring') {
    patch.status = 'measuring';
  }
  Object.entries(adminProfilePatch).forEach(([key, value]) => {
    if (value !== undefined) {
      patch[key] = value;
    }
  });

  if (Object.keys(patch).length > 0) {
    lowerDevice = await LowerDevice.updateOne({ id: lowerDevice.id }).set(patch);
  }

  return lowerDevice;
}

async function ensureUpperDevice(rawData, callbackBody) {
  const upperImei = getRawDataUpperImei(rawData, callbackBody);
  if (!upperImei) {
    return null;
  }

  const adminUpperDevice = callbackBody.upperDevice || {};
  let upperDevice = await UpperDevice.findOne({ imei: upperImei });
  if (upperDevice) {
    const patch = {};
    ['device_name', 'manufacturer', 'model', 'serial_number', 'firmware_version', 'network_status', 'ip_address', 'signal_strength', 'wire_change_mileage', 'total_mileage', 'inspection_mileage', 'status'].forEach((field) => {
      if (adminUpperDevice[field] !== undefined && adminUpperDevice[field] !== null && adminUpperDevice[field] !== '') {
        patch[field] = adminUpperDevice[field];
      }
    });
    if (Object.keys(patch).length > 0) {
      upperDevice = await UpperDevice.updateOne({ id: upperDevice.id }).set(patch);
    }
    return upperDevice;
  }

  // 修复说明：为了确保上下位机绑定关系一定能落到客户端，本地若还没有该上位机，则按 IMEI 建立最小占位记录。
  return UpperDevice.create({
    imei: upperImei,
    device_name: normalizeOptionalString(adminUpperDevice.device_name) || `DTU_${upperImei}`,
    manufacturer: normalizeOptionalString(adminUpperDevice.manufacturer),
    model: normalizeOptionalString(adminUpperDevice.model),
    serial_number: normalizeOptionalString(adminUpperDevice.serial_number),
    firmware_version: normalizeOptionalString(adminUpperDevice.firmware_version),
    network_status: ['online', 'offline'].includes(adminUpperDevice.network_status) ? adminUpperDevice.network_status : 'offline',
    ip_address: normalizeOptionalString(adminUpperDevice.ip_address),
    signal_strength: normalizeOptionalNumber(adminUpperDevice.signal_strength),
    wire_change_mileage: normalizeOptionalNumber(adminUpperDevice.wire_change_mileage) ?? 0,
    total_mileage: normalizeOptionalNumber(adminUpperDevice.total_mileage) ?? 0,
    inspection_mileage: normalizeOptionalNumber(adminUpperDevice.inspection_mileage) ?? 0,
    status: ['idle', 'active', 'fault', 'calibration_expired'].includes(adminUpperDevice.status) ? adminUpperDevice.status : 'idle'
  }).fetch();
}

async function syncHoleParameters(callbackBody) {
  const parameterUpdate = callbackBody.holeParameterUpdate;
  if (!parameterUpdate || parameterUpdate.status !== 'success') {
    return null;
  }

  const measurementInterval = normalizeOptionalNumber(
    parameterUpdate.fields?.find(item => item?.field === 'measurement_interval')?.value
  );
  const depth = normalizeOptionalNumber(
    parameterUpdate.fields?.find(item => item?.field === 'depth')?.value
  );
  // 修复说明：初始测量距离同样由设备参数推导而来，回调未携带时保持测孔原值不动。
  const initialMeasurementDistance = normalizeOptionalNumber(
    parameterUpdate.fields?.find(item => item?.field === 'initial_measurement_distance')?.value
  );
  if (measurementInterval === null || measurementInterval <= 0 || depth === null || depth <= 0) {
    throw new Error('底部检测回调中的测孔参数无效');
  }

  const upperImei = normalizeOptionalString(parameterUpdate.imei || callbackBody.imei);
  if (!upperImei) {
    throw new Error('底部检测回调缺少上位机 IMEI，无法同步测孔参数');
  }

  const upperDevice = await UpperDevice.findOne({ imei: upperImei });
  if (!upperDevice) {
    throw new Error(`客户端未找到 IMEI ${upperImei} 对应的上位机`);
  }

  const sourceHoleId = normalizeOptionalNumber(parameterUpdate.sourceHoleId);
  const holeCriteria = { upper_device_id: upperDevice.id };
  if (sourceHoleId !== null) {
    holeCriteria.id = sourceHoleId;
  }
  const holes = await MonitoringHole.find(holeCriteria);
  if (!holes.length) {
    const targetDescription = sourceHoleId !== null ? `测孔 ${sourceHoleId}` : `上位机 ${upperImei}`;
    throw new Error(`客户端${targetDescription}未绑定对应上位机，无法同步底部检测参数`);
  }

  const updatedHoles = [];
  for (const hole of holes) {
    const patch = {
      measurement_interval: measurementInterval,
      depth
    };
    if (initialMeasurementDistance !== null && initialMeasurementDistance >= 0) {
      patch.initial_measurement_distance = initialMeasurementDistance;
    }

    const updatedHole = await MonitoringHole.updateOne({ id: hole.id }).set(patch);
    updatedHoles.push({
      id: updatedHole.id,
      hole_number: updatedHole.hole_number,
      previousValues: {
        measurement_interval: hole.measurement_interval,
        depth: hole.depth,
        initial_measurement_distance: hole.initial_measurement_distance
      },
      updatedValues: {
        measurement_interval: updatedHole.measurement_interval,
        depth: updatedHole.depth,
        initial_measurement_distance: updatedHole.initial_measurement_distance
      }
    });
  }

  return {
    imei: upperImei,
    fields: parameterUpdate.fields,
    updatedHoles,
    message: parameterUpdate.message
  };
}

async function syncDeviceBinding(rawData, callbackBody) {
  const lowerDevice = await ensureLowerDevice(rawData, callbackBody);
  const upperDevice = await ensureUpperDevice(rawData, callbackBody);

  if (!lowerDevice || !upperDevice) {
    return null;
  }

  let binding = await DeviceBinding.findOne({
    upper_device_id: upperDevice.id,
    lower_device_id: lowerDevice.id
  });

  // 修复说明：回调原始数据时需要同步上下位机绑定关系；已有绑定则恢复为 active，没有则补建一条。
  if (!binding) {
    binding = await DeviceBinding.create({
      upper_device_id: upperDevice.id,
      lower_device_id: lowerDevice.id,
      binding_type: 'permanent',
      status: 'active',
      bind_time: new Date(),
      unbind_time: null
    }).fetch();
  } else if (binding.status !== 'active') {
    binding = await DeviceBinding.updateOne({ id: binding.id }).set({
      status: 'active',
      bind_time: new Date(),
      unbind_time: null
    });
  }

  return {
    upper_device_id: upperDevice.id,
    upper_imei: upperDevice.imei,
    lower_device_id: lowerDevice.id,
    lower_device_code: lowerDevice.device_code,
    binding_id: binding.id
  };
}

async function ensureMeasurementDeviceId(rawData) {
  const deviceCode = String(rawData.device_code || rawData.deviceCode || '').trim();

  // 修复说明：管理端回调的是新 lower_devices 体系，客户端原始数据表仍依赖旧 devices 外键，这里先建立兼容映射。
  if (deviceCode) {
    let device = await Device.findOne({ device_id: deviceCode });
    if (!device) {
      device = await Device.create({
        device_id: deviceCode,
        device_name: rawData.device_name || `兼容设备-${deviceCode}`,
        device_type: 'lower_device',
        dtu_id: rawData.upper_imei || null,
        current_hole_id: rawData.hole_id || null
      }).fetch();
    }
    return device.id;
  }

  if (rawData.device_id) {
    const device = await Device.findOne({ id: rawData.device_id });
    if (device) {
      return device.id;
    }
  }

  return null;
}

async function mapMeasurementPayload(rawData) {
  if (!rawData || !rawData.measurement_uuid) {
    return null;
  }

  const measurementTime = normalizeDateTime(rawData.measurement_time);
  if (!measurementTime) {
    throw new Error('rawData.measurement_time 格式无效');
  }

  const deviceId = await ensureMeasurementDeviceId(rawData);
  if (!deviceId) {
    throw new Error('rawData.device_id/device_code 缺失或无效');
  }

  return {
    measurement_uuid: rawData.measurement_uuid,
    hole_id: rawData.hole_id,
    device_id: deviceId,
    measurement_time: measurementTime,
    measurement_mode: rawData.measurement_mode || 'scheduled',
    operator_id: rawData.operator_id || null,
    batch_number: rawData.batch_number || null,
    // 修复说明：成果数据“查看全部成果”弹窗需要展示真实节点号，这里把管理端回传点位里的 node 一并落到客户端原始数据表。
    node: normalizeOptionalNumber(rawData.node),
    depth: rawData.depth,
    positive_value: rawData.positive_value,
    negative_value: rawData.negative_value,
    // 修复说明：把回调时按业务公式即时算出的派生参数一并落库，确保原始数据表能直接追溯每个深度的计算结果。
    y_average: normalizeOptionalNumber(rawData.y_average),
    inclination_angle: normalizeOptionalNumber(rawData.inclination_angle),
    depth_offset: normalizeOptionalNumber(rawData.depth_offset),
    pipe_shape_value: normalizeOptionalNumber(rawData.pipe_shape_value),
    temperature: rawData.temperature || null,
    battery_voltage: rawData.battery_voltage || null,
    signal_strength: rawData.signal_strength || null,
    data_status: rawData.data_status || 'raw',
    quality_flag: rawData.quality_flag || 'good',
    upload_time: normalizeDateTime(rawData.upload_time, null),
    processed_time: normalizeDateTime(rawData.processed_time, null)
  };
}

module.exports = {
  receiveTaskCallback: async function(req, res) {
    try {
      if (!AuthSupportService.verifyAdminCallback(req)) {
        return res.status(401).json({
          success: false,
          message: '管理端任务回调鉴权失败'
        });
      }

      const status = String(req.body.status || '').trim();
      const executionTime = normalizeDateTime(req.body.completedAt || req.body.execution_time);
      // 修复说明：管理端已升级为批量回调原始点位，这里同时兼容旧版单条 rawData。
      const rawDataItems = Array.isArray(req.body.rawDataList)
        ? req.body.rawDataList
        : (req.body.rawData ? [req.body.rawData] : []);

      if (!ALLOWED_STATUSES.includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'status 必须是 completed、failed、skipped 或 timeout'
        });
      }

      if (!executionTime) {
        return res.status(400).json({
          success: false,
          message: 'completedAt/execution_time 格式无效'
        });
      }

      const syncedRawMeasurements = [];
      const syncedBindings = [];
      const bindingSyncMap = new Map();
      // 底部检测不产生原始点位，参数同步必须独立于 rawDataList 执行。
      const syncedHoleParameters = await syncHoleParameters(req.body);
      // 修复说明：深度管形值必须基于同一批点位整体计算，先完成上下位机补齐和绑定同步，再统一计算每个深度的派生参数。
      for (const item of rawDataItems) {
        const bindingKey = `${getRawDataDeviceCode(item, req.body) || ''}|${getRawDataUpperImei(item, req.body) || ''}`;
        if (bindingKey !== '|' && !bindingSyncMap.has(bindingKey)) {
          // 修复说明：同一批原始点位通常属于同一对上下位机，这里按设备键去重，避免重复创建或重复更新绑定关系。
          const syncedBinding = await syncDeviceBinding(item, req.body);
          bindingSyncMap.set(bindingKey, syncedBinding);
          if (syncedBinding) {
            syncedBindings.push(syncedBinding);
          }
        } else if (!bindingSyncMap.has(bindingKey)) {
          // 修复说明：当回调里缺少上下位机标识时，不中断原始数据落库，但也不伪造绑定关系。
          bindingSyncMap.set(bindingKey, null);
        }
      }

      const lowerDeviceCodes = [...new Set(
        rawDataItems
          .map(item => getRawDataDeviceCode(item, req.body))
          .filter(Boolean)
      )];
      const lowerDevices = lowerDeviceCodes.length > 0
        ? await LowerDevice.find({ device_code: lowerDeviceCodes })
        : [];
      const lowerDeviceMap = new Map(lowerDevices.map(item => [item.device_code, item]));
      const derivedMeasurementMap = calculateDerivedMeasurements(rawDataItems, req.body, lowerDeviceMap);

      for (const item of rawDataItems) {
        const measurementUuid = normalizeOptionalString(item?.measurement_uuid);
        const derivedMeasurement = measurementUuid ? derivedMeasurementMap.get(measurementUuid) || null : null;
        const rawDataWithDerivedFields = derivedMeasurement
          ? { ...item, ...derivedMeasurement }
          : item;
        const rawMeasurement = await mapMeasurementPayload(rawDataWithDerivedFields);
        if (!rawMeasurement) {
          continue;
        }

        const existingRawMeasurement = await RawMeasurementData.findOne({
          measurement_uuid: rawMeasurement.measurement_uuid
        });

        if (existingRawMeasurement) {
          const syncedRawMeasurement = await RawMeasurementData.updateOne({
            id: existingRawMeasurement.id
          }).set(rawMeasurement);
          syncedRawMeasurements.push(syncedRawMeasurement);
          continue;
        }

        const syncedRawMeasurement = await RawMeasurementData.create(rawMeasurement).fetch();
        syncedRawMeasurements.push(syncedRawMeasurement);
      }

      const holeIds = [...new Set(
        syncedRawMeasurements
          .map(item => Number(item?.hole_id))
          .filter(item => Number.isInteger(item) && item > 0)
      )]
      for (const holeId of holeIds) {
        const hole = await MonitoringHole.findOne({ id: holeId })
        // 修复说明：若该测孔已设置初始管形批次，则每次新原始数据入库后都要立即进入成果计算，保证成果表始终和最新原始数据一致。
        if (hole?.initial_pipe_batch_number) {
          await MeasurementProcessingService.recomputeHoleProcessedResults(holeId)
        }
      }

      return res.json({
        success: true,
        message: '已接收管理端任务回调',
        data: {
          taskId: req.body.taskId || req.body.task_id || null,
          scheduledTaskId: req.body.scheduledTaskId || req.body.task_id || null,
          status,
          executionTime,
          syncedBinding: syncedBindings[0] || null,
          syncedBindings,
          syncedHoleParameters,
          syncedRawMeasurement: syncedRawMeasurements[0] || null,
          syncedRawMeasurements,
          source: req.headers['x-admin-service-name'] || 'admin-service'
        }
      });
    } catch (err) {
      return res.serverError(err);
    }
  }
};
