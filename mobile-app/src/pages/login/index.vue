<template>
  <view class="login-page">
    <view class="decoration decoration-top" />
    <view class="decoration decoration-left" />

    <view class="login-shell">
      <view class="brand-header">
        <view class="brand-logo">
          <view class="brand-logo-core">
            <text class="brand-logo-mark">⌁</text>
          </view>
        </view>
        <view class="brand-copy">
          <text class="brand-eyebrow">CEXIE FIELD DEBUG</text>
          <text class="brand-title">测斜监测现场测量版</text>
          <text class="brand-description">现场工程师设备联调入口，支持弱网状态下稳定接入。</text>
        </view>
      </view>

      <view class="login-card">
        <view class="card-heading">
          <view>
            <text class="card-title">账号登录</text>
            <text class="card-subtitle">仅授权工程师使用</text>
          </view>
          <text class="security-badge">安全接入</text>
        </view>

        <view class="form-item">
          <text class="field-label">账号</text>
          <view class="field-control" :class="{ focused: activeField === 'username' }">
            <view class="field-icon user-icon" aria-hidden="true" />
            <input
              v-model.trim="username"
              class="field-input"
              type="text"
              autocomplete="username"
              confirm-type="next"
              placeholder="请输入工程师账号"
              @focus="activeField = 'username'"
              @blur="activeField = ''"
            />
          </view>
        </view>

        <view class="form-item">
          <text class="field-label">密码</text>
          <view class="field-control" :class="{ focused: activeField === 'password' }">
            <view class="field-icon lock-icon" aria-hidden="true" />
            <input
              v-model="password"
              class="field-input"
              :password="!showPassword"
              autocomplete="current-password"
              confirm-type="done"
              placeholder="请输入登录密码"
              @focus="activeField = 'password'"
              @blur="activeField = ''"
              @confirm="submit"
            />
            <view class="password-toggle" aria-label="显示或隐藏密码" @click="showPassword = !showPassword">
              <view class="eye-icon" :class="{ visible: showPassword }" />
            </view>
          </view>
        </view>

        <view class="form-options">
          <view class="remember-option" @click="rememberAccount = !rememberAccount">
            <view class="checkbox" :class="{ checked: rememberAccount }">
              <text v-if="rememberAccount" class="checkbox-mark">✓</text>
            </view>
            <text>记住登录</text>
          </view>
          <text class="forgot-link" @click="showPasswordHelp">忘记密码</text>
        </view>

        <button class="login-button" :loading="loading" :disabled="loading" @click="submit">
          <text>{{ loading ? '正在登录...' : '登录测量工作台' }}</text>
          <text v-if="!loading" class="button-arrow">→</text>
        </button>

      </view>

      <view class="feature-grid">
        <view class="feature-item">
          <text class="feature-icon">联</text>
          <text class="feature-label">设备联调</text>
        </view>
        <view class="feature-item">
          <text class="feature-icon">令</text>
          <text class="feature-label">指令下发</text>
        </view>
        <view class="feature-item">
          <text class="feature-icon">执</text>
          <text class="feature-label">回执追踪</text>
        </view>
      </view>

      <view class="security-tip">
        <view class="shield-icon">✓</view>
        <text>弱网下自动保留登录态；请勿在非授权设备上保存账号。</text>
      </view>
    </view>
  </view>
</template>

<script>
import { authApi } from '../../api';
import { setToken, setUser } from '../../utils/storage';

const REMEMBERED_ACCOUNT_KEY = 'login:remembered-account';

export default {
  data() {
    return {
      username: '',
      password: '',
      loading: false,
      showPassword: false,
      rememberAccount: true,
      activeField: ''
    };
  },
  onLoad() {
    this.username = uni.getStorageSync(REMEMBERED_ACCOUNT_KEY) || '';
  },
  methods: {
    showPasswordHelp() {
      uni.showToast({ title: '请联系系统管理员重置密码', icon: 'none' });
    },
    async submit() {
      if (!this.username || !this.password) {
        uni.showToast({ title: '请输入账号和密码', icon: 'none' });
        return;
      }
      if (this.loading) {
        return;
      }
      this.loading = true;
      try {
        const res = await authApi.login({ username: this.username, password: this.password });
        setToken(res?.data?.token || '');
        setUser(res?.data?.user || null);
        if (this.rememberAccount) {
          uni.setStorageSync(REMEMBERED_ACCOUNT_KEY, this.username);
        } else {
          uni.removeStorageSync(REMEMBERED_ACCOUNT_KEY);
        }
        uni.reLaunch({ url: '/pages/projects/index' });
      } catch (err) {
        uni.showToast({ title: err?.message || '登录失败', icon: 'none' });
      } finally {
        this.loading = false;
      }
    }
  }
};
</script>

