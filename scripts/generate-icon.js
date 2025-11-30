/**
 * Icon Generator for Suno Desktop Player
 * 
 * This script generates proper .ico and .png icons for the application.
 * Run: node scripts/generate-icon.js
 * 
 * Creates:
 * - build/icon.ico (Windows - multi-size ICO with 256, 128, 64, 48, 32, 16px)
 * - build/icon.png (Linux/Mac - 512px PNG)
 */

const fs = require('fs');
const path = require('path');

// Create build directory
const buildDir = path.join(__dirname, '..', 'build');
if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true });
}

// Generate icon pixels for a given size
function generateIconPixels(size) {
  const pixels = Buffer.alloc(size * size * 4, 0);
  
  const setPixel = (x, y, r, g, b, a) => {
    if (x >= 0 && x < size && y >= 0 && y < size) {
      const idx = (y * size + x) * 4;
      pixels[idx] = b;     // ICO uses BGRA
      pixels[idx + 1] = g;
      pixels[idx + 2] = r;
      pixels[idx + 3] = a;
    }
  };
  
  const setPixelRGBA = (x, y, r, g, b, a) => {
    if (x >= 0 && x < size && y >= 0 && y < size) {
      const idx = (y * size + x) * 4;
      pixels[idx] = r;     // PNG uses RGBA
      pixels[idx + 1] = g;
      pixels[idx + 2] = b;
      pixels[idx + 3] = a;
    }
  };
  
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.44;
  
  // Draw circular gradient background (purple to pink)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist <= radius) {
        // Gradient from purple to lighter purple
        const t = (x + y) / (size * 2);
        const r = Math.floor(124 + t * 44);  // 124 -> 168
        const g = Math.floor(58 + t * 27);   // 58 -> 85
        const b = Math.floor(237 + t * 10);  // 237 -> 247
        
        // Anti-aliasing at edges
        let alpha = 255;
        if (dist > radius - 1.5) {
          alpha = Math.floor(255 * (radius - dist + 1.5) / 1.5);
        }
        
        setPixel(x, y, r, g, b, alpha);
      }
    }
  }
  
  // Draw sound wave bars (pink) - centered
  const barColor = { r: 236, g: 72, b: 153 };
  const scale = size / 32;
  
  // 5 bars with different heights - centered at x=16 (middle of 32px base)
  // Bar positions: 7, 11, 15, 19, 23 (centered around 15-16)
  const bars = [
    { x: 7, y1: 11, y2: 21 },
    { x: 11, y1: 9, y2: 23 },
    { x: 15, y1: 7, y2: 25 },
    { x: 19, y1: 9, y2: 23 },
    { x: 23, y1: 11, y2: 21 }
  ];
  
  bars.forEach(bar => {
    const bx = Math.floor(bar.x * scale);
    const by1 = Math.floor(bar.y1 * scale);
    const by2 = Math.floor(bar.y2 * scale);
    const width = Math.max(2, Math.floor(2 * scale));
    
    // Center the bar width
    const offset = Math.floor(width / 2);
    for (let y = by1; y <= by2; y++) {
      for (let w = -offset; w < width - offset; w++) {
        setPixel(bx + w, y, barColor.r, barColor.g, barColor.b, 255);
      }
    }
  });
  
  return pixels;
}

// Generate PNG icon pixels (RGBA format)
function generatePngPixels(size) {
  const pixels = Buffer.alloc(size * size * 4, 0);
  
  const setPixel = (x, y, r, g, b, a) => {
    if (x >= 0 && x < size && y >= 0 && y < size) {
      const idx = (y * size + x) * 4;
      pixels[idx] = r;
      pixels[idx + 1] = g;
      pixels[idx + 2] = b;
      pixels[idx + 3] = a;
    }
  };
  
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.44;
  
  // Draw circular gradient background
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist <= radius) {
        const t = (x + y) / (size * 2);
        const r = Math.floor(124 + t * 44);
        const g = Math.floor(58 + t * 27);
        const b = Math.floor(237 + t * 10);
        
        let alpha = 255;
        if (dist > radius - 1.5) {
          alpha = Math.floor(255 * (radius - dist + 1.5) / 1.5);
        }
        
        setPixel(x, y, r, g, b, alpha);
      }
    }
  }
  
  // Draw sound wave bars - centered
  const barColor = { r: 236, g: 72, b: 153 };
  const scale = size / 32;
  
  // 5 bars centered around x=15-16
  const bars = [
    { x: 7, y1: 11, y2: 21 },
    { x: 11, y1: 9, y2: 23 },
    { x: 15, y1: 7, y2: 25 },
    { x: 19, y1: 9, y2: 23 },
    { x: 23, y1: 11, y2: 21 }
  ];
  
  bars.forEach(bar => {
    const bx = Math.floor(bar.x * scale);
    const by1 = Math.floor(bar.y1 * scale);
    const by2 = Math.floor(bar.y2 * scale);
    const width = Math.max(2, Math.floor(2 * scale));
    
    const offset = Math.floor(width / 2);
    for (let y = by1; y <= by2; y++) {
      for (let w = -offset; w < width - offset; w++) {
        setPixel(bx + w, y, barColor.r, barColor.g, barColor.b, 255);
      }
    }
  });
  
  return pixels;
}

