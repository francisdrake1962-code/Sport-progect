#!/usr/bin/env node
// Encode source lesson videos to 720p H.264 MP4 for self-hosted serving (free lessons).
// Usage: node server/scripts/encode-720p.js <input.mp4> [output.mp4]
// Requires ffmpeg installed and on PATH.

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const input = process.argv[2];
if (!input) {
  console.error('Usage: node server/scripts/encode-720p.js <input.mp4> [output.mp4]');
  process.exit(1);
}

const defaultOutput = path.join(
  path.dirname(input),
  path.basename(input, path.extname(input)) + '_720p.mp4'
);
const output = process.argv[3] || defaultOutput;

if (!fs.existsSync(input)) {
  console.error(`Input not found: ${input}`);
  process.exit(1);
}

const args = [
  '-i', input,
  '-vf', 'scale=-2:720',
  '-c:v', 'libx264',
  '-preset', 'medium',
  '-crf', '23',
  '-maxrate', '2500k',
  '-bufsize', '5000k',
  '-pix_fmt', 'yuv420p',
  '-c:a', 'aac',
  '-b:a', '128k',
  '-movflags', '+faststart',
  '-y',
  output,
];

console.log(`Encoding ${input} -> ${output} (720p)`);
try {
  execFileSync('ffmpeg', args, { stdio: 'inherit' });
  const stat = fs.statSync(output);
  console.log(`Done: ${output} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
} catch (err) {
  console.error('Encoding failed. Is ffmpeg installed and on PATH?');
  console.error(String(err.stderr || err.message));
  process.exit(1);
}
