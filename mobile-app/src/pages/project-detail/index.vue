<template>
  <view class="page">
    <view class="cexie-container">
      <view class="cexie-card tab-bar">
        <view class="tab" :class="{ active: activeTab === 'info' }" @click="switchTab('info')">工程信息</view>
        <view class="tab" :class="{ active: activeTab === 'holes' }" @click="switchTab('holes')">测孔列表</view>
      </view>

      <view class="cexie-spacer-16" />

      <view v-if="activeTab === 'info'" class="cexie-card">
        <view class="cexie-title cexie-title-md">{{ project.project_name || '-' }}</view>
        <view class="cexie-spacer-14" />
        <view class="info-row"><text class="info-label">工程编号</text><text class="info-value">{{ project.project_code || '-' }}</text></view>
        <view class="info-row"><text class="info-label">业主单位</text><text class="info-value">{{ project.client_name || '-' }}</text></view>
        <view class="info-row"><text class="info-label">工程位置</text><text class="info-value">{{ project.location || '-' }}</text></view>
        <view class="info-row"><text class="info-label">施工单位</text><text class="info-value">{{ project.contractor || '-' }}</text></view>
        <view class="info-row"><text class="info-label">监理单位</text><text class="info-value">{{ project.supervisor || '-' }}</text></view>
        <view class="info-row"><text class="info-label">开始日期</text><text class="info-value">{{ project.start_date || '-' }}</text></view>
        <view class="info-row"><text class="info-label">结束日期</text><text class="info-value">{{ project.end_date || '-' }}</text></view>
        <view class="info-row"><text class="info-label">工程状态</text><text class="info-value">{{ statusText(project.status) }}</text></view>
        <view class="info-row"><text class="info-label">测孔数量</text><text class="info-value">{{ project.hole_count || 0 }}</text></view>
        <view class="info-row"><text class="info-label">成员数量</text><text class="info-value">{{ project.member_count || 0 }}</text></view>
      </view>

      <view v-else class="cexie-card">
        <view class="cexie-row">
          <view class="cexie-title cexie-title-sm">测孔列表</view>
          <view class="hole-head-actions">
            <button size="mini" @click="load">刷新</button>
            <button size="mini" class="add-button" @click="openCreateHole">新增测孔</button>
          </view>
        </view>
        <view class="cexie-spacer-12" />

        <view v-for="hole in holes" :key="hole.id" class="hole" @click="openHole(hole)">
          <view class="cexie-row">
            <view class="name">{{ hole.hole_name || hole.hole_number || '-' }}</view>
            <view class="hole-item-right">
              <view class="badge" :class="hole.viewBadgeClass">{{ badgeText(hole) }}</view>
              <button size="mini" class="edit-button" @click.stop="openEditHole(hole)">编辑</button>
            </view>
          </view>
          <view class="meta">编号 {{ hole.hole_number || '-' }}</view>
          <view class="meta">上位机 {{ upperDeviceImei(hole) }}</view>
        </view>

        <view v-if="!loading && !holes.length" class="empty">暂无测孔</view>
        <view v-if="loading" class="empty">加载中...</view>
      </view>
    </view>

    <view v-if="showHoleDialog" class="dialog-mask" @click="closeHoleDialog">
      <view class="dialog" @click.stop>
        <view class="dialog-head">
          <text class="dialog-title">{{ holeEditingId ? '编辑测孔' : '新增测孔' }}</text>
          <text class="dialog-close" @click="closeHoleDialog">×</text>
        </view>
        <view class="dialog-body">
          <view class="form-item">
            <text class="form-label">测孔编号 <text class="required">*</text></text>
            <input class="form-input" v-model="holeForm.hole_number" placeholder="请输入测孔编号" />
          </view>
          <view class="form-item">
            <text class="form-label">测孔名称</text>
            <input class="form-input" v-model="holeForm.hole_name" placeholder="请输入测孔名称" />
          </view>
          <view class="form-item">
            <text class="form-label">测孔类型</text>
            <view class="type-toggle">
              <view class="type-toggle-item" :class="{ active: holeForm.hole_type === 'retaining_structure' }" @click="setHoleType('retaining_structure')">围护结构</view>
              <view class="type-toggle-item" :class="{ active: holeForm.hole_type === 'soil_body' }" @click="setHoleType('soil_body')">土体</view>
            </view>
          </view>
          <view class="form-item">
            <text class="form-label">孔深(m) <text class="required">*</text></text>
            <input class="form-input" type="number" v-model="holeForm.depth" placeholder="请输入孔深" />
          </view>
          <view class="form-item">
            <text class="form-label">初始测量距离(m)</text>
            <input class="form-input" type="number" v-model="holeForm.initial_measurement_distance" placeholder="默认为 0.05" />
          </view>
          <view class="form-item">
            <text class="form-label">黄色预警值(mm)</text>
            <input class="form-input" type="number" v-model="holeForm.warning_yellow_threshold" placeholder="选填" />
          </view>
          <view class="form-item">
            <text class="form-label">红色预警值(mm)</text>
            <input class="form-input" type="number" v-model="holeForm.warning_red_threshold" placeholder="选填" />
          </view>
          <view class="form-item">
            <text class="form-label">绑定上位机</text>
            <view class="device-select">
              <view class="device-select-trigger" @click="toggleDeviceSelect">
                <text class="device-select-value" :class="{ placeholder: !holeForm.upper_device_id }">{{ currentUpperDeviceLabel }}</text>
                <text class="device-select-arrow" :class="{ open: showDeviceSelect }">⌄</text>
              </view>
              <view v-if="showDeviceSelect" class="device-select-options">
                <view
                  v-for="option in upperDeviceOptions"
                  :key="option.value === null ? 'none' : option.value"
                  class="device-select-option"
                  :class="{ active: isOptionActive(option) }"
                  @click="selectUpperDevice(option)"
                >
                  <view class="device-option-main">
                    <view class="device-option-info">
                      <text class="device-option-name">{{ option.label }}</text>
                      <text v-if="option.sublabel" class="device-option-imei">{{ option.sublabel }}</text>
                    </view>
                    <text v-if="option.value !== null" class="device-option-status" :class="option.online ? 'online' : 'offline'">{{ option.online ? '在线' : '离线' }}</text>
                    <text v-if="isOptionActive(option)" class="device-option-check">✓</text>
                  </view>
                </view>
                <view v-if="upperDevicesLoading" class="device-select-empty">加载中...</view>
                <view v-else-if="!upperDevices.length" class="device-select-empty">暂无可绑定的上位机</view>
              </view>
            </view>
          </view>
          <view v-if="holeError" class="form-error">{{ holeError }}</view>
        </view>
        <view class="dialog-foot">
          <button class="cancel-button" @click="closeHoleDialog">取消</button>
          <button class="save-button" :disabled="holeSubmitting" @click="submitHole">{{ holeSubmitting ? '保存中...' : '保存' }}</button>
        </view>
      </view>
    </view>

    <BottomNav activeKey="projects" />
  </view>
