const path = require('path');
const { spawn } = require('child_process');

const mode = process.argv[2];
const platform = process.argv[3];
const commands = {
  serve: ['uni-serve'],
  build: ['uni-build'],
  watch: ['uni-build', '--watch']
};

if (!commands[mode] || !platform) {
  console.error('Usage: node scripts/run-uni.js <serve|build|watch> <platform>');
  process.exit(1);
}

const cliPath = require.resolve('@vue/cli-service/bin/vue-cli-service.js');
const env = {
  ...process.env,
  UNI_CLI_CONTEXT: path.resolve(__dirname, '..'),
  UNI_PLATFORM: platform,
  NODE_ENV: mode === 'serve' || mode === 'watch' ? 'development' : 'production'
};

if (mode === 'serve' && platform === 'h5') {
  env.PORT = process.env.MOBILE_H5_PORT || '8080';
}

const child = spawn(process.execPath, [cliPath, ...commands[mode]], {
  cwd: path.resolve(__dirname, '..'),
  env,
  stdio: 'inherit'
});

child.on('exit', code => process.exit(code === null ? 1 : code));
child.on('error', error => {
  console.error(error.message);
  process.exit(1);
});
