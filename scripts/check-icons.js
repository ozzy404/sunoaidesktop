const fs = require('fs');
const path = require('path');

// Simple script to verify icon files exist
// In production, you would use a tool like electron-icon-maker

const assetsDir = path.join(__dirname, 'assets');

// Check if icon.svg exists
const svgPath = path.join(assetsDir, 'icon.svg');
if (fs.existsSync(svgPath)) {
  console.log('✅ icon.svg exists');
} else {
  console.log('❌ icon.svg not found');
}

console.log('\nFor building with proper icons, you need to:');
console.log('1. Use an online SVG to ICO converter for Windows');
console.log('2. Use an online SVG to ICNS converter for macOS');
console.log('3. Use an online SVG to PNG (256x256) converter for Linux');
console.log('\nPlace the converted files in the assets folder as:');
console.log('- icon.ico (Windows)');
console.log('- icon.icns (macOS)');
console.log('- icon.png (Linux, 256x256 or larger)');
