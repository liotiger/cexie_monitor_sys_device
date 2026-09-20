<template>
  <view class="page">
    <view class="mobile-shell">
      <view class="page-header">
        <view>
          <text class="eyebrow">设备入口</text>
          <view class="header-row">
            <text class="page-title">所有设备</text>
            <text class="mode-badge">现场测量</text>
          </view>
        </view>
        <button class="refresh-button" :disabled="loading" @click="reload">刷新</button>
      </view>

      <view class="filters">
        <picker :range="projectOptions" range-key="label" :value="projectIndex" @change="onProjectChange">
          <view class="project-picker">
            <text class="picker-label">工程筛选</text>
            <text class="picker-value">{{ currentProjectLabel }}</text>
            <text class="picker-arrow">⌄</text>
          </view>
        </picker>
        <scroll-view class="status-scroll" scroll-x :show-scrollbar="false">
          <view class="status-tabs">
            <button
              v-for="item in statusOptions"
              :key="item.key"
              class="status-tab"
              :class="{ active: status === item.value }"
              @click="setStatus(item.value)"
            >{{ item.label }}</button>
          </view>
        </scroll-view>
      </view>

      <view class="list-heading">
        <view>
          <text class="section-title">设备列表</text>
          <text class="section-caption">{{ currentProjectLabel }}</text>
        </view>
        <text class="count">{{ visibleDevices.length }} 台</text>
      </view>

      <view v-if="loading && !devices.length" class="state-panel">正在加载设备...</view>
      <view v-else-if="!visibleDevices.length" class="state-panel">
        <text class="empty-title">暂无匹配设备</text>
        <text class="empty-copy">调整工程或设备状态后重试</text>
      </view>

      <view v-else class="device-list">
        <view v-for="device in visibleDevices" :key="device.id" class="device-card" @click="openDevice(device)">
          <view class="device-top">
            <view class="device-identity">
              <view class="device-name-row">
                <text class="device-name">{{ device.device_name || `上位机 ${device.id}` }}</text>
                <text class="status-badge" :class="device.viewStatusClass">{{ statusText(device) }}</text>
              </view>
              <text class="device-imei">IMEI {{ device.imei || '-' }}</text>
            </view>
            <button class="enter-button" @click.stop="openDevice(device)">进入操作</button>
          </view>
          <view class="device-meta-grid">
            <view class="meta-item"><text>最后在线</text><strong>{{ formatDateTime(device.last_online_time) }}</strong></view>
            <view class="meta-item"><text>上位机总里程</text><strong>{{ Number(device.total_mileage || 0).toFixed(2) }} m</strong></view>
          </view>
          <text v-if="device.mileage_warnings && device.mileage_warnings.length" class="mileage-warning">{{ device.mileage_warnings.map(item => item.message).join(' ') }}</text>
        </view>
      </view>
    </view>
    <BottomNav activeKey="devices" />
  </view>
</template>

<script>
import BottomNav from '../../components/BottomNav.vue';
import { projectApi, upperDeviceApi } from '../../api';
import { getSelectedProjectId, setSelectedProjectId } from '../../utils/storage';

