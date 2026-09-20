<template>
  <view class="bottom-nav">
    <view
      v-for="item in items"
      :key="item.key"
      class="bottom-nav-item"
      :class="{ active: item.key === activeKey }"
      @click="go(item)"
    >
      <text class="bottom-nav-text">{{ item.text }}</text>
    </view>
  </view>
</template>

<script>
export default {
  props: {
    activeKey: {
      type: String,
      default: ''
    }
  },
  data() {
    return {
      items: [
        { key: 'projects', text: '工程', url: '/pages/projects/index' },
        { key: 'devices', text: '设备', url: '/pages/devices/index' },
        { key: 'profile', text: '我的', url: '/pages/profile/index' }
      ]
    };
  },
  methods: {
    go(item) {
      if (item.key === this.activeKey) {
        return;
      }
      uni.redirectTo({ url: item.url });
    }
  }
};
</script>

<style lang="scss" scoped>
.bottom-nav {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  height: 112rpx;
  max-width: 960rpx;
  margin: 0 auto;
  background: var(--cexie-card);
  border-top: 1px solid var(--cexie-divider);
  display: flex;
}

.bottom-nav-item {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--cexie-muted-foreground);
  font-size: 24rpx;
  min-width: 0;
}

.bottom-nav-item.active {
  color: var(--cexie-primary);
  font-weight: 700;
}
</style>