</template>

<script>
import BottomNav from '../../components/BottomNav.vue';
import { projectApi, holeApi, upperDeviceApi } from '../../api';
import { setSelectedProjectId } from '../../utils/storage';

export default {
  components: { BottomNav },
  data() {
    return {
      projectId: null,
      project: {},
      holes: [],
      loading: false,
      activeTab: 'holes',
      showHoleDialog: false,
      showDeviceSelect: false,
      holeEditingId: null,
      holeSubmitting: false,
      holeError: '',
      upperDevices: [],
      upperDevicesLoading: false,
      holeForm: {
        hole_number: '',
        hole_name: '',
        hole_type: 'retaining_structure',
        depth: '',
        initial_measurement_distance: '0.05',
        warning_yellow_threshold: '',
        warning_red_threshold: '',
        upper_device_id: null
      }
    };
  },
  computed: {
    upperDeviceOptions() {
      const options = [{ value: null, label: '不绑定', sublabel: '', online: false }];
      this.upperDevices.forEach(d => {
        const name = d.device_name || `上位机 ${d.id}`;
        const imei = d.imei || '-';
        const online = String(d.network_status || '').toLowerCase() === 'online';
        options.push({
          value: d.id,
          label: name,
          sublabel: `IMEI: ${imei}`,
          online
        });
      });
      return options;
    },
    currentUpperDeviceLabel() {
      const option = this.upperDeviceOptions.find(o => this.isOptionActive(o));
      if (!option || option.value === null) {
        return '不绑定';
      }
      return `${option.label}（${option.online ? '在线' : '离线'}）`;
    }
  },
  onLoad(query) {
    const id = parseInt(query && query.id, 10);
    if (Number.isFinite(id) && id > 0) {
      this.projectId = id;
      setSelectedProjectId(id);
      // 修复说明：进入工程详情默认展示测孔列表，仅显式携带 tab=info 时展示工程信息。
      this.activeTab = (query && query.tab) === 'info' ? 'info' : 'holes';
      this.load();
    }
  },
  methods: {
    switchTab(tab) {
      this.activeTab = tab;
    },
    statusText(status) {
      const map = { planning: '规划中', ongoing: '进行中', paused: '已暂停', completed: '已完成' };
      return map[status] || status || '-';
    },
    upperDeviceImei(hole) {
      return (hole && hole.upperDevice && hole.upperDevice.imei) ? hole.upperDevice.imei : '-';
    },
    upperDeviceId(hole) {
      const id = hole && (hole.upper_device_id || (hole.upperDevice && hole.upperDevice.id));
      const numericId = Number(id);
      return Number.isFinite(numericId) && numericId > 0 ? numericId : null;
    },
    badgeText(hole) {
      const status = (hole && hole.upperDevice && (hole.upperDevice.network_status || hole.upperDevice.status)) || '';
      if (status === 'online') {
        return '在线';
      }
      if (hole && hole.upperDevice) {
        return '离线';
      }
      return '未绑定';
    },
    badgeClass(hole) {
      const status = (hole && hole.upperDevice && (hole.upperDevice.network_status || hole.upperDevice.status)) || '';
      if (status === 'online') {
        return 'online';
      }
      if (hole && hole.upperDevice) {
        return 'offline';
      }
      return 'unbound';
    },
    async load() {
      if (!this.projectId || this.loading) {
        return;
      }
      this.loading = true;
      try {
        const [detailRes, holesRes] = await Promise.all([
          projectApi.detail(this.projectId),
          projectApi.holes(this.projectId)
        ]);
        this.project = (detailRes && detailRes.data) || {};
        const holes = (holesRes && holesRes.data) || [];
        this.holes = holes.map(hole => ({
          ...hole,
          viewBadgeClass: this.badgeClass(hole)
        }));
      } catch (err) {
        uni.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
      } finally {
        this.loading = false;
      }
    },
    openHole(hole) {
      const name = encodeURIComponent((hole && hole.hole_name) || '');
      const number = encodeURIComponent((hole && hole.hole_number) || '');
      const deviceId = this.upperDeviceId(hole);
      uni.navigateTo({ url: `/pages/hole-monitor/index?id=${hole.id}&name=${name}&number=${number}&deviceId=${deviceId || ''}` });
    },
    async openCreateHole() {
      this.holeEditingId = null;
      this.holeForm = {
        hole_number: '',
        hole_name: '',
        hole_type: 'retaining_structure',
        depth: '',
        initial_measurement_distance: '0.05',
        warning_yellow_threshold: '',
        warning_red_threshold: '',
        upper_device_id: null
      };
      this.upperDevices = [];
      this.holeError = '';
      this.showDeviceSelect = false;
      this.showHoleDialog = true;
      // 修复说明：新增测孔时同样支持绑定上位机，这里加载空闲上位机供选择。
      await this.loadUpperDevicesForHole(null);
    },
    async openEditHole(hole) {
      this.holeEditingId = hole.id;
      this.holeForm = {
        hole_number: hole.hole_number || '',
        hole_name: hole.hole_name || '',
        hole_type: hole.hole_type || 'retaining_structure',
        depth: hole.depth !== undefined && hole.depth !== null ? String(hole.depth) : '',
        // 修复说明：初始测量距离默认为 0.05m，老数据未设置时按默认值回显。
        initial_measurement_distance: hole.initial_measurement_distance !== undefined && hole.initial_measurement_distance !== null
          ? String(hole.initial_measurement_distance)
          : '0.05',
        warning_yellow_threshold: hole.warning_yellow_threshold != null ? String(hole.warning_yellow_threshold) : '',
        warning_red_threshold: hole.warning_red_threshold != null ? String(hole.warning_red_threshold) : '',
        upper_device_id: this.upperDeviceId(hole)
      };
      this.upperDevices = [];
      this.holeError = '';
      this.showDeviceSelect = false;
      this.showHoleDialog = true;
      await this.loadUpperDevicesForHole(hole);
    },
    closeHoleDialog() {
      if (this.holeSubmitting) return;
      this.showHoleDialog = false;
      this.showDeviceSelect = false;
      this.holeEditingId = null;
      this.upperDevices = [];
      this.holeError = '';
    },
    setHoleType(type) {
      this.holeForm.hole_type = type;
    },
    toggleDeviceSelect() {
      this.showDeviceSelect = !this.showDeviceSelect;
    },
    isOptionActive(option) {
      const currentId = this.holeForm.upper_device_id;
      if (option.value === null) {
        return currentId === null || currentId === undefined || currentId === '';
      }
      return Number(option.value) === Number(currentId);
    },
    selectUpperDevice(option) {
      // 修复说明：改用弹窗内自定义下拉选择，避免系统 ActionSheet 被弹窗遮罩遮挡。
      this.holeForm.upper_device_id = (option.value !== undefined) ? option.value : null;
      this.showDeviceSelect = false;
    },
    async loadUpperDevicesForHole(hole) {
      this.upperDevicesLoading = true;
      try {
        const res = await upperDeviceApi.list({ page: 1, limit: 100, available_for_hole: true });
        let devices = (res && res.data && res.data.list) || [];
        const currentUpper = (hole && hole.upperDevice) || null;
        if (currentUpper && !devices.some(d => Number(d.id) === Number(currentUpper.id))) {
          devices = [currentUpper, ...devices];
        }
        this.upperDevices = devices;
      } catch (err) {
        this.upperDevices = [];
      } finally {
        this.upperDevicesLoading = false;
      }
    },
    async submitHole() {
      if (this.holeSubmitting) return;
      const form = this.holeForm;
      if (!form.hole_number || !String(form.hole_number).trim()) {
        this.holeError = '请填写测孔编号';
        return;
      }
      if (form.depth === '' || form.depth === null || Number.isNaN(Number(form.depth)) || Number(form.depth) < 0) {
        this.holeError = '请填写正确的孔深';
        return;
      }
      this.holeSubmitting = true;
      this.holeError = '';
      try {
        const payload = {
          hole_number: String(form.hole_number).trim(),
          hole_name: form.hole_name || '',
          hole_type: form.hole_type,
          depth: Number(form.depth),
          // 修复说明：初始测量距离默认 0.05m，提交前统一转成数值，供管理端开始监测时反算设备监测节点数。
          initial_measurement_distance: form.initial_measurement_distance === '' || form.initial_measurement_distance === null
            ? 0.05
            : Number(form.initial_measurement_distance),
          warning_yellow_threshold: form.warning_yellow_threshold === '' ? null : Number(form.warning_yellow_threshold),
          warning_red_threshold: form.warning_red_threshold === '' ? null : Number(form.warning_red_threshold),
          upper_device_id: form.upper_device_id || null
        };
        if (this.holeEditingId) {
          await holeApi.updateHole(this.holeEditingId, payload);
        } else {
          payload.project_id = this.projectId;
          await holeApi.createHole(payload);
        }
        this.closeHoleDialog();
        await this.load();
        uni.showToast({ title: this.holeEditingId ? '测孔已更新' : '测孔已创建', icon: 'success' });
      } catch (err) {
        this.holeError = (err && err.message) || '保存失败';
      } finally {
        this.holeSubmitting = false;
      }
    }
  }
};
</script>

