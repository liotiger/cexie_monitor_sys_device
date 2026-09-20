<template>
  <view v-if="visible" class="binding-overlay" @click="requestClose">
    <view class="binding-dialog" @click.stop>
      <view class="binding-header">
        <view>
          <text class="binding-title">{{ title }}</text>
          <text v-if="description" class="binding-description">{{ description }}</text>
        </view>
        <button class="binding-close" :disabled="submitting" @click="requestClose">×</button>
      </view>

      <view class="binding-body">
        <text v-if="error" class="binding-error">{{ error }}</text>
        <view v-if="loading" class="binding-empty">正在加载...</view>
        <view v-else-if="!options.length" class="binding-empty">{{ emptyText }}</view>
        <picker
          v-else
          :range="options"
          range-key="label"
          :value="selectedIndex"
          :disabled="submitting"
          @change="selectOption">
          <view class="binding-picker">
            <text class="binding-picker-label">{{ pickerLabel }}</text>
            <text class="binding-picker-value">{{ selectedOption ? selectedOption.label : '请选择' }}</text>
            <text class="binding-picker-arrow">⌄</text>
          </view>
        </picker>
      </view>

      <view class="binding-actions">
        <button class="binding-cancel" :disabled="submitting" @click="requestClose">取消</button>
        <button
          class="binding-confirm"
          :disabled="loading || submitting || !selectedOption"
          @click="confirmSelection">
          {{ submitting ? '处理中...' : confirmText }}
        </button>
      </view>
    </view>
  </view>
</template>

<script>
export default {
  props: {
    visible: { type: Boolean, default: false },
    title: { type: String, default: '绑定设备' },
    description: { type: String, default: '' },
    pickerLabel: { type: String, default: '请选择' },
    options: { type: Array, default: () => [] },
    loading: { type: Boolean, default: false },
    submitting: { type: Boolean, default: false },
    error: { type: String, default: '' },
    emptyText: { type: String, default: '暂无可选项' },
    confirmText: { type: String, default: '确认绑定' }
  },
  data() {
    return { selectedIndex: 0, hasSelected: false };
  },
  computed: {
    selectedOption() {
      return this.hasSelected ? this.options[this.selectedIndex] || null : null;
    }
  },
  watch: {
    visible(value) {
      if (value) {
        this.selectedIndex = 0;
        this.hasSelected = false;
      }
    },
    options() {
      if (!this.options[this.selectedIndex]) {
        this.selectedIndex = 0;
        this.hasSelected = false;
      }
    }
  },
  methods: {
    selectOption(event) {
      this.selectedIndex = Number(event && event.detail && event.detail.value) || 0;
      this.hasSelected = true;
    },
    requestClose() {
      if (!this.submitting) this.$emit('close');
    },
    confirmSelection() {
      if (this.selectedOption && !this.submitting) this.$emit('confirm', this.selectedOption);
    }
  }
};
</script>

<style lang="scss" scoped>
.binding-overlay { position: fixed; inset: 0; z-index: 1200; display: flex; align-items: flex-end; justify-content: center; padding: 28rpx; box-sizing: border-box; background: rgba(18, 24, 32, 0.48); }
.binding-dialog { width: 100%; max-width: 720rpx; overflow: hidden; border-radius: 12px; background: var(--cexie-card); box-shadow: 0 20rpx 60rpx rgba(18, 24, 32, 0.25); }
.binding-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 24rpx; padding: 28rpx; border-bottom: 1px solid var(--cexie-divider); }
.binding-title { display: block; font-size: 30rpx; font-weight: 700; }
.binding-description { display: block; margin-top: 8rpx; color: var(--cexie-muted-foreground); font-size: 22rpx; line-height: 1.55; }
.binding-close { flex: none; width: 54rpx; height: 54rpx; margin: 0; padding: 0; border: 0; background: transparent; color: var(--cexie-muted-foreground); font-size: 38rpx; line-height: 50rpx; }
.binding-body { padding: 28rpx; }
.binding-error { display: block; margin-bottom: 20rpx; padding: 18rpx; border-radius: 8px; background: #faecec; color: var(--cexie-error); font-size: 22rpx; line-height: 1.5; }
.binding-empty { padding: 42rpx 20rpx; border: 1px dashed var(--cexie-border); border-radius: 8px; text-align: center; color: var(--cexie-muted-foreground); font-size: 23rpx; line-height: 1.5; }
.binding-picker { position: relative; min-height: 96rpx; padding: 18rpx 70rpx 18rpx 20rpx; box-sizing: border-box; border: 1px solid var(--cexie-border); border-radius: 8px; background: var(--cexie-background); }
.binding-picker-label { display: block; color: var(--cexie-muted-foreground); font-size: 20rpx; }
.binding-picker-value { display: block; margin-top: 5rpx; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 24rpx; font-weight: 600; }
.binding-picker-arrow { position: absolute; top: 30rpx; right: 24rpx; color: var(--cexie-muted-foreground); font-size: 30rpx; }
.binding-actions { display: grid; grid-template-columns: 1fr 1.4fr; gap: 16rpx; padding: 20rpx 28rpx 28rpx; }
.binding-actions button { height: 76rpx; margin: 0; border-radius: 8px; font-size: 24rpx; line-height: 76rpx; }
.binding-cancel { border: 1px solid var(--cexie-border); background: var(--cexie-card); color: var(--cexie-foreground); }
.binding-confirm { border: 1px solid var(--cexie-primary); background: var(--cexie-primary); color: var(--cexie-primary-foreground); }
.binding-actions button:disabled { opacity: 0.5; }
</style>
