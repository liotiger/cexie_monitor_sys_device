const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '../node_modules/@dcloudio/vue-cli-plugin-uni/packages/vue-loader/lib/loaders/templateLoader.js');

if (!fs.existsSync(filePath)) {
  process.exit(0);
}

const content = fs.readFileSync(filePath, 'utf8');

const target = 'return code + `\\nexport { render, staticRenderFns, recyclableRender, components }`';
const replacement = 'return code + `\\nvar recyclableRender = null\\nvar components = null\\nexport { render, staticRenderFns, recyclableRender, components }`';

if (content.includes(replacement)) {
  process.exit(0);
}

if (!content.includes(target)) {
  process.exit(0);
}

fs.writeFileSync(filePath, content.replace(target, replacement), 'utf8');