<style lang="scss" scoped>
.page {
  padding-bottom: 132rpx;
}

.tab-bar {
  display: flex;
  gap: 12rpx;
  padding: 10rpx;
}

.tab {
  flex: 1;
  height: 64rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  font-size: 26rpx;
  color: var(--cexie-muted-foreground);
}

.tab.active {
  background: var(--cexie-primary);
  color: var(--cexie-primary-foreground);
  font-weight: 600;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20rpx;
  padding: 16rpx 0;
  border-top: 1px solid var(--cexie-divider);
}

.info-label {
  flex: none;
  color: var(--cexie-muted-foreground);
  font-size: 24rpx;
}

.info-value {
  flex: 1;
  text-align: right;
  color: var(--cexie-foreground);
  font-size: 24rpx;
  word-break: break-all;
}

.meta {
  font-size: 24rpx;
  color: var(--cexie-muted-foreground);
}

.hole {
  padding: 18rpx 0;
  border-top: 1px solid var(--cexie-divider);
}

.name {
  font-size: 28rpx;
  font-weight: 700;
}

.badge {
  font-size: 22rpx;
  padding: 6rpx 12rpx;
  border-radius: 999rpx;
  color: var(--cexie-primary-foreground);
}

.badge.online {
  background: var(--cexie-success);
}