export default {
  components: { BottomNav },
  data() {
    return {
      loading: false,
      status: '',
      devices: [],
      projectOptions: [{ label: '全部工程', value: null }],
      projectIndex: 0,
      projectDeviceIds: null,
      statusOptions: [
        { key: 'all', label: '全部', value: '' },
        { key: 'online', label: '在线', value: 'online' },
        { key: 'offline', label: '离线', value: 'offline' },
        { key: 'fault', label: '故障', value: 'fault' }
      ]
    };
  },
  computed: {
    currentProjectLabel() {
      return (this.projectOptions[this.projectIndex] && this.projectOptions[this.projectIndex].label) || '全部工程';
    },
    visibleDevices() {
      return this.devices.filter((device) => {
        const network = String(device.network_status || '').toLowerCase();
        const business = String(device.status || '').toLowerCase();
        const statusMatched = !this.status || (this.status === 'fault' ? business === 'fault' : network === this.status);
        const projectMatched = !Array.isArray(this.projectDeviceIds) || this.projectDeviceIds.includes(Number(device.id));
        return statusMatched && projectMatched;
      });
    }
  },
  async onLoad(query) {
    await this.loadProjects(query && query.projectId);
    await this.reload();
  },
  methods: {
    async loadProjects(queryProjectId) {
      try {
        const res = await projectApi.list({ page: 1, limit: 100 });
        const list = (res && res.data && res.data.list) || [];
        this.projectOptions = [{ label: '全部工程', value: null }].concat(list.map(item => ({
          label: item.project_name || item.project_code || `工程 ${item.id}`,
          value: Number(item.id)
        })));
        const targetId = Number(queryProjectId || getSelectedProjectId());
        const index = this.projectOptions.findIndex(item => item.value === targetId);
        this.projectIndex = index > 0 ? index : 0;
        await this.loadProjectDeviceIds();
      } catch (err) {
        this.projectOptions = [{ label: '全部工程', value: null }];
      }
    },
    async loadProjectDeviceIds() {
      const selected = this.projectOptions[this.projectIndex];
      if (!selected || !selected.value) {
        this.projectDeviceIds = null;
        return;
      }
      const res = await projectApi.holes(selected.value);
      const holes = (res && res.data) || [];
      this.projectDeviceIds = holes
        .map(hole => Number(hole.upper_device_id || (hole.upperDevice && hole.upperDevice.id)))
        .filter(id => Number.isFinite(id) && id > 0);
    },
    async onProjectChange(e) {
      this.projectIndex = Number(e && e.detail && e.detail.value) || 0;
      const selected = this.projectOptions[this.projectIndex];
      setSelectedProjectId(selected && selected.value);
      try {
        await this.loadProjectDeviceIds();
      } catch (err) {
        uni.showToast({ title: (err && err.message) || '工程设备加载失败', icon: 'none' });
      }
    },
    setStatus(value) {
      this.status = value;
    },
    async reload() {
      if (this.loading) return;
      this.loading = true;
      try {
        const res = await upperDeviceApi.list({ page: 1, limit: 100 });
        const devices = (res && res.data && res.data.list) || [];
        this.devices = devices.map(device => ({
          ...device,
          viewStatusClass: this.statusClass(device)
        }));
      } catch (err) {
        uni.showToast({ title: (err && err.message) || '设备加载失败', icon: 'none' });
      } finally {
        this.loading = false;
      }
    },
    statusText(device) {
      if (String(device.status || '').toLowerCase() === 'fault') return '故障';
      return String(device.network_status || '').toLowerCase() === 'online' ? '在线' : '离线';
    },
    statusClass(device) {
      if (String(device.status || '').toLowerCase() === 'fault') return 'fault';
      return String(device.network_status || '').toLowerCase() === 'online' ? 'online' : 'offline';
    },
    formatDateTime(value) {
      if (!value) return '-';
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('zh-CN', { hour12: false });
    },
    openDevice(device) {
      uni.navigateTo({ url: `/pages/device-operation/index?id=${device.id}` });
    }
  }
};
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; padding-bottom: 132rpx; background: var(--cexie-background); }
.mobile-shell { width: 100%; max-width: 960rpx; margin: 0 auto; padding: 32rpx 28rpx; box-sizing: border-box; }
.page-header { display: flex; align-items: center; justify-content: space-between; gap: 20rpx; }
.eyebrow { display: block; font-size: 22rpx; color: var(--cexie-muted-foreground); }
.header-row { display: flex; align-items: center; gap: 14rpx; margin-top: 5rpx; }
.page-title { font-size: 38rpx; line-height: 1.3; font-weight: 700; }
.mode-badge { padding: 7rpx 12rpx; border-radius: 6px; background: var(--cexie-primary-soft); color: var(--cexie-primary); font-size: 20rpx; font-weight: 600; }
.refresh-button { width: auto; height: 68rpx; margin: 0; padding: 0 24rpx; border: 1px solid var(--cexie-border); border-radius: 8px; background: var(--cexie-card); color: var(--cexie-primary); font-size: 24rpx; line-height: 68rpx; }
.filters { margin-top: 26rpx; }
.project-picker { position: relative; display: flex; align-items: center; min-height: 84rpx; padding: 0 70rpx 0 22rpx; border: 1px solid var(--cexie-border); border-radius: 8px; background: var(--cexie-card); }
.picker-label { flex: none; margin-right: 18rpx; font-size: 22rpx; color: var(--cexie-muted-foreground); }
.picker-value { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 25rpx; font-weight: 600; }
.picker-arrow { position: absolute; right: 24rpx; font-size: 30rpx; color: var(--cexie-muted-foreground); }
.status-scroll { margin-top: 16rpx; white-space: nowrap; }
.status-tabs { display: inline-flex; gap: 12rpx; padding-right: 24rpx; }
.status-tab { width: auto; min-width: 112rpx; height: 64rpx; margin: 0; padding: 0 24rpx; border: 1px solid var(--cexie-border); border-radius: 6px; background: var(--cexie-card); color: var(--cexie-muted-foreground); font-size: 23rpx; line-height: 64rpx; }
.status-tab.active { border-color: var(--cexie-primary); background: var(--cexie-primary); color: #fff; }
.list-heading { display: flex; align-items: flex-end; justify-content: space-between; margin: 32rpx 0 16rpx; }
.section-title { display: block; font-size: 30rpx; font-weight: 700; }
.section-caption { display: block; max-width: 520rpx; margin-top: 5rpx; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: var(--cexie-muted-foreground); font-size: 21rpx; }
.count { font-size: 22rpx; color: var(--cexie-muted-foreground); }
.device-list { display: flex; flex-direction: column; gap: 16rpx; }
.device-card { padding: 24rpx; border: 1px solid var(--cexie-border); border-radius: 12px; background: var(--cexie-card); box-shadow: var(--cexie-shadow-1); }
.device-top { display: flex; align-items: flex-start; gap: 16rpx; }
.device-identity { flex: 1; min-width: 0; }
.device-name-row { display: flex; align-items: center; gap: 12rpx; }
.device-name { max-width: 330rpx; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 28rpx; font-weight: 700; }
.device-imei { display: block; margin-top: 8rpx; color: var(--cexie-muted-foreground); font-family: monospace; font-size: 21rpx; }
.status-badge { flex: none; padding: 6rpx 11rpx; border-radius: 6px; font-size: 20rpx; font-weight: 600; }
.status-badge.online { background: #e7f4ee; color: var(--cexie-success); }
.status-badge.offline { background: var(--cexie-muted); color: var(--cexie-muted-foreground); }
.status-badge.fault { background: #faecec; color: var(--cexie-error); }
.enter-button { flex: none; width: auto; height: 58rpx; margin: 0; padding: 0 18rpx; border: 1px solid var(--cexie-border); border-radius: 6px; background: var(--cexie-card); color: var(--cexie-primary); font-size: 21rpx; font-weight: 600; line-height: 58rpx; }
.device-meta-grid { margin-top: 22rpx; padding-top: 20rpx; border-top: 1px solid var(--cexie-divider); }
.meta-item { min-width: 0; }
.meta-item text { display: block; color: var(--cexie-muted-foreground); font-size: 21rpx; }
.meta-item strong { display: block; margin-top: 4rpx; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 23rpx; font-weight: 600; }
.mileage-warning { display: block; margin-top: 14rpx; color: #b45309; font-size: 21rpx; line-height: 1.5; }
.state-panel { display: flex; flex-direction: column; align-items: center; gap: 8rpx; padding: 80rpx 20rpx; border: 1px dashed var(--cexie-border); border-radius: 12px; color: var(--cexie-muted-foreground); font-size: 24rpx; }
.empty-title { color: var(--cexie-foreground); font-size: 27rpx; font-weight: 600; }
.empty-copy { font-size: 22rpx; }
</style>
