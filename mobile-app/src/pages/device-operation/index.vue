<template>
  <view class="page">
    <view class="mobile-shell">
      <view class="page-header">
        <button class="back-button" @click="goBack">‹</button>
        <view class="header-main">
          <text class="eyebrow">设备操作台</text>
          <text class="page-title">{{ device.device_name || `上位机 ${deviceId || '-'}` }}</text>
        </view>
        <text class="status-badge" :class="deviceOnline ? 'online' : 'offline'">{{ deviceOnline ? '在线' : '离线' }}</text>
      </view>

      <view class="device-meta-row">
        <view class="device-meta-item">
          <text>IMEI</text>
          <strong>{{ device.imei || '-' }}</strong>
        </view>
        <view class="device-meta-item last-online">
          <text>最后在线</text>
          <strong>{{ formatDateTime(device.last_online_time) }}</strong>
        </view>
      </view>
      <view class="mileage-row">
        <view><text>换线里程</text><strong>{{ Number(device.wire_change_mileage || 0).toFixed(2) }} m</strong></view>
        <view><text>总里程</text><strong>{{ Number(device.total_mileage || 0).toFixed(2) }} m</strong></view>
        <view><text>检查里程</text><strong>{{ Number(device.inspection_mileage || 0).toFixed(2) }} m</strong></view>
      </view>
      <view v-if="device.mileage_warnings && device.mileage_warnings.length" class="mileage-warning">{{ device.mileage_warnings.map(item => item.message).join(' ') }}</view>

      <view class="panel">
        <view class="panel-head">
          <view><text class="panel-title">现场操作</text><text class="panel-caption">通过现有设备任务接口执行</text></view>
          <button class="text-button" :disabled="loading" @click="loadAll">刷新状态</button>
        </view>
        <view v-if="feedback.text" class="feedback" :class="feedback.type">{{ feedback.text }}</view>
        <view class="action-grid">
          <button class="action primary" :disabled="!deviceOnline || !!actionLoading" @click="execute('monitor')">
            <text>{{ actionLoading === 'monitor' ? '下发中...' : '立即监测' }}</text>
            <small>创建监测任务</small>
          </button>
          <button class="action" :disabled="!deviceOnline || !!actionLoading" @click="execute('home')">
            <text>{{ actionLoading === 'home' ? '下发中...' : '归位' }}</text>
            <small>设备回到初始位置</small>
          </button>
          <button class="action" :disabled="!deviceOnline || !!actionLoading" @click="execute('bottom')">
            <text>{{ actionLoading === 'bottom' ? '下发中...' : '底部检测' }}</text>
            <small>执行孔底检查</small>
          </button>
          <button class="action" :disabled="!deviceOnline || !!actionLoading" @click="execute('status')">
            <text>{{ actionLoading === 'status' ? '下发中...' : '状态检查' }}</text>
            <small>读取设备电池状态</small>
          </button>
        </view>
        <text v-if="!deviceOnline" class="offline-tip">设备离线时不可下发任务，请先检查网络连接。</text>
      </view>

      <view class="panel task-panel">
        <view class="panel-head">
          <view><text class="panel-title">任务回执</text><text class="panel-caption">每 3 秒自动更新</text></view>
          <text class="task-count">最近 {{ tasks.length }} 条</text>
        </view>
        <view v-if="taskLoading && !tasks.length" class="empty-state">正在读取任务回执...</view>
        <view v-else-if="!tasks.length" class="empty-state">当前设备暂无任务记录</view>
        <view v-else class="task-list">
          <view v-for="task in tasks" :key="task.viewKey" class="task-item">
            <view class="task-top">
              <view class="task-identity">
                <text class="task-status" :class="task.viewStatusClass">{{ taskStatusText(task.status) }}</text>
                <text class="task-name">{{ taskTypeText(task) }}</text>
              </view>
              <text class="task-time">{{ formatDateTime(task.createdAt || task.created_at) }}</text>
            </view>
            <text class="task-id">任务 ID {{ task.taskId || task.id || '-' }}</text>
            <text v-if="taskError(task)" class="task-error">{{ taskError(task) }}</text>
            <text v-for="(message, index) in taskResultMessages(task)" :key="index" class="task-result-log">{{ message }}</text>
          </view>
        </view>
      </view>
    </view>

    <BindingGuideDialog
      :visible="bindingVisible"
      title="绑定测孔并开始监测"
      description="当前上位机尚未绑定测孔。请选择空闲测孔，绑定成功后将自动创建监测任务。"
      picker-label="选择测孔"
      :options="bindingOptions"
      :loading="bindingLoading"
      :submitting="bindingSubmitting"
      :error="bindingError"
      empty-text="暂无空闲测孔，请先新增测孔或解绑已有设备。"
      confirm-text="绑定并开始监测"
      @close="closeBindingGuide"
      @confirm="confirmMonitorBinding" />
  </view>