.badge.offline {
  background: var(--cexie-warning);
}

.badge.unbound {
  background: var(--cexie-error);
}

.empty {
  text-align: center;
  color: var(--cexie-muted-foreground);
  margin-top: 28rpx;
  font-size: 26rpx;
}

.hole-head-actions {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.add-button {
  background: var(--cexie-primary);
  color: var(--cexie-primary-foreground);
}

.hole-item-right {
  display: flex;
  align-items: center;
  gap: 12rpx;
  flex: none;
}

.edit-button {
  color: var(--cexie-primary);
}

.dialog-mask {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.5);
}

.dialog {
  width: 640rpx;
  max-width: 90vw;
  max-height: 86vh;
  overflow-y: auto;
  border-radius: 16px;
  background: var(--cexie-card);
}

.dialog-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 26rpx 28rpx;
  border-bottom: 1px solid var(--cexie-divider);
}

.dialog-title {
  font-size: 30rpx;
  font-weight: 700;
}

.dialog-close {
  font-size: 40rpx;
  line-height: 1;
  color: var(--cexie-muted-foreground);
}

.dialog-body {
  padding: 24rpx 28rpx;
}

.form-item {
  margin-bottom: 22rpx;
}

.form-label {
  display: block;
  margin-bottom: 10rpx;
  font-size: 24rpx;
  color: var(--cexie-foreground);
  font-weight: 600;
}

