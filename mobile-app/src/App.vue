<script>
import { ensureAuthRedirect } from './utils/auth';

export default {
  onLaunch() {
    ensureAuthRedirect();
  }
};
</script>

<style lang="scss">
@import "./styles/global.scss";
</style>
