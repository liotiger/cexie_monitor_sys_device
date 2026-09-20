<template>
  <view class="page">
    <view class="cexie-container">
      <view class="cexie-card">
        <view class="cexie-row">
          <view class="cexie-title">今日概览</view>
          <button size="mini" @click="load">刷新</button>
        </view>
        <view class="cexie-spacer-18" />
        <view class="grid">
          <view class="metric">
            <text class="value">{{ stats.todayMeasurements }}</text>
            <text class="label">今日测量</text>
          </view>
          <view class="metric">
            <text class="value">{{ stats.todayAlerts }}</text>
            <text class="label">今日告警</text>
          </view>
          <view class="metric">
            <text class="value">{{ stats.projectActive }}/{{ stats.projectTotal }}</text>
            <text class="label">工程(进行中/总数)</text>
          </view>
          <view class="metric">
            <text class="value">{{ stats.deviceOnline }}/{{ stats.deviceTotal }}</text>
            <text class="label">设备(在线/总数)</text>
          </view>
        </view>
      </view>

      <view class="cexie-spacer-20" />

      <view class="cexie-card">
        <view class="cexie-row">
          <view class="cexie-title cexie-title-sm">快捷入口</view>
        </view>
        <view class="cexie-spacer-18" />
        <view class="quick">
          <button class="cexie-btn-primary" size="mini" @click="go('/pages/projects/index')">进入工程</button>
          <button size="mini" @click="go('/pages/trend-analysis/index')">趋势分析</button>
          <button size="mini" @click="go('/pages/reports/index')">报表中心</button>
        </view>
      </view>
    </view>

    <BottomNav activeKey="dashboard" />
  </view>
</template>

<script>
import BottomNav from '../../components/BottomNav.vue';
import { dashboardApi } from '../../api';

export default {
  components: { BottomNav },
  data() {
    return {
      stats: {
        deviceTotal: 0,
        deviceOnline: 0,
        projectTotal: 0,
        projectActive: 0,
        holeTotal: 0,
        holeActive: 0,
        todayMeasurements: 0,
        todayAlerts: 0
      }
    };
  },
  onShow() {
    this.load();
  },
  methods: {
    assign(next) {
      Object.keys(this.stats).forEach((key) => {
        this.$set(this.stats, key, next?.[key] ?? this.stats[key]);
      });
    },
    async load() {
      try {
        const res = await dashboardApi.stats();
        this.assign(res?.data || {});
      } catch (err) {
        uni.showToast({ title: err?.message || '加载失败', icon: 'none' });
      }
    },
    go(url) {
      uni.navigateTo({ url });
    }
  }
};
</script>

<style lang="scss" scoped>
.page {
  padding-bottom: 132rpx;
}

.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18rpx;
}

.metric {
  background: var(--cexie-primary-surface);
  border: 1px solid var(--cexie-border);
  border-radius: var(--cexie-radius-md);
  padding: 18rpx;
}

.metric .value {
  display: block;
  font-size: 34rpx;
  font-weight: 800;
  color: var(--cexie-primary-strong);
}

.metric .label {
  display: block;
  margin-top: 6rpx;
  font-size: 22rpx;
  color: var(--cexie-muted-foreground);
}

.quick {
  display: flex;
  gap: 12rpx;
  flex-wrap: wrap;
}
</style>