.required {
  color: var(--cexie-error);
}

.form-input {
  box-sizing: border-box;
  width: 100%;
  height: 76rpx;
  padding: 0 20rpx;
  border: 1px solid var(--cexie-border);
  border-radius: 8px;
  background: var(--cexie-primary-surface);
  font-size: 25rpx;
  line-height: 76rpx;
  color: var(--cexie-foreground);
}

.device-select {
  position: relative;
}

.device-select-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
  box-sizing: border-box;
  width: 100%;
  min-height: 76rpx;
  padding: 0 20rpx;
  border: 1px solid var(--cexie-border);
  border-radius: 8px;
  background: var(--cexie-primary-surface);
}

.device-select-value {
  flex: 1;
  font-size: 25rpx;
  color: var(--cexie-foreground);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.device-select-value.placeholder {
  color: var(--cexie-muted-foreground);
}

.device-select-arrow {
  flex: none;
  color: var(--cexie-primary);
  font-size: 28rpx;
  transition: transform 0.2s ease;
}

.device-select-arrow.open {
  transform: rotate(180deg);
}

.device-select-options {
  margin-top: 12rpx;
  max-height: 400rpx;
  overflow-y: auto;
  border: 1px solid var(--cexie-border);
  border-radius: 8px;
  background: var(--cexie-card);
  box-shadow: 0 4rpx 16rpx rgba(15, 23, 42, 0.1);
}

.device-select-option {
  padding: 18rpx 20rpx;
  border-bottom: 1px solid var(--cexie-divider);
}

.device-select-option:last-child {
  border-bottom: none;
}

.device-select-option.active {
  background: var(--cexie-primary-surface);
}

.device-option-main {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.device-option-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}

.device-option-name {
  font-size: 25rpx;
  color: var(--cexie-foreground);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.device-option-imei {
  font-size: 22rpx;
  color: var(--cexie-muted-foreground);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.device-option-status {
  flex: none;
  padding: 4rpx 12rpx;
  border-radius: 999rpx;
  font-size: 20rpx;
}

.device-option-status.online {
  color: var(--cexie-success);
  background: rgba(34, 197, 94, 0.12);
}

.device-option-status.offline {
  color: var(--cexie-warning);
  background: rgba(234, 179, 8, 0.14);
}

.device-option-check {
  flex: none;
  color: var(--cexie-primary);
  font-size: 26rpx;
  font-weight: 700;
}

.device-select-empty {
  padding: 24rpx 20rpx;
  text-align: center;
  font-size: 24rpx;
  color: var(--cexie-muted-foreground);
}

.type-toggle {
  display: flex;
  gap: 12rpx;
}

.type-toggle-item {
  flex: 1;
  height: 76rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--cexie-border);
  border-radius: 8px;
  background: var(--cexie-primary-surface);
  color: var(--cexie-muted-foreground);
  font-size: 25rpx;
}

.type-toggle-item.active {
  border-color: var(--cexie-primary);
  background: var(--cexie-primary);
  color: var(--cexie-primary-foreground);
  font-weight: 600;
}

.form-error {
  padding: 16rpx 18rpx;
  border-radius: 8px;
  background: #faecec;
  color: var(--cexie-error);
  font-size: 22rpx;
  line-height: 1.5;
}

.dialog-foot {
  display: flex;
  gap: 16rpx;
  padding: 20rpx 28rpx;
  border-top: 1px solid var(--cexie-divider);
}

.cancel-button,
.save-button {
  flex: 1;
  height: 76rpx;
  margin: 0;
  padding: 0;
  border-radius: 8px;
  font-size: 26rpx;
  line-height: 76rpx;
}

.cancel-button {
  border: 1px solid var(--cexie-border);
  background: var(--cexie-card);
  color: var(--cexie-muted-foreground);
}

.save-button {
  border: 0;
  background: var(--cexie-primary);
  color: var(--cexie-primary-foreground);
}

.save-button[disabled] {
  opacity: 0.6;
}
</style>
