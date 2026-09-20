<template>
  <view class="page">
    <view class="cexie-container">
      <view class="cexie-card">
        <view class="cexie-row">
          <view>
            <view class="cexie-title cexie-title-md">{{ holeTitle }}</view>
            <view class="meta">编号 {{ holeNumber || '-' }}</view>
          </view>
          <view class="hole-actions">
            <button size="mini" @click="goTrend">查看数据</button>
            <button v-if="deviceId" size="mini" class="device-button" @click="openDevice">设备测量</button>
            <button v-else size="mini" class="binding-button" @click="openBindingGuide">绑定设备</button>
          </view>
        </view>
      </view>

      <view class="cexie-spacer-16" />

      <view class="cexie-card">
        <view class="cexie-row">
          <view class="cexie-title cexie-title-sm">最近测量</view>
          <button size="mini" @click="load">刷新</button>
        </view>
        <view class="cexie-spacer-12" />

        <view v-for="row in recent" :key="row.id" class="row">
          <view class="cexie-row">
            <view class="name">深度 {{ row.depth }}</view>
            <view class="tag" :class="row.warning_level">{{ levelText(row.warning_level) }}</view>
          </view>
          <view class="meta">累计 {{ fmtNum(row.cumulative_displacement) }} mm</view>
          <view class="meta">时间 {{ fmtTime(row.measurement_time) }}</view>
        </view>

        <view v-if="!loading && !recent.length" class="empty">暂无数据</view>
        <view v-if="loading" class="empty">加载中...</view>
      </view>
    </view>

    <BottomNav activeKey="projects" />
    <BindingGuideDialog
      :visible="bindingVisible"
      title="为测孔绑定上位机"
      :description="`测孔 ${holeNumber || holeId || '-'} 尚未绑定设备，请选择一台空闲上位机。`"
      picker-label="选择上位机"
      :options="bindingOptions"
      :loading="bindingLoading"
      :submitting="bindingSubmitting"
      :error="bindingError"
      empty-text="暂无空闲上位机，请先确认设备已同步且未绑定其他测孔。"
      confirm-text="确认绑定"
      @close="closeBindingGuide"
      @confirm="confirmDeviceBinding" />
  </view>
</template>

<script>
import BottomNav from '../../components/BottomNav.vue';
import BindingGuideDialog from '../../components/BindingGuideDialog.vue';
import { holeApi, upperDeviceApi } from '../../api';

