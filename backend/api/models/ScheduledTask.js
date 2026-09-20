module.exports = {
  datastore: 'default',
  tableName: 'scheduled_tasks',
  attributes: {
    task_name: {
      type: 'string',
      required: true,
      maxLength: 100
    },
    hole_id: {
      type: 'number',
      required: true
    },
    task_type: {
      type: 'string',
      required: true,
      isIn: ['interval', 'fixed_time', 'immediate']
    },
    interval_seconds: {
      type: 'number',
      allowNull: true
    },
    fixed_time: {
      type: 'string',
      allowNull: true
    },
    start_date: {
      type: 'string',
      allowNull: true
    },
    end_date: {
      type: 'string',
      allowNull: true
    },
    enabled: {
      type: 'boolean',
      defaultsTo: true
    },
    last_executed: {
      type: 'ref',
      columnType: 'datetime'
    },
    next_execution: {
      type: 'ref',
      columnType: 'datetime'
    },
    created_by: {
      type: 'number',
      allowNull: true
    }
  },

  calculateNextExecution(task, referenceTime) {
    if (!task || task.enabled === false) {
      return null;
    }

    const now = normalizeDate(referenceTime) || new Date();

    if (task.task_type === 'immediate') {
      return referenceTime ? null : now;
    }

    if (task.task_type === 'interval') {
      const intervalSeconds = Number(task.interval_seconds);
      if (!intervalSeconds || intervalSeconds <= 0) {
        return null;
      }

      const lastExecuted = normalizeDate(task.last_executed);
      const baseTime = lastExecuted || now;
      let candidate = new Date(baseTime.getTime() + intervalSeconds * 1000);
      const bounds = getTaskBounds(task);

      if (!lastExecuted && bounds.startDate && candidate < bounds.startDate) {
        candidate = new Date(bounds.startDate.getTime());
      }

      return clampWithinBounds(candidate, bounds);
    }

    if (task.task_type === 'fixed_time') {
      const timeParts = parseFixedTime(task.fixed_time);
      if (!timeParts) {
        return null;
      }

      const bounds = getTaskBounds(task);
      const searchStart = bounds.startDate && bounds.startDate > now ? bounds.startDate : now;

      for (let offset = 0; offset <= 366; offset++) {
        const day = new Date(searchStart.getTime());
        day.setHours(0, 0, 0, 0);
        day.setDate(day.getDate() + offset);

        if (bounds.endDate && day > bounds.endDate) {
          return null;
        }

        const candidate = new Date(day.getTime());
        candidate.setHours(timeParts.hour, timeParts.minute, timeParts.second, 0);

        if (candidate >= searchStart) {
          return clampWithinBounds(candidate, bounds);
        }
      }
    }

    return null;
  }
};

function normalizeDate(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseDateOnly(value) {
  if (!value) {
    return null;
  }

  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseFixedTime(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }

  const parts = value.split(':').map(item => parseInt(item, 10));
  if (parts.length < 2 || parts.some(Number.isNaN)) {
    return null;
  }

  return {
    hour: parts[0],
    minute: parts[1],
    second: parts[2] || 0
  };
}

function getTaskBounds(task) {
  const startDate = parseDateOnly(task.start_date);
  const endDate = parseDateOnly(task.end_date);

  if (startDate) {
    startDate.setHours(0, 0, 0, 0);
  }

  if (endDate) {
    endDate.setHours(23, 59, 59, 999);
  }

  return {
    startDate,
    endDate
  };
}

function clampWithinBounds(candidate, bounds) {
  if (!candidate) {
    return null;
  }

  let result = new Date(candidate.getTime());
  if (bounds.startDate && result < bounds.startDate) {
    result = new Date(bounds.startDate.getTime());
  }

  if (bounds.endDate && result > bounds.endDate) {
    return null;
  }

  return result;
}