// Create ICO file with multiple sizes
function createIcoFile(outputPath) {
  const sizes = [256, 128, 64, 48, 32, 16];
  const images = [];
  
  // Generate each size
  sizes.forEach(size => {
    const pixels = generateIconPixels(size);
    images.push({ size, pixels });
  });
  
  // ICO Header (6 bytes)
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);           // Reserved
  header.writeUInt16LE(1, 2);           // Type (1 = ICO)
  header.writeUInt16LE(images.length, 4); // Number of images
  
  // Calculate offsets
  const dirEntrySize = 16;
  let dataOffset = 6 + (images.length * dirEntrySize);
  
  const directories = [];
  const bitmaps = [];
  
  images.forEach(img => {
    const { size, pixels } = img;
    
    // BMP Info Header (40 bytes)
    const bmpHeader = Buffer.alloc(40);
    bmpHeader.writeUInt32LE(40, 0);        // Header size
    bmpHeader.writeInt32LE(size, 4);       // Width
    bmpHeader.writeInt32LE(size * 2, 8);   // Height (doubled for XOR + AND masks)
    bmpHeader.writeUInt16LE(1, 12);        // Planes
    bmpHeader.writeUInt16LE(32, 14);       // Bits per pixel
    bmpHeader.writeUInt32LE(0, 16);        // Compression
    bmpHeader.writeUInt32LE(pixels.length, 20); // Image size
    bmpHeader.writeInt32LE(0, 24);         // X pixels per meter
    bmpHeader.writeInt32LE(0, 28);         // Y pixels per meter
    bmpHeader.writeUInt32LE(0, 32);        // Colors used
    bmpHeader.writeUInt32LE(0, 36);        // Important colors
    
    // Flip pixels vertically (BMP is bottom-up)
    const flippedPixels = Buffer.alloc(pixels.length);
    for (let y = 0; y < size; y++) {
      const srcOffset = y * size * 4;
      const dstOffset = (size - 1 - y) * size * 4;
      pixels.copy(flippedPixels, dstOffset, srcOffset, srcOffset + size * 4);
    }
    
    // AND mask (1-bit transparency mask) - all zeros for full transparency support
    const andMaskRowSize = Math.ceil(size / 8);
    const andMaskRowPadded = Math.ceil(andMaskRowSize / 4) * 4;
    const andMask = Buffer.alloc(andMaskRowPadded * size, 0);
    
    const bitmap = Buffer.concat([bmpHeader, flippedPixels, andMask]);
    
    // Directory entry
    const dir = Buffer.alloc(16);
    dir.writeUInt8(size === 256 ? 0 : size, 0);  // Width (0 = 256)
    dir.writeUInt8(size === 256 ? 0 : size, 1);  // Height (0 = 256)
    dir.writeUInt8(0, 2);                         // Color palette
    dir.writeUInt8(0, 3);                         // Reserved
    dir.writeUInt16LE(1, 4);                      // Color planes
    dir.writeUInt16LE(32, 6);                     // Bits per pixel
    dir.writeUInt32LE(bitmap.length, 8);          // Size of image data
    dir.writeUInt32LE(dataOffset, 12);            // Offset to image data
    
    directories.push(dir);
    bitmaps.push(bitmap);
    dataOffset += bitmap.length;
  });
  
  // Combine all parts
  const ico = Buffer.concat([header, ...directories, ...bitmaps]);
  fs.writeFileSync(outputPath, ico);
  console.log(`✅ Created: ${outputPath} (${ico.length} bytes, ${sizes.length} sizes: ${sizes.join(', ')}px)`);
}

// Create simple PNG file
function createPngFile(outputPath, size) {
  const pixels = generatePngPixels(size);
  
  // Simple uncompressed PNG
  const zlib = require('zlib');
  
  // PNG Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  
  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);    // Width
  ihdr.writeUInt32BE(size, 4);    // Height
  ihdr.writeUInt8(8, 8);          // Bit depth
  ihdr.writeUInt8(6, 9);          // Color type (RGBA)
  ihdr.writeUInt8(0, 10);         // Compression
  ihdr.writeUInt8(0, 11);         // Filter
  ihdr.writeUInt8(0, 12);         // Interlace
  
  const ihdrChunk = createPngChunk('IHDR', ihdr);
  
  // IDAT chunk (compressed image data)
  // Add filter byte (0) at the start of each row
  const rawData = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    rawData[y * (size * 4 + 1)] = 0; // Filter: None
    pixels.copy(rawData, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  
  const compressed = zlib.deflateSync(rawData, { level: 9 });
  const idatChunk = createPngChunk('IDAT', compressed);
  
  // IEND chunk
  const iendChunk = createPngChunk('IEND', Buffer.alloc(0));
  
  const png = Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
  fs.writeFileSync(outputPath, png);
  console.log(`✅ Created: ${outputPath} (${png.length} bytes, ${size}x${size}px)`);
}

function createPngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  
  const typeBuffer = Buffer.from(type);
  const crcData = Buffer.concat([typeBuffer, data]);
  const crc = crc32(crcData);
  
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc, 0);
  
  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

// CRC32 implementation for PNG
function crc32(data) {
  let crc = 0xFFFFFFFF;
  const table = getCrc32Table();
  
  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

let crc32Table = null;
function getCrc32Table() {
  if (crc32Table) return crc32Table;
  
  crc32Table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crc32Table[i] = c;
  }
  return crc32Table;
}

// Main
console.log('🎨 Generating Suno Desktop Player icons...\n');

const icoPath = path.join(buildDir, 'icon.ico');
const pngPath = path.join(buildDir, 'icon.png');

createIcoFile(icoPath);
createPngFile(pngPath, 512);

console.log('\n✨ Icon generation complete!');
console.log('   Icons are in the build/ folder');