export default {
  components: { BindingGuideDialog, BottomNav },
  data() {
    return {
      holeId: null,
      deviceId: null,
      holeName: '',
      holeNumber: '',
      recent: [],
      loading: false,
      bindingVisible: false,
      bindingOptions: [],
      bindingLoading: false,
      bindingSubmitting: false,
      bindingError: ''
    };
  },
  computed: {
    holeTitle() {
      return this.holeName || `测孔 ${this.holeId || ''}`;
    }
  },
  onLoad(query) {
    const id = parseInt(query && query.id, 10);
    if (Number.isFinite(id) && id > 0) {
      this.holeId = id;
      this.holeName = query && query.name ? decodeURIComponent(query.name) : '';
      this.holeNumber = query && query.number ? decodeURIComponent(query.number) : '';
      const deviceId = Number(query && query.deviceId);
      this.deviceId = Number.isFinite(deviceId) && deviceId > 0 ? deviceId : null;
      this.load();
      this.loadHoleContext();
    }
  },
  onShow() {
    if (this.holeId) this.loadHoleContext();
  },
  methods: {
    levelText(level) {
      if (level === 'alarm') return '告警';
      if (level === 'warning') return '预警';
      return '正常';
    },
    fmtNum(value) {
      const num = Number(value || 0);
      return Number.isFinite(num) ? num.toFixed(2) : '0.00';
    },
    fmtTime(value) {
      const date = value ? new Date(value) : null;
      if (!date || Number.isNaN(date.getTime())) {
        return '-';
      }
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      const hh = String(date.getHours()).padStart(2, '0');
      const mm = String(date.getMinutes()).padStart(2, '0');
      return `${y}-${m}-${d} ${hh}:${mm}`;
    },
    async load() {
      if (!this.holeId || this.loading) {
        return;
      }
      this.loading = true;
      try {
        const res = await holeApi.processedResults(this.holeId, { page: 1, limit: 10 });
        this.recent = (res && res.data && res.data.list) || [];
      } catch (err) {
        uni.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
      } finally {
        this.loading = false;
      }
    },
    async loadHoleContext() {
      try {
        const response = await holeApi.list({ page: 1, limit: 1000 });
        const holes = (response && response.data && response.data.list) || [];
        const hole = holes.find(item => Number(item.id) === Number(this.holeId));
        if (!hole) return;
        this.holeName = hole.hole_name || this.holeName;
        this.holeNumber = hole.hole_number || this.holeNumber;
        const deviceId = Number(hole.upper_device_id || (hole.upperDevice && hole.upperDevice.id));
        this.deviceId = Number.isFinite(deviceId) && deviceId > 0 ? deviceId : null;
      } catch (err) {
        // 最近测量仍可独立展示，绑定关系刷新失败时不阻断页面。
      }
    },
    async openBindingGuide() {
      this.bindingVisible = true;
      this.bindingOptions = [];
      this.bindingError = '';
      this.bindingLoading = true;
      try {
        const response = await upperDeviceApi.list({ page: 1, limit: 100, available_for_hole: true });
        const devices = (response && response.data && response.data.list) || [];
        this.bindingOptions = devices.map(device => ({
          value: device.id,
          item: device,
          label: `${device.device_name || `上位机 ${device.id}`} / ${device.imei || '-'}（${String(device.network_status || '').toLowerCase() === 'online' ? '在线' : '离线'}）`
        }));
      } catch (err) {
        this.bindingError = (err && err.message) || '可绑定上位机加载失败';
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
    async confirmDeviceBinding(option) {
      if (!option || !option.item || this.bindingSubmitting) return;
      this.bindingSubmitting = true;
      this.bindingError = '';
      try {
        await holeApi.bindDevice(this.holeId, {
          upper_device_id: option.item.id,
          bind_type: 'manual',
          bind_reason: '移动端测孔详情绑定设备'
        });
        this.deviceId = Number(option.item.id);
        this.bindingVisible = false;
        this.bindingOptions = [];
        uni.showToast({ title: '设备绑定成功', icon: 'success' });
      } catch (err) {
        this.bindingError = (err && err.message) || '设备绑定失败';
      } finally {
        this.bindingSubmitting = false;
      }
    },
    goTrend() {
      if (!this.holeId) {
        return;
      }
      uni.navigateTo({ url: `/pages/trend-analysis/index?hole_ids=${this.holeId}` });
    },
    openDevice() {
      if (!this.deviceId) return;
      uni.navigateTo({ url: `/pages/device-operation/index?id=${this.deviceId}` });
    }
  }
};
</script>

<style lang="scss" scoped>
.page {
  padding-bottom: 132rpx;
}

.meta {
  font-size: 24rpx;
  color: var(--cexie-muted-foreground);
}

.hole-actions {
  display: flex;
  align-items: center;
  gap: 10rpx;
  flex: none;
}

.device-button {
  color: var(--cexie-primary);
}

.binding-button {
  border-color: var(--cexie-primary);
  background: var(--cexie-primary);
  color: var(--cexie-primary-foreground);
}

.row {
  padding: 18rpx 0;
  border-top: 1px solid var(--cexie-divider);
}

.name {
  font-size: 28rpx;
  font-weight: 700;
}

.tag {
  font-size: 22rpx;
  padding: 6rpx 12rpx;
  border-radius: 999rpx;
  color: var(--cexie-primary-foreground);
}

.tag.normal {
  background: var(--cexie-success);
}

.tag.warning {
  background: var(--cexie-warning);
}

.tag.alarm {
  background: var(--cexie-error);
}

.empty {
  text-align: center;
  color: var(--cexie-muted-foreground);
  margin-top: 28rpx;
  font-size: 26rpx;
}
</style>
