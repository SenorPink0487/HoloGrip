import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fontsDir = path.resolve(__dirname, '../fonts');

if (!fs.existsSync(fontsDir)) {
  fs.mkdirSync(fontsDir, { recursive: true });
}

const weights = [300, 400, 500, 700, 900];

async function downloadFonts() {
  const cssUrl = 'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;700;900&display=swap';
  console.log('Fetching Google Fonts CSS...');
  const res = await fetch(cssUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });
  const cssText = await res.text();
  
  // Extract font URLs for each block
  const blocks = cssText.split('@font-face');
  for (const block of blocks) {
    const weightMatch = block.match(/font-weight:\s*(\d+)/);
    const urlMatch = block.match(/url\((https:\/\/[^)]+)\)/);
    
    if (weightMatch && urlMatch) {
      const weight = weightMatch[1];
      const fontUrl = urlMatch[1];
      const destPath = path.join(fontsDir, `Outfit-${weight}.woff2`);
      
      console.log(`Downloading Outfit weight ${weight} from ${fontUrl}...`);
      const fontRes = await fetch(fontUrl);
      const arrayBuffer = await fontRes.arrayBuffer();
      fs.writeFileSync(destPath, Buffer.from(arrayBuffer));
      console.log(`Saved: Outfit-${weight}.woff2`);
    }
  }
  console.log('All fonts downloaded successfully!');
}

downloadFonts().catch(err => {
  console.error(err);
  process.exit(1);
});
