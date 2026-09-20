module.exports = {
  find: async function(req, res) {
    try {
      const { page = 1, limit = 20, config_type, search } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      let query = {};
      
      if (config_type) {
        query.config_type = config_type;
      }
      
      if (search) {
        query.or = [
          { config_key: { contains: search } },
          { description: { contains: search } }
        ];
      }
      
      const configs = await SystemConfig.find(query)
        .skip(skip)
        .limit(parseInt(limit))
        .sort('created_at DESC');
      
      const total = await SystemConfig.count(query);
      
      return res.json({
        success: true,
        data: {
          list: configs,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            totalPages: Math.ceil(total / parseInt(limit))
          }
        }
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  findOne: async function(req, res) {
    try {
      const config = await SystemConfig.findOne({ id: req.params.id });
      
      if (!config) {
        return res.status(404).json({
          success: false,
          message: '配置不存在'
        });
      }
      
      return res.json({
        success: true,
        data: config
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  get: async function(req, res) {
    try {
      const { key } = req.params;
      
      if (!key) {
        return res.status(400).json({
          success: false,
          message: '配置键是必填的'
        });
      }
      
      const config = await SystemConfig.findOne({ config_key: key });
      
      if (!config) {
        return res.status(404).json({
          success: false,
          message: '配置不存在'
        });
      }
      
      return res.json({
        success: true,
        data: {
          key: config.config_key,
          value: config.config_value,
          type: config.config_type,
          description: config.description
        }
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  create: async function(req, res) {
    try {
      const { config_key, config_value, config_type, description } = req.body;
      
      if (!config_key) {
        return res.status(400).json({
          success: false,
          message: '配置键是必填的'
        });
      }
      
      const existingConfig = await SystemConfig.findOne({ config_key: config_key });
      
      if (existingConfig) {
        return res.status(400).json({
          success: false,
          message: '配置键已存在'
        });
      }
      
      const config = await SystemConfig.create({
        config_key,
        config_value: config_value || '',
        config_type: config_type || '',
        description: description || ''
      }).fetch();
      
      return res.json({
        success: true,
        message: '配置创建成功',
        data: config
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  update: async function(req, res) {
    try {
      const { id } = req.params;
      const updateData = {};
      
      const allowedFields = ['config_key', 'config_value', 'config_type', 'description'];
      
      allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
          updateData[field] = req.body[field];
        }
      });
      
      if (updateData.config_key) {
        const existingConfig = await SystemConfig.findOne({
          config_key: updateData.config_key,
          id: { '!=': id }
        });
        
        if (existingConfig) {
          return res.status(400).json({
            success: false,
            message: '配置键已存在'
          });
        }
      }
      
      const config = await SystemConfig.updateOne({ id }).set(updateData);
      
      if (!config) {
        return res.status(404).json({
          success: false,
          message: '配置不存在'
        });
      }
      
      return res.json({
        success: true,
        message: '配置更新成功',
        data: config
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  upsert: async function(req, res) {
    try {
      const { config_key, config_value, config_type, description } = req.body;
      
      if (!config_key) {
        return res.status(400).json({
          success: false,
          message: '配置键是必填的'
        });
      }
      
      const existingConfig = await SystemConfig.findOne({ config_key: config_key });
      
      let config;
      
      if (existingConfig) {
        const updateData = {
          updated_at: Date.now()
        };
        
        if (config_value !== undefined) {
          updateData.config_value = config_value;
        }
        if (config_type !== undefined) {
          updateData.config_type = config_type;
        }
        if (description !== undefined) {
          updateData.description = description;
        }
        
        config = await SystemConfig.updateOne({ id: existingConfig.id }).set(updateData);
      } else {
        config = await SystemConfig.create({
          config_key,
          config_value: config_value || '',
          config_type: config_type || '',
          description: description || ''
        }).fetch();
      }
      
      return res.json({
        success: true,
        message: existingConfig ? '配置更新成功' : '配置创建成功',
        data: config
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  destroy: async function(req, res) {
    try {
      const { id } = req.params;
      
      const config = await SystemConfig.destroyOne({ id });
      
      if (!config) {
        return res.status(404).json({
          success: false,
          message: '配置不存在'
        });
      }
      
      return res.json({
        success: true,
        message: '配置删除成功'
      });
    } catch (err) {
      return res.serverError(err);
    }
  }
};
