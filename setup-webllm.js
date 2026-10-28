// One-time setup: bundles the WebLLM library into vendor/web-llm.js.
// Chrome extensions can't load remote code, so the library has to ship inside the folder.
// Usage (needs Node.js):  node setup-webllm.js
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const vendorDir = path.join(root, 'vendor');
const webLlmEntry = path.join(root, 'node_modules', '@mlc-ai', 'web-llm', 'lib', 'index.js');
const output = path.join(vendorDir, 'web-llm.js');

const run = (cmd) => {
  console.log('> ' + cmd);
  execSync(cmd, { cwd: root, stdio: 'inherit' });
};

fs.mkdirSync(vendorDir, { recursive: true });
run('npm install --no-save @mlc-ai/web-llm esbuild');
if (!fs.existsSync(webLlmEntry)) {
  throw new Error(`WebLLM entry point was not installed: ${webLlmEntry}`);
}
run(`npx --no-install esbuild "${webLlmEntry}" --bundle --format=esm --platform=browser --outfile="${output}"`);
console.log(`\nDone. ${output} created. Reload the extension in chrome://extensions.`);
