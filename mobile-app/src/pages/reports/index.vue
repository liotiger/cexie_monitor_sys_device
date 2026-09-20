<template>
  <view class="page">
    <view class="cexie-container">
      <view class="cexie-card">
        <view class="filters">
          <picker :range="typeOptions" range-key="label" @change="onTypeChange">
            <view class="status">{{ currentTypeLabel }}</view>
          </picker>
          <button class="cexie-btn-primary" size="mini" @click="load">查询</button>
        </view>
        <view class="cexie-spacer-10" />
        <view class="meta">默认按当前选择工程筛选：{{ projectId || '-' }}</view>
      </view>

      <view class="cexie-spacer-16" />

      <view class="cexie-card">
        <view class="cexie-row">
          <view class="cexie-title cexie-title-sm">报表列表</view>
          <view class="meta">{{ totalText }}</view>
        </view>
        <view class="cexie-spacer-12" />

        <view v-for="item in list" :key="item.id" class="item" @click="open(item)">
          <view class="cexie-row">
            <view class="name">{{ item.report_name || '-' }}</view>
            <view class="tag">{{ typeText(item.report_type) }}</view>
          </view>
          <view class="meta">日期 {{ item.report_date || '-' }}</view>
          <view class="meta">编号 {{ item.report_number || '-' }}</view>
        </view>

        <view v-if="!loading && !list.length" class="empty">暂无报表</view>
        <view v-if="loading" class="empty">加载中...</view>
      </view>
    </view>

    <BottomNav activeKey="reports" />
  </view>
</template>

<script>
import BottomNav from '../../components/BottomNav.vue';
import { reportsApi } from '../../api';
import { getSelectedProjectId } from '../../utils/storage';

export default {
  components: { BottomNav },
  data() {
    return {
      typeOptions: [
        { label: '全部类型', value: '' },
        { label: '日报', value: 'daily' },
        { label: '周报', value: 'weekly' },
        { label: '月报', value: 'monthly' },
        { label: '专项', value: 'special' }
      ],
      type: '',
      list: [],
      loading: false,
      projectId: null
    };
  },
  computed: {
    currentTypeLabel() {
      const found = this.typeOptions.find(item => item.value === this.type);
      return (found && found.label) || '全部类型';
    },
    totalText() {
      return this.list.length ? `共 ${this.list.length} 条` : '';
    }
  },
  onShow() {
    this.projectId = getSelectedProjectId();
    this.load();
  },
  methods: {
    typeText(value) {
      const found = this.typeOptions.find(item => item.value === value);
      return (found && found.label) || value || '-';
    },
    onTypeChange(e) {
      const index = Number(e && e.detail && e.detail.value);
      this.type = (this.typeOptions[index] && this.typeOptions[index].value) || '';
    },
    async load() {
      if (this.loading) {
        return;
      }
      this.loading = true;
      try {
        const res = await reportsApi.list({
          page: 1,
          limit: 50,
          project_id: this.projectId || '',
          report_type: this.type
        });
        this.list = (res && res.data && res.data.list) || [];
      } catch (err) {
        uni.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
      } finally {
        this.loading = false;
      }
    },
    open(item) {
      uni.showModal({
        title: (item && item.report_name) || '报表',
        content: `编号：${(item && item.report_number) || '-'}\n日期：${(item && item.report_date) || '-'}\n类型：${this.typeText(item && item.report_type)}`,
        showCancel: false
      });
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

.filters {
  display: flex;
  gap: 12rpx;
  align-items: center;
}

.status {
  height: 76rpx;
  padding: 0 18rpx;
  border-radius: var(--cexie-radius-sm);
  border: 1px solid var(--cexie-border);
  display: flex;
  align-items: center;
  background: var(--cexie-card);
  font-size: 24rpx;
  color: var(--cexie-muted-foreground);
}

.item {
  padding: 18rpx 0;
  border-top: 1px solid var(--cexie-divider);
}

.name {
  font-size: 28rpx;
  font-weight: 700;
}

.tag {
  font-size: 22rpx;
  color: var(--cexie-primary);
  background: var(--cexie-primary-soft);
  padding: 6rpx 12rpx;
  border-radius: 999rpx;
}

.empty {
  text-align: center;
  color: var(--cexie-muted-foreground);
  margin-top: 28rpx;
  font-size: 26rpx;
}
</style>
