module.exports = {
  devServer: {
    host: '0.0.0.0',
    port: Number(process.env.MOBILE_H5_PORT || 8080),
    proxy: {
      '/api': {
        target: process.env.MOBILE_API_PROXY_TARGET || 'http://127.0.0.1:1337',
        changeOrigin: true
      }
    }
  }
};
