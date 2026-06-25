import fs from 'fs';
import path from 'path';

const assetsDir = path.resolve('src/assets');
fs.mkdirSync(assetsDir, { recursive: true });

// Minimal 1x1 transparent PNG base64
const base64Png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const buf = Buffer.from(base64Png, 'base64');

['icon16.png', 'icon48.png', 'icon128.png'].forEach((file) => {
  fs.writeFileSync(path.join(assetsDir, file), buf);
});
console.log('Created placeholder PNG icons in src/assets/');