<style lang="scss" scoped>
.login-page {
  position: relative;
  min-height: 100vh;
  overflow: hidden;
  background: var(--cexie-background);
  color: var(--cexie-foreground);
}

.decoration {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
  filter: blur(46px);
}

.decoration-top {
  top: -86px;
  right: -78px;
  width: 244px;
  height: 244px;
  background: rgba(220, 232, 243, 0.82);
}

.decoration-left {
  top: 210px;
  left: -110px;
  width: 220px;
  height: 220px;
  background: rgba(255, 255, 255, 0.92);
}

.login-shell {
  position: relative;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: 100%;
  min-height: 100vh;
  max-width: 460px;
  margin: 0 auto;
  padding: calc(30px + env(safe-area-inset-top)) 20px calc(18px + env(safe-area-inset-bottom));
}

.brand-header {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

.brand-logo {
  display: flex;
  flex: 0 0 56px;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  box-sizing: border-box;
  border: 1px solid var(--cexie-border);
  border-radius: var(--cexie-radius-md);
  background: var(--cexie-card);
  box-shadow: var(--cexie-shadow-1);
}

.brand-logo-core {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: var(--cexie-radius-sm);
  background: var(--cexie-primary);
  color: var(--cexie-primary-foreground);
}

.brand-logo-mark {
  margin-top: -3px;
  font-size: 30px;
  line-height: 1;
  font-weight: 700;
  transform: rotate(-8deg);
}

.brand-copy {
  min-width: 0;
  flex: 1;
  padding-top: 1px;
}

.brand-eyebrow,
.brand-title,
.brand-description,
.card-title,
.card-subtitle,
.field-label,
.feature-label {
  display: block;
}

.brand-eyebrow {
  color: var(--cexie-primary);
  font-size: 12px;
  line-height: 18px;
  font-weight: 700;
  letter-spacing: 2.1px;
}

.brand-title {
  margin-top: 7px;
  font-size: 24px;
  line-height: 31px;
  font-weight: 700;
  letter-spacing: -0.5px;
}

.brand-description {
  margin-top: 7px;
  color: var(--cexie-muted-foreground);
  font-size: 13px;
  line-height: 23px;
}

.login-card {
  margin-top: 34px;
  padding: 20px;
  border: 1px solid var(--cexie-border);
  border-radius: 16px;
  background: var(--cexie-card);
  box-shadow: 0 10px 24px rgba(20, 36, 54, 0.05);
}

.card-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 20px;
}

.card-title {
  font-size: 18px;
  line-height: 25px;
  font-weight: 700;
}

.card-subtitle {
  margin-top: 4px;
  color: var(--cexie-muted-foreground);
  font-size: 12px;
  line-height: 18px;
}

.security-badge {
  flex: 0 0 auto;
  padding: 7px 12px;
  border-radius: 6px;
  background: var(--cexie-primary-surface);
  color: var(--cexie-primary);
  font-size: 12px;
  line-height: 18px;
  font-weight: 700;
}

.form-item + .form-item {
  margin-top: 16px;
}

.field-label {
  margin-bottom: 8px;
  font-size: 13px;
  line-height: 19px;
  font-weight: 700;
}

.field-control {
  display: flex;
  align-items: center;
  box-sizing: border-box;
  height: 48px;
  padding: 0 12px;
  border: 1px solid var(--cexie-border);
  border-radius: var(--cexie-radius-sm);
  background: var(--cexie-muted);
  transition: border-color 0.18s ease, background-color 0.18s ease, box-shadow 0.18s ease;
}

.field-control.focused {
  border-color: var(--cexie-primary);
  background: #ffffff;
  box-shadow: 0 0 0 3px rgba(47, 94, 138, 0.1);
}

.field-input {
  display: block;
  min-width: 0;
  height: 46px;
  flex: 1;
  color: var(--cexie-foreground);
  font-size: 14px;
  line-height: 46px;
  font-weight: 500;
}

.field-icon {
  position: relative;
  flex: 0 0 18px;
  width: 18px;
  height: 18px;
  margin-right: 10px;
  color: var(--cexie-muted-foreground);
}

.user-icon::before {
  content: '';
  position: absolute;
  top: 1px;
  left: 6px;
  width: 6px;
  height: 6px;
  border: 1.5px solid currentColor;
  border-radius: 50%;
}

