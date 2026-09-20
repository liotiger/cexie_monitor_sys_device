module.exports = {
  find: async function(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;
      const { status, upper_device_id, lower_device_id } = req.query;

      let where = {};
      if (status) where.status = status;
      if (upper_device_id) where.upper_device_id = upper_device_id;
      if (lower_device_id) where.lower_device_id = lower_device_id;

      const total = await DeviceBinding.count(where);
      const list = await DeviceBinding.find(where)
        .skip(skip)
        .limit(limit)
        .sort('created_at DESC');

      const listWithDevices = await Promise.all(list.map(async (binding) => {
        const upperDevice = await UpperDevice.findOne({ id: binding.upper_device_id });
        const lowerDevice = await LowerDevice.findOne({ id: binding.lower_device_id });
        return { ...binding, upperDevice, lowerDevice };
      }));

      return res.json({
        success: true,
        data: { list: listWithDevices, total, page, limit }
      });
    } catch (err) {
      return res.serverError(err);
    }
  },

  create: async function(req, res) {
    try {
      const { upper_device_id, lower_device_id, binding_type } = req.body;

      const upperDevice = await UpperDevice.findOne({ id: upper_device_id });
      if (!upperDevice) {
        return res.status(404).json({ success: false, message: '上位机不存在' });
      }

      const lowerDevice = await LowerDevice.findOne({ id: lower_device_id });
      if (!lowerDevice) {
        return res.status(404).json({ success: false, message: '下位机不存在' });
      }

      const existing = await DeviceBinding.findOne({
        upper_device_id,
        lower_device_id,
        status: 'active'
      });

      if (existing) {
        return res.status(400).json({ success: false, message: '设备已绑定' });
      }

      const binding = await DeviceBinding.create({
        upper_device_id,
        lower_device_id,
        binding_type: binding_type || 'permanent',
        status: 'active',
        bind_time: new Date()
      }).fetch();

      return res.json({ success: true, data: binding });
    } catch (err) {
      if (err.code === 'E_UNIQUE') {
        return res.status(400).json({ success: false, message: '绑定关系已存在' });
      }
      return res.serverError(err);
    }
  },

  update: async function(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const binding = await DeviceBinding.updateOne({ id }).set({ status });
      if (!binding) {
        return res.status(404).json({ success: false, message: '绑定关系不存在' });
      }

      return res.json({ success: true, data: binding });
    } catch (err) {
      return res.serverError(err);
    }
  },

  destroy: async function(req, res) {
    try {
      const { id } = req.params;

      const binding = await DeviceBinding.updateOne({ id }).set({
        status: 'inactive',
        unbind_time: new Date()
      });

      if (!binding) {
        return res.status(404).json({ success: false, message: '绑定关系不存在' });
      }

      return res.json({ success: true, message: '解绑成功' });
    } catch (err) {
      return res.serverError(err);
    }
  },

  getActiveByUpperDevice: async function(req, res) {
    try {
      const { upper_device_id } = req.params;
      const bindings = await DeviceBinding.find({
        upper_device_id,
        status: 'active'
      });

      const result = await Promise.all(bindings.map(async (b) => {
        const lowerDevice = await LowerDevice.findOne({ id: b.lower_device_id });
        return { ...b, lowerDevice };
      }));

      return res.json({ success: true, data: result });
    } catch (err) {
      return res.serverError(err);
    }
  },

  getActiveByLowerDevice: async function(req, res) {
    try {
      const { lower_device_id } = req.params;
      const bindings = await DeviceBinding.find({
        lower_device_id,
        status: 'active'
      });

      const result = await Promise.all(bindings.map(async (b) => {
        const upperDevice = await UpperDevice.findOne({ id: b.upper_device_id });
        return { ...b, upperDevice };
      }));

      return res.json({ success: true, data: result });
    } catch (err) {
      return res.serverError(err);
    }
  }
};
