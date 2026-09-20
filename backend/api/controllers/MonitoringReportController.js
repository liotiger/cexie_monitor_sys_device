module.exports = {
  find: async function(req, res) {
    try {
      const { page = 1, limit = 10, project_id, report_type, start_date, end_date } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      let query = {};
      
      if (project_id) {
        query.project_id = parseInt(project_id);
      }
      
      const validReportTypes = ['daily', 'weekly', 'monthly', 'special'];
      if (report_type && validReportTypes.includes(report_type)) {
        query.report_type = report_type;
      }
      
      if (start_date || end_date) {
        query.report_date = {};
        if (start_date) {
          query.report_date['>='] = start_date;
        }
        if (end_date) {
          query.report_date['<='] = end_date;
        }
      }
      
      const reports = await MonitoringReport.find(query)
        .skip(skip)
        .limit(parseInt(limit))
        .sort('report_date DESC');
      
      const total = await MonitoringReport.count(query);
      
      return res.json({
        success: true,
        data: {
          list: reports,
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
      const report = await MonitoringReport.findOne({ id: req.params.id });
      
      if (!report) {
        return res.status(404).json({
          success: false,
          message: '报表不存在'
        });
      }
      
      return res.json({
        success: true,
        data: report
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  create: async function(req, res) {
    try {
      const {
        report_number,
        report_name,
        project_id,
        report_type,
        report_date,
        period_start,
        period_end,
        summary,
        hole_count,
        measurement_count,
        warning_count,
        max_displacement,
        file_format,
        file_path,
        file_size,
        generated_by
      } = req.body;
      
      if (!report_number) {
        return res.status(400).json({
          success: false,
          message: '报告编号是必填的'
        });
      }
      
      if (!report_name) {
        return res.status(400).json({
          success: false,
          message: '报告名称是必填的'
        });
      }
      
      if (!project_id) {
        return res.status(400).json({
          success: false,
          message: '项目ID是必填的'
        });
      }
      
      const validReportTypes = ['daily', 'weekly', 'monthly', 'special'];
      if (!report_type || !validReportTypes.includes(report_type)) {
        return res.status(400).json({
          success: false,
          message: '报告类型无效'
        });
      }
      
      if (!report_date) {
        return res.status(400).json({
          success: false,
          message: '报告日期是必填的'
        });
      }
      
      const existingReport = await MonitoringReport.findOne({ report_number: report_number });
      
      if (existingReport) {
        return res.status(400).json({
          success: false,
          message: '报告编号已存在'
        });
      }
      
      const validFileFormats = ['excel', 'pdf', 'word'];
      
      const report = await MonitoringReport.create({
        report_number,
        report_name,
        project_id,
        report_type,
        report_date,
        period_start: period_start || null,
        period_end: period_end || null,
        summary: summary || '',
        hole_count: hole_count || 0,
        measurement_count: measurement_count || 0,
        warning_count: warning_count || 0,
        max_displacement: max_displacement || null,
        file_format: validFileFormats.includes(file_format) ? file_format : 'pdf',
        file_path: file_path || '',
        file_size: file_size || null,
        generated_by: generated_by || null,
        generated_at: Date.now()
      }).fetch();
      
      return res.json({
        success: true,
        message: '报表创建成功',
        data: report
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  generate: async function(req, res) {
    try {
      const {
        project_id,
        report_type,
        report_date,
        period_start,
        period_end,
        generated_by
      } = req.body;
      
      if (!project_id) {
        return res.status(400).json({
          success: false,
          message: '项目ID是必填的'
        });
      }
      
      const validReportTypes = ['daily', 'weekly', 'monthly', 'special'];
      if (!report_type || !validReportTypes.includes(report_type)) {
        return res.status(400).json({
          success: false,
          message: '报告类型无效'
        });
      }
      
      if (!report_date) {
        return res.status(400).json({
          success: false,
          message: '报告日期是必填的'
        });
      }
      
      const project = await Project.findOne({ id: project_id });
      if (!project) {
        return res.status(404).json({
          success: false,
          message: '项目不存在'
        });
      }
      
      const holes = await MonitoringHole.find({ project_id: project_id });
      const holeIds = holes.map(h => h.id);
      
      let startTime = null;
      let endTime = null;
      
      if (period_start && period_end) {
        startTime = new Date(period_start).getTime();
        endTime = new Date(period_end).getTime();
      } else {
        const reportDate = new Date(report_date);
        switch (report_type) {
          case 'daily':
            startTime = reportDate.setHours(0, 0, 0, 0);
            endTime = reportDate.setHours(23, 59, 59, 999);
            break;
          case 'weekly':
            const weekStart = new Date(reportDate);
            weekStart.setDate(weekStart.getDate() - weekStart.getDay());
            startTime = weekStart.getTime();
            endTime = reportDate.getTime();
            break;
          case 'monthly':
            startTime = new Date(reportDate.getFullYear(), reportDate.getMonth(), 1).getTime();
            endTime = reportDate.getTime();
            break;
          default:
            startTime = null;
            endTime = null;
        }
      }
      
      let query = { hole_id: { in: holeIds } };
      if (startTime && endTime) {
        query.measurement_time = { '>=': startTime, '<=': endTime };
      }
      
      const results = await ProcessedResultData.find(query);
      
      const hole_count = holes.length;
      const measurement_count = new Set(results.map(r => r.measurement_time)).size;
      const warning_count = results.filter(r => r.warning_level !== 'normal').length;
      const max_displacement = results.length > 0 
        ? Math.max(...results.map(r => Math.abs(r.cumulative_displacement || 0)))
        : 0;
      
      const report_number = `RPT-${project.project_code}-${report_date.replace(/-/g, '')}-${Date.now().toString(slice(-4))}`;
      const report_name = `${project.project_name}${report_type === 'daily' ? '日报' : report_type === 'weekly' ? '周报' : report_type === 'monthly' ? '月报' : '专项报告'}-${report_date}`;
      
      const summary = `本${report_type === 'daily' ? '日' : report_type === 'weekly' ? '周' : report_type === 'monthly' ? '月' : '次'}共监测${hole_count}个测孔，累计测量${measurement_count}次，发现预警${warning_count}次，最大位移${max_displacement.toFixed(2)}mm。`;
      
      const report = await MonitoringReport.create({
        report_number,
        report_name,
        project_id,
        report_type,
        report_date,
        period_start: period_start || null,
        period_end: period_end || null,
        summary,
        hole_count,
        measurement_count,
        warning_count,
        max_displacement,
        file_format: 'pdf',
        generated_by: generated_by || null,
        generated_at: Date.now()
      }).fetch();
      
      return res.json({
        success: true,
        message: '报表生成成功',
        data: report
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  review: async function(req, res) {
    try {
      const { id } = req.params;
      const { reviewed_by, review_notes } = req.body;
      
      if (!reviewed_by) {
        return res.status(400).json({
          success: false,
          message: '审核人ID是必填的'
        });
      }
      
      const report = await MonitoringReport.findOne({ id });
      
      if (!report) {
        return res.status(404).json({
          success: false,
          message: '报表不存在'
        });
      }
      
      if (report.reviewed_at) {
        return res.status(400).json({
          success: false,
          message: '该报表已审核'
        });
      }
      
      const updatedReport = await MonitoringReport.updateOne({ id }).set({
        reviewed_by: reviewed_by,
        reviewed_at: Date.now()
      });
      
      return res.json({
        success: true,
        message: '报表审核成功',
        data: {
          id: updatedReport.id,
          report_number: updatedReport.report_number,
          reviewed_by: updatedReport.reviewed_by,
          reviewed_at: updatedReport.reviewed_at
        }
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  download: async function(req, res) {
    try {
      const { id } = req.params;
      
      const report = await MonitoringReport.findOne({ id });
      
      if (!report) {
        return res.status(404).json({
          success: false,
          message: '报表不存在'
        });
      }
      
      return res.json({
        success: true,
        data: {
          file_path: report.file_path,
          file_name: `${report.report_number}.${report.file_format}`
        }
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  destroy: async function(req, res) {
    try {
      const { id } = req.params;
      
      const report = await MonitoringReport.findOne({ id });
      
      if (!report) {
        return res.status(404).json({
          success: false,
          message: '报表不存在'
        });
      }
      
      await MonitoringReport.destroyOne({ id });
      
      return res.json({
        success: true,
        message: '报表删除成功'
      });
    } catch (err) {
      return res.serverError(err);
    }
  }
};
