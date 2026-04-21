/**
 * capture.js — Puppeteer-based frame extractor
 * Renders HTML animations frame by frame at target resolution.
 */

const puppeteer = require('puppeteer');
const path = require('path');

/**
 * Resolution presets
 * 4K uses deviceScaleFactor:2 at 1920x1080 → produces 3840x2160 screenshots
 */
const RESOLUTION_MAP = {
  '1080p': { width: 1920, height: 1080, deviceScaleFactor: 1 },
  '2K':    { width: 2560, height: 1440, deviceScaleFactor: 1 },
  '4K':    { width: 1920, height: 1080, deviceScaleFactor: 2 },
};

/**
 * Sleep helper
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * captureFrames
 * @param {Object} opts
 * @param {string}   opts.htmlPath       - Absolute path to the HTML file
 * @param {string}   opts.frameDir       - Directory to write PNG frames
 * @param {string}   opts.resolution     - '1080p' | '2K' | '4K'
 * @param {number}   opts.fps            - Frames per second
 * @param {number}   opts.totalFrames    - Total frames to capture
 * @param {Function} opts.onProgress     - Callback(frameIndex, totalFrames)
 * @param {Function} opts.onLog          - Callback(message)
 */
async function captureFrames({ htmlPath, frameDir, resolution, fps, totalFrames, onProgress, onLog }) {
  const { width, height, deviceScaleFactor } = RESOLUTION_MAP[resolution] || RESOLUTION_MAP['1080p'];
  const frameInterval = 1000 / fps;

  onLog?.(`Lanzando navegador headless (${resolution} @ ${fps}fps)...`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--allow-file-access-from-files',
      `--window-size=${width},${height}`,
    ],
  });

  try {
    const page = await browser.newPage();

    await page.setViewport({ width, height, deviceScaleFactor });

    // Expose a global for HTML files that want to signal readiness
    await page.exposeFunction('__animReady__', () => {});

    onLog?.(`Cargando archivo HTML...`);

    // Navigate to file
    await page.goto(`file://${htmlPath}`, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });

    // Inject helper to freeze/unfreeze CSS animations
    await page.evaluate(() => {
      // Pause all animations to start fresh, then restart
      document.querySelectorAll('*').forEach((el) => {
        el.style.animationPlayState = 'paused';
      });
    });

    // Short settle time
    await sleep(200);

    // Restart animations from zero
    await page.evaluate(() => {
      document.querySelectorAll('*').forEach((el) => {
        el.style.animationDelay = '0s';
        el.style.animationPlayState = 'running';
      });
    });

    onLog?.(`Iniciando captura de ${totalFrames} frames...`);

    for (let i = 0; i < totalFrames; i++) {
      const framePath = path.join(frameDir, `frame_${String(i).padStart(5, '0')}.png`);

      await page.screenshot({
        path: framePath,
        type: 'png',
        omitBackground: false,
      });

      onProgress?.(i + 1, totalFrames);

      if (i < totalFrames - 1) {
        await sleep(frameInterval);
      }
    }

    onLog?.(`Captura completada. ${totalFrames} frames guardados.`);

  } finally {
    await browser.close();
  }
}

module.exports = { captureFrames };
