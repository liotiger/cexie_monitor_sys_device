<template>
  <view class="page">
    <view class="cexie-container">
      <view class="project-header">
        <view>
          <text class="eyebrow">工程入口</text>
          <text class="page-title">现场测量工程</text>
        </view>
        <text class="mode-badge">测量模式</text>
      </view>

      <view class="cexie-card">
        <view class="filters">
          <input v-model="search" class="search" placeholder="搜索工程名称/业主" @confirm="reload" />
          <picker :range="statusOptions" range-key="label" @change="onStatusChange">
            <view class="status">{{ currentStatusLabel }}</view>
          </picker>
        </view>
      </view>

      <view class="cexie-spacer-16" />

      <view v-for="item in list" :key="item.id" class="cexie-card project" @click="openProjectDetail(item)">
        <view class="cexie-row">
          <view class="name">{{ item.project_name }}</view>
          <view class="tag">{{ statusText(item.status) }}</view>
        </view>
        <view class="meta">{{ item.location || '-' }}</view>
        <view class="cexie-spacer-10" />
        <view class="cexie-row">
          <view class="meta">测孔 {{ item.hole_count || 0 }}</view>
          <view class="meta">成员 {{ item.member_count || 0 }}</view>
        </view>
      </view>

      <view v-if="!loading && !list.length" class="empty">暂无工程</view>
      <view v-if="loading" class="empty">加载中...</view>
    </view>

    <BottomNav activeKey="projects" />
  </view>
</template>

<script>
import BottomNav from '../../components/BottomNav.vue';
import { projectApi } from '../../api';
import { setSelectedProjectId } from '../../utils/storage';

export default {
  components: { BottomNav },
  data() {
    return {
      search: '',
      status: '',
      list: [],
      loading: false,
      statusOptions: [
        { label: '全部', value: '' },
        { label: '进行中', value: 'ongoing' },
        { label: '规划中', value: 'planning' },
        { label: '已暂停', value: 'paused' },
        { label: '已完成', value: 'completed' }
      ]
    };
  },
  computed: {
    currentStatusLabel() {
      const found = this.statusOptions.find(item => item.value === this.status);
      return (found && found.label) || '全部';
    }
  },
  onShow() {
    this.reload();
  },
  methods: {
    statusText(value) {
      const found = this.statusOptions.find(item => item.value === value);
      return (found && found.label) || value || '-';
    },
    onStatusChange(e) {
      const index = Number(e && e.detail && e.detail.value);
      this.status = (this.statusOptions[index] && this.statusOptions[index].value) || '';
      this.reload();
    },
    async reload() {
      if (this.loading) {
        return;
      }
      this.loading = true;
      try {
        const res = await projectApi.list({
          page: 1,
          limit: 50,
          search: this.search,
          status: this.status
        });
        this.list = (res && res.data && res.data.list) || [];
      } catch (err) {
        uni.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
      } finally {
        this.loading = false;
      }
    },
    openProjectDetail(project) {
      setSelectedProjectId(project && project.id);
      // 修复说明：进入工程详情默认展示测孔列表。
      uni.navigateTo({ url: `/pages/project-detail/index?id=${project.id}` });
    }
  }
};
</script>

<style lang="scss" scoped>
.page {
  padding-bottom: 132rpx;
}

.project-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  margin: 6rpx 0 24rpx;
}

.eyebrow {
  display: block;
  color: var(--cexie-muted-foreground);
  font-size: 22rpx;
}

.page-title {
  display: block;
  margin-top: 4rpx;
  font-size: 38rpx;
  font-weight: 700;
}

.mode-badge {
  flex: none;
  padding: 8rpx 14rpx;
  border-radius: 6px;
  background: var(--cexie-primary-soft);
  color: var(--cexie-primary);
  font-size: 21rpx;
  font-weight: 600;
}

.filters {
  display: flex;
  gap: 12rpx;
  align-items: center;
}

.search {
  flex: 1;
  height: 76rpx;
  border-radius: var(--cexie-radius-sm);
  border: 1px solid var(--cexie-border);
  background: var(--cexie-primary-surface);
  padding: 0 18rpx;
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

.project {
  margin-top: 16rpx;
}

.name {
  font-size: 30rpx;
  font-weight: 700;
}

.tag {
  font-size: 22rpx;
  color: var(--cexie-primary);
  background: var(--cexie-primary-soft);
  padding: 6rpx 12rpx;
  border-radius: 999rpx;
}

.meta {
  font-size: 24rpx;
  color: var(--cexie-muted-foreground);
}

.empty {
  text-align: center;
  color: var(--cexie-muted-foreground);
  margin-top: 40rpx;
  font-size: 26rpx;
}
</style>
