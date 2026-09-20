<template>
  <view class="page">
    <view class="cexie-container">
      <view class="cexie-card">
        <view class="cexie-title cexie-title-sm">个人信息</view>
        <view class="cexie-spacer-12" />
        <view class="row"><text class="k">用户名</text><text class="v">{{ user.username || '-' }}</text></view>
        <view class="row"><text class="k">姓名</text><text class="v">{{ user.real_name || '-' }}</text></view>
        <view class="row"><text class="k">邮箱</text><text class="v">{{ user.email || '-' }}</text></view>
        <view class="row"><text class="k">角色</text><text class="v">{{ user.role || '-' }}</text></view>
      </view>

      <view class="cexie-spacer-16" />

      <view class="cexie-card">
        <view class="cexie-title cexie-title-sm">工作入口</view>
        <view class="shortcut-grid">
          <button class="shortcut" @click="go('/pages/dashboard/index')">监测总览</button>
          <button class="shortcut" @click="go('/pages/trend-analysis/index')">趋势分析</button>
          <button class="shortcut" @click="go('/pages/reports/index')">报表中心</button>
        </view>
      </view>

      <view class="cexie-spacer-16" />

      <view class="cexie-card">
        <view class="cexie-title cexie-title-sm">设置</view>
        <view class="cexie-spacer-12" />
        <button class="cexie-btn-primary" @click="doLogout">退出登录</button>
      </view>
    </view>

    <BottomNav activeKey="profile" />
  </view>
</template>

<script>
import BottomNav from '../../components/BottomNav.vue';
import { authApi } from '../../api';
import { getUser, setUser } from '../../utils/storage';
import { logout } from '../../utils/auth';

export default {
  components: { BottomNav },
  data() {
    return {
      user: getUser() || {}
    };
  },
  onShow() {
    this.load();
  },
  methods: {
    async load() {
      try {
        const res = await authApi.me();
        this.user = (res && res.data) || {};
        setUser((res && res.data) || null);
      } catch (err) {
        if (String((err && err.message) || '').includes('未登录')) {
          logout({ silent: true });
          return;
        }
        uni.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
      }
    },
    async doLogout() {
      try {
        await authApi.logout();
      } catch (err) {
      } finally {
        logout({ silent: true });
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

.row {
  display: flex;
  justify-content: space-between;
  padding: 12rpx 0;
  border-top: 1px solid var(--cexie-divider);
}

.k {
  font-size: 24rpx;
  color: var(--cexie-muted-foreground);
}

.v {
  font-size: 24rpx;
  color: var(--cexie-foreground);
}

.shortcut-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12rpx;
  margin-top: 18rpx;
}

.shortcut {
  height: 76rpx;
  margin: 0;
  padding: 0 8rpx;
  border: 1px solid var(--cexie-border);
  border-radius: 8px;
  background: var(--cexie-primary-surface);
  color: var(--cexie-primary);
  font-size: 22rpx;
  font-weight: 600;
  line-height: 76rpx;
}
</style>