</template>

<script>
import BindingGuideDialog from '../../components/BindingGuideDialog.vue';
import { holeApi, upperDeviceApi } from '../../api';

const STATUS_TEXT = {
  created: '已创建',
  queued: '已下发',
  polling: '执行中',
  completed: '已完成',
  failed: '失败',
  timeout: '超时',
  skipped: '已取消'
};

const TASK_TEXT = {
  monitor_start: '监测',
  home_move: '归位',
  bottom_test: '底部检测',
  set_params: '参数配置',
  status_check: '状态检查'
};

export default {
  components: { BindingGuideDialog },
  data() {
    return {
      deviceId: null,
      device: {},
      tasks: [],
      loading: false,
      taskLoading: false,
      actionLoading: '',
      feedback: { type: '', text: '' },
      bindingVisible: false,
      bindingOptions: [],
      bindingLoading: false,
      bindingSubmitting: false,
      bindingError: '',
      pollTimer: null
    };
  },
  computed: {
    deviceOnline() {
      return String(this.device.network_status || '').toLowerCase() === 'online';
    },
  },
  onLoad(query) {
    const id = Number(query && query.id);
    if (!Number.isFinite(id) || id <= 0) {
      uni.showToast({ title: '设备参数无效', icon: 'none' });
      return;
    }
    this.deviceId = id;
    this._taskStatusMap = new Map();
    this._notifiedTaskStatuses = new Set();
    this._taskStatusSnapshotReady = false;
    this._notificationQueue = [];
    this._notificationVisible = false;
    this.loadAll();
    this.pollTimer = setInterval(() => this.loadTasks(false), 3000);
  },
  onUnload() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this._notificationQueue = [];
  },
  methods: {
    goBack() {
      uni.navigateBack({ delta: 1, fail: () => uni.redirectTo({ url: '/pages/devices/index' }) });
    },
    async loadAll() {
      if (!this.deviceId || this.loading) return;
      this.loading = true;
      try {
        const [deviceRes] = await Promise.all([
          upperDeviceApi.detail(this.deviceId),
          this.loadTasks(true)
        ]);
        this.device = (deviceRes && deviceRes.data) || {};
      } catch (err) {
        uni.showToast({ title: (err && err.message) || '设备信息加载失败', icon: 'none' });
      } finally {
        this.loading = false;
      }
    },
    async loadTasks(showLoading) {
      if (!this.deviceId || this.taskLoading) return;
      if (showLoading) this.taskLoading = true;
      try {
        const res = await upperDeviceApi.monitorTasks(this.deviceId, { limit: 20 });
        const rawTasks = Array.isArray(res && res.data) ? res.data : [];
        const tasks = rawTasks.map((task, index) => ({
          ...task,
          viewKey: String(task.taskId || task.id || `task-${index}`),
          viewStatusClass: this.taskStatusClass(task.status)
        }));
        this.trackTaskNotifications(tasks);
        this.tasks = tasks;
      } catch (err) {
        if (showLoading) uni.showToast({ title: (err && err.message) || '任务回执加载失败', icon: 'none' });
      } finally {
        this.taskLoading = false;
      }
    },
    async execute(type) {
      if (!this.deviceOnline || this.actionLoading) return;
      if (type === 'monitor') {
        await this.prepareMonitorTask();
        return;
      }

      const labels = { home: '归位', bottom: '底部检测', status: '状态检查' };
      this.actionLoading = type;
      this.feedback = { type: '', text: '' };
      try {
        let res;
        if (type === 'home') res = await upperDeviceApi.homeMove(this.deviceId);
        if (type === 'bottom') res = await upperDeviceApi.bottomTest(this.deviceId);
        if (type === 'status') res = await upperDeviceApi.statusCheck(this.deviceId);
        await this.handleTaskCreated(res, labels[type]);
      } catch (err) {
        this.feedback = { type: 'error', text: (err && err.message) || `${labels[type]}任务创建失败` };
      } finally {
        this.actionLoading = '';
      }
    },
    async handleTaskCreated(res, label) {
      const taskId = res && res.data && (res.data.taskId || res.data.id);
      if (taskId !== undefined && taskId !== null) {
        const taskKey = String(taskId);
        if (!this._taskStatusMap.has(taskKey)) this._taskStatusMap.set(taskKey, 'created');
      }
      this.feedback = { type: 'success', text: `${label}任务已创建${taskId ? `，任务 ID ${taskId}` : ''}` };
      await this.loadTasks(false);
    },
    buildMonitorPayload(hole) {
      const project = (hole && hole.project) || {};
      return {
        project: {
          projectId: project.id || hole.project_id || null,
          projectCode: project.project_code || null,
          projectName: project.project_name || null,
          location: project.location || null,
          clientName: project.client_name || null,
          contractor: project.contractor || null,
          supervisor: project.supervisor || null,
          startDate: project.start_date || null,
          endDate: project.end_date || null,
          status: project.status || null
        },
        hole: {
          holeId: hole.id,
          holeNumber: hole.hole_number,
          holeName: hole.hole_name || null,
          holeType: hole.hole_type || null,
          locationDescription: hole.location_description || null,
          depth: hole.depth,
          measurementInterval: hole.measurement_interval,
          // 修复说明：管理端开始监测前要用孔深、测量间隔、初始测量距离反算设备监测节点数。
          initialMeasurementDistance: hole.initial_measurement_distance ?? hole.initialMeasurementDistance ?? null,
          upperDeviceId: this.deviceId
        },
        metadata: {
          source: 'mobile-h5',
          triggerSource: 'mobile-device-operation',
          projectId: project.id || hole.project_id || null,
          holeId: hole.id,
          holeNo: hole.hole_number,
          holeNumber: hole.hole_number,
          holeName: hole.hole_name || null
        }
      };
    },
    async prepareMonitorTask() {
      this.actionLoading = 'monitor';
      this.feedback = { type: '', text: '' };
      try {
        const response = await holeApi.list({ page: 1, limit: 1, upper_device_id: this.deviceId });
        const boundHole = response && response.data && response.data.list && response.data.list[0];
        if (!boundHole) {
          await this.openBindingGuide();
          return;
        }
        await this.submitMonitorTask(boundHole);
      } catch (err) {
        this.feedback = { type: 'error', text: (err && err.message) || '测孔绑定关系检查失败' };
      } finally {
        this.actionLoading = '';
      }
    },
    async submitMonitorTask(hole) {
      const response = await upperDeviceApi.startMonitor(this.deviceId, this.buildMonitorPayload(hole));
      await this.handleTaskCreated(response, '立即监测');
    },
    async openBindingGuide() {
      this.bindingVisible = true;
      this.bindingOptions = [];
      this.bindingError = '';
      this.bindingLoading = true;
      try {
        const response = await holeApi.list({ page: 1, limit: 1000 });
        const holes = (response && response.data && response.data.list) || [];
        this.bindingOptions = holes
          .filter(hole => !hole.upper_device_id)
          .map(hole => ({
            value: hole.id,
            item: hole,
            label: `${(hole.project && hole.project.project_name) || '未命名工程'} / ${hole.hole_name || hole.hole_number || `测孔#${hole.id}`}（${hole.hole_number || '-'}）`
          }));
      } catch (err) {
        this.bindingError = (err && err.message) || '可绑定测孔加载失败';
      } finally {
        this.bindingLoading = false;
      }
    },
    closeBindingGuide() {
      if (this.bindingSubmitting) return;
      this.bindingVisible = false;
      this.bindingOptions = [];
      this.bindingError = '';
    },
    async confirmMonitorBinding(option) {
      if (!option || !option.item || this.bindingSubmitting) return;
      const hole = option.item;
      let bindingCompleted = false;
      this.bindingSubmitting = true;
      this.bindingError = '';
      try {
        await holeApi.bindDevice(hole.id, {
          upper_device_id: this.deviceId,
          bind_type: 'manual',
          bind_reason: '移动端立即监测前绑定测孔'
        });
        bindingCompleted = true;
        this.bindingVisible = false;
        this.bindingOptions = [];
        this.actionLoading = 'monitor';
        await this.submitMonitorTask({ ...hole, upper_device_id: this.deviceId, upperDevice: this.device });
      } catch (err) {
        const message = (err && err.message) || (bindingCompleted ? '监测任务创建失败' : '绑定测孔失败');
        if (bindingCompleted) {
          this.feedback = { type: 'error', text: `测孔已绑定，但监测任务创建失败：${message}` };
        } else {
          this.bindingError = message;
        }
      } finally {
        this.actionLoading = '';
        this.bindingSubmitting = false;
      }
    },
    trackTaskNotifications(tasks) {
      const snapshotReady = this._taskStatusSnapshotReady;
      tasks.forEach((task) => {
        const taskId = task.taskId || task.id;
        if (taskId === undefined || taskId === null) return;
        const taskKey = String(taskId);
        const status = String(task.status || '').toLowerCase();
        const previousStatus = this._taskStatusMap.get(taskKey);
        this._taskStatusMap.set(taskKey, status);
        const isTerminal = status === 'completed' || status === 'failed' || status === 'timeout';
        if (!isTerminal || !snapshotReady || previousStatus === status) return;
        this.enqueueTaskNotification(task, status);
      });
      this._taskStatusSnapshotReady = true;
    },
    enqueueTaskNotification(task, status) {
      const taskId = task.taskId || task.id || '-';
      const notificationKey = `${taskId}:${status}`;
      if (this._notifiedTaskStatuses.has(notificationKey)) return;
      this._notifiedTaskStatuses.add(notificationKey);
      const taskName = this.taskTypeText(task);
       const error = this.taskError(task);
       const resultMessages = this.taskResultMessages(task);
      const completed = status === 'completed';
      const timeout = status === 'timeout';
      this._notificationQueue.push({
        title: completed ? '任务执行完成' : '任务执行失败',
        content: completed
          ? `${taskName}任务已执行完成。${resultMessages.length ? `\n${resultMessages.join('\n')}` : ''}\n任务 ID：${taskId}`
          : `${taskName}任务${timeout ? '执行超时' : '执行失败'}${error ? `：${error}` : '。'}\n任务 ID：${taskId}`
      });
      this.showNextTaskNotification();
    },
    showNextTaskNotification() {
      if (this._notificationVisible || !this._notificationQueue.length) return;
      const notification = this._notificationQueue.shift();
      this._notificationVisible = true;
      uni.showModal({
        title: notification.title,
        content: notification.content,
        showCancel: false,
        confirmText: '知道了',
        complete: () => {
          this._notificationVisible = false;
          this.showNextTaskNotification();
        }
      });
    },
    taskStatusText(status) {
      return STATUS_TEXT[status] || status || '-';
    },
    taskStatusClass(status) {
      if (status === 'completed') return 'success';
      if (status === 'failed' || status === 'timeout') return 'error';
      return 'pending';
    },
    taskTypeText(task) {
      const type = (task.metadata && task.metadata.taskType) || (task.requestPayload && task.requestPayload.taskType) || task.taskType;
      if (TASK_TEXT[type]) return TASK_TEXT[type];
      const commandMap = { MONITOR_START: '监测', HOME_MOVE: '归位', BOTTOM_TEST: '底部检测' };
      return commandMap[task.commandText] || type || '设备任务';
    },
    taskError(task) {
      return task.errorMessage || (task.resultPayload && task.resultPayload.gatewayResult && task.resultPayload.gatewayResult.err_message) || '';
    },
    taskResultMessages(task) {
      const logs = task && task.resultPayload && task.resultPayload.taskLogs;
      return Array.isArray(logs)
        ? logs.filter(log => log && log.level !== 'error' && log.message).map(log => log.message)
        : [];
    },
    formatDateTime(value) {
      if (!value) return '-';
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('zh-CN', { hour12: false });
    }
  }
};
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: var(--cexie-background); }
.mobile-shell { width: 100%; max-width: 960rpx; margin: 0 auto; padding: 30rpx 28rpx 60rpx; box-sizing: border-box; }
.page-header { display: flex; align-items: center; gap: 18rpx; }
.back-button { flex: none; width: 68rpx; height: 68rpx; margin: 0; padding: 0; border: 1px solid var(--cexie-border); border-radius: 8px; background: var(--cexie-card); color: var(--cexie-primary); font-size: 48rpx; line-height: 60rpx; }
.header-main { flex: 1; min-width: 0; }
.eyebrow { display: block; font-size: 21rpx; color: var(--cexie-muted-foreground); }
.page-title { display: block; margin-top: 3rpx; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 34rpx; font-weight: 700; }
.status-badge { flex: none; padding: 8rpx 15rpx; border-radius: 6px; font-size: 21rpx; font-weight: 600; }
.status-badge.online { background: #e7f4ee; color: var(--cexie-success); }
.status-badge.offline { background: var(--cexie-muted); color: var(--cexie-muted-foreground); }
.device-meta-row { display: flex; align-items: flex-start; gap: 20rpx; margin-top: 26rpx; padding: 18rpx 20rpx; border: 1px solid var(--cexie-border); border-radius: 8px; background: var(--cexie-card); }
.device-meta-item { min-width: 0; flex: 1; }
.device-meta-item.last-online { flex: 0 0 44%; }
.device-meta-item text { display: block; color: var(--cexie-muted-foreground); font-size: 20rpx; }
.device-meta-item strong { display: block; margin-top: 5rpx; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 22rpx; }
.mileage-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12rpx; margin-top: 18rpx; }
.mileage-row view { min-width: 0; padding: 16rpx; border: 1px solid var(--cexie-border); border-radius: 8px; background: var(--cexie-card); }
.mileage-row text { display: block; color: var(--cexie-muted-foreground); font-size: 19rpx; }
.mileage-row strong { display: block; margin-top: 5rpx; font-size: 22rpx; }
.mileage-warning { display: block; margin-top: 14rpx; color: var(--cexie-warning); font-size: 21rpx; line-height: 1.5; }
.panel { margin-top: 20rpx; padding: 26rpx; border: 1px solid var(--cexie-border); border-radius: 12px; background: var(--cexie-card); box-shadow: var(--cexie-shadow-1); }
.panel-head { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; }
.panel-title { display: block; font-size: 28rpx; font-weight: 700; }
.panel-caption { display: block; margin-top: 5rpx; color: var(--cexie-muted-foreground); font-size: 20rpx; }
.text-button { width: auto; height: 56rpx; margin: 0; padding: 0 16rpx; border: 0; background: transparent; color: var(--cexie-primary); font-size: 22rpx; line-height: 56rpx; }
.action-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14rpx; margin-top: 22rpx; }
.action { display: flex; flex-direction: column; align-items: flex-start; justify-content: center; width: 100%; min-height: 108rpx; margin: 0; padding: 16rpx 20rpx; border: 1px solid var(--cexie-border); border-radius: 8px; background: var(--cexie-card); color: var(--cexie-foreground); text-align: left; line-height: 1.3; }
.action.primary { grid-column: 1 / -1; border-color: var(--cexie-primary); background: var(--cexie-primary); color: #fff; }
.action text { font-size: 25rpx; font-weight: 700; }
.action small { display: block; margin-top: 6rpx; opacity: .72; font-size: 19rpx; }
.action[disabled] { opacity: .45; }
.offline-tip { display: block; margin-top: 16rpx; color: var(--cexie-warning); font-size: 20rpx; line-height: 1.6; }
.feedback { margin-top: 18rpx; padding: 16rpx 18rpx; border-radius: 8px; font-size: 22rpx; line-height: 1.5; }
.feedback.success { background: #e7f4ee; color: var(--cexie-success); }
.feedback.error { background: #faecec; color: var(--cexie-error); }
.task-count { flex: none; color: var(--cexie-muted-foreground); font-size: 20rpx; }
.task-list { margin-top: 16rpx; }
.task-item { padding: 20rpx 0; border-top: 1px solid var(--cexie-divider); }
.task-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 15rpx; }
.task-identity { display: flex; align-items: center; gap: 10rpx; min-width: 0; }
.task-status { flex: none; padding: 5rpx 9rpx; border-radius: 5px; font-size: 19rpx; font-weight: 600; }
.task-status.success { background: #e7f4ee; color: var(--cexie-success); }
.task-status.error { background: #faecec; color: var(--cexie-error); }
.task-status.pending { background: var(--cexie-primary-soft); color: var(--cexie-primary); }
.task-name { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 23rpx; font-weight: 700; }
.task-time { flex: none; color: var(--cexie-muted-foreground); font-size: 19rpx; }
.task-id { display: block; margin-top: 10rpx; color: var(--cexie-muted-foreground); font-family: monospace; font-size: 19rpx; }
.task-error { display: block; margin-top: 10rpx; color: var(--cexie-error); font-size: 21rpx; line-height: 1.5; }
.task-result-log { display: block; margin-top: 10rpx; color: var(--cexie-success); font-size: 21rpx; line-height: 1.5; }
.empty-state { margin-top: 20rpx; padding: 50rpx 10rpx; text-align: center; color: var(--cexie-muted-foreground); font-size: 22rpx; }
</style>