.user-icon::after {
  content: '';
  position: absolute;
  left: 3px;
  bottom: 1px;
  width: 12px;
  height: 7px;
  border: 1.5px solid currentColor;
  border-bottom: 0;
  border-radius: 9px 9px 0 0;
}

.lock-icon::before {
  content: '';
  position: absolute;
  left: 3px;
  bottom: 1px;
  width: 12px;
  height: 10px;
  box-sizing: border-box;
  border: 1.5px solid currentColor;
  border-radius: 3px;
}

.lock-icon::after {
  content: '';
  position: absolute;
  top: 1px;
  left: 6px;
  width: 6px;
  height: 7px;
  box-sizing: border-box;
  border: 1.5px solid currentColor;
  border-bottom: 0;
  border-radius: 6px 6px 0 0;
}

.password-toggle {
  display: flex;
  flex: 0 0 34px;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  margin-right: -7px;
}

.eye-icon {
  position: relative;
  width: 16px;
  height: 11px;
  border: 1.5px solid var(--cexie-muted-foreground);
  border-radius: 50% / 60%;
}

.eye-icon::before {
  content: '';
  position: absolute;
  top: 3px;
  left: 6px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--cexie-muted-foreground);
}

.eye-icon::after {
  content: '';
  position: absolute;
  top: 4px;
  left: -2px;
  width: 20px;
  height: 1.5px;
  background: var(--cexie-muted-foreground);
  transform: rotate(-38deg);
  transition: opacity 0.15s ease;
}

.eye-icon.visible::after {
  opacity: 0;
}

.form-options {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 17px;
}

.remember-option {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--cexie-muted-foreground);
  font-size: 13px;
  line-height: 20px;
  font-weight: 500;
}

.checkbox {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  box-sizing: border-box;
  border: 1px solid var(--cexie-border);
  border-radius: 4px;
  background: #ffffff;
}

.checkbox.checked {
  border-color: var(--cexie-primary);
  background: var(--cexie-primary);
}

.checkbox-mark {
  color: #ffffff;
  font-size: 11px;
  line-height: 1;
  font-weight: 700;
}

.forgot-link {
  color: var(--cexie-primary);
  font-size: 13px;
  line-height: 20px;
  font-weight: 700;
}

.login-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 48px;
  margin: 18px 0 0;
  padding: 0 16px;
  border: 0;
  border-radius: var(--cexie-radius-sm);
  background: var(--cexie-primary);
  color: var(--cexie-primary-foreground);
  box-shadow: 0 10px 20px rgba(47, 94, 138, 0.18);
  font-size: 15px;
  line-height: 48px;
  font-weight: 700;
}

.login-button::after {
  border: 0;
}

.login-button[disabled] {
  opacity: 0.7;
  color: var(--cexie-primary-foreground);
  background: var(--cexie-primary);
}

.button-arrow {
  margin-left: 9px;
  font-size: 20px;
  line-height: 1;
}

.shield-icon {
  display: flex;
  flex: 0 0 17px;
  align-items: center;
  justify-content: center;
  width: 17px;
  height: 17px;
  box-sizing: border-box;
  border: 1.5px solid currentColor;
  border-radius: 50%;
  color: var(--cexie-primary);
  font-size: 11px;
  line-height: 1;
  font-weight: 700;
}

.feature-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 22px;
}

.feature-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  box-sizing: border-box;
  min-width: 0;
  padding: 12px 8px;
  border: 1px solid var(--cexie-border);
  border-radius: var(--cexie-radius-md);
  background: rgba(255, 255, 255, 0.74);
  box-shadow: var(--cexie-shadow-1);
}

.feature-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 7px;
  background: var(--cexie-primary-surface);
  color: var(--cexie-primary);
  font-size: 12px;
  line-height: 1;
  font-weight: 700;
}

.feature-label {
  margin-top: 7px;
  font-size: 12px;
  line-height: 18px;
  font-weight: 700;
  text-align: center;
}

.security-tip {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  margin-top: auto;
  padding: 22px 0 0;
  color: var(--cexie-muted-foreground);
  font-size: 12px;
  line-height: 20px;
}

.security-tip .shield-icon {
  margin-top: 1px;
  border-radius: 5px 5px 8px 8px;
  color: var(--cexie-success);
}

@media (max-height: 720px) {
  .login-shell {
    padding-top: calc(20px + env(safe-area-inset-top));
  }

  .login-card {
    margin-top: 24px;
  }

  .feature-grid {
    margin-top: 16px;
  }
}
</style>
