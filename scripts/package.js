import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const distDir = path.resolve('dist');
const zipPath = path.resolve('LeetCommit.zip');

if (!fs.existsSync(distDir)) {
  console.error('Error: dist directory not found. Run npm run build first.');
  process.exit(1);
}

try {
  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }

  // Windows PowerShell native archive command
  execSync(`powershell Compress-Archive -Path "${distDir}\\*" -DestinationPath "${zipPath}" -Force`);
  console.log('Successfully created production release archive: LeetCommit.zip');
} catch (err) {
  console.error('Failed to package extension archive:', err);
  process.exit(1);
}
