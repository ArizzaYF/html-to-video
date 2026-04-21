/**
 * server.js — HTML to Video
 * Express server: file upload → Puppeteer capture → FFmpeg encode → download
 */

const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { v4: uuidv4 } = require('uuid');
const ffmpeg  = require('fluent-ffmpeg');
const { captureFrames } = require('./renderer/capture');

// ─── Bootstrap ────────────────────────────────────────────────────────────────

const app  = express();
const PORT = 3000;

// Ensure required dirs exist
['temp', 'output'].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ─── Check FFmpeg availability ─────────────────────────────────────────────────

let ffmpegAvailable = false;
try {
  const { execSync } = require('child_process');
  execSync('ffmpeg -version', { stdio: 'ignore' });
  ffmpegAvailable = true;
  console.log('✅ FFmpeg encontrado');
} catch {
  console.warn('⚠️  FFmpeg no encontrado. Instálalo desde https://ffmpeg.org/download.html');
}

// ─── Multer ────────────────────────────────────────────────────────────────────

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'temp/'),
  filename:    (req, file, cb) => cb(null, `upload_${uuidv4()}.html`),
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB max
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.html' || file.mimetype === 'text/html') {
      cb(null, true);
    } else {
      cb(new Error('Solo se aceptan archivos .html'));
    }
  },
});

// ─── SSE: Server-Sent Events for progress ─────────────────────────────────────

const sseClients = new Map(); // jobId → res

app.get('/api/progress/:jobId', (req, res) => {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const { jobId } = req.params;
  sseClients.set(jobId, res);

  // Keep-alive ping every 15s
  const ping = setInterval(() => res.write(': ping\n\n'), 15000);

  req.on('close', () => {
    clearInterval(ping);
    sseClients.delete(jobId);
  });
});

function sendEvent(jobId, payload) {
  const client = sseClients.get(jobId);
  if (client) {
    client.write(`data: ${JSON.stringify(payload)}\n\n`);
  }
}

// ─── Static ────────────────────────────────────────────────────────────────────

app.use(express.static('frontend'));
app.use('/downloads', express.static('output'));
app.use(express.json());

// ─── Routes ────────────────────────────────────────────────────────────────────

// System info
app.get('/api/info', (req, res) => {
  res.json({ ffmpegAvailable, version: '1.0.0' });
});

// List outputs
app.get('/api/outputs', (req, res) => {
  try {
    const files = fs.readdirSync('output')
      .filter((f) => f.endsWith('.mp4'))
      .map((f) => {
        const stat = fs.statSync(path.join('output', f));
        return {
          name: f,
          url:  `/downloads/${f}`,
          size: stat.size,
          created: stat.birthtime,
        };
      })
      .sort((a, b) => new Date(b.created) - new Date(a.created));
    res.json(files);
  } catch {
    res.json([]);
  }
});

// Delete output
app.delete('/api/output/:file', (req, res) => {
  const filePath = path.join('output', path.basename(req.params.file));
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Archivo no encontrado' });
  }
});

// ─── Main render endpoint ──────────────────────────────────────────────────────

app.post('/api/render', upload.single('html'), async (req, res) => {
  if (!ffmpegAvailable) {
    return res.status(500).json({ error: 'FFmpeg no está instalado en el sistema.' });
  }

  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: 'No se subió ningún archivo HTML.' });
  }

  // Parse params
  const resolution = req.body.resolution || '1080p';
  const fps        = Math.min(Math.max(parseInt(req.body.fps)      || 30,  1), 120);
  const duration   = Math.min(Math.max(parseFloat(req.body.duration) || 5,  0.5), 300);
  const format     = req.body.format || 'mp4';

  const jobId      = uuidv4();
  const frameDir   = path.join('temp', jobId);
  const htmlPath   = path.resolve(file.path);
  const totalFrames = Math.ceil(fps * duration);
  const outputName  = `render_${jobId}.${format}`;
  const outputPath  = path.join('output', outputName);

  // Respond immediately with jobId so client subscribes to SSE
  res.json({ jobId, totalFrames });

  fs.mkdirSync(frameDir, { recursive: true });

  // ── Stage 1: Frame capture ──────────────────────────────────────────────────
  try {
    sendEvent(jobId, {
      stage:    'init',
      progress: 0,
      message:  'Iniciando captura de frames...',
    });

    await captureFrames({
      htmlPath,
      frameDir,
      resolution,
      fps,
      totalFrames,
      onProgress: (frame, total) => {
        const pct = Math.round((frame / total) * 65);
        sendEvent(jobId, {
          stage:    'capture',
          progress: pct,
          message:  `Frame ${frame} / ${total}`,
          frame,
          total,
        });
      },
      onLog: (msg) => {
        sendEvent(jobId, { stage: 'log', message: msg });
      },
    });

    // ── Stage 2: FFmpeg encode ──────────────────────────────────────────────
    sendEvent(jobId, {
      stage:    'encode',
      progress: 65,
      message:  'Codificando video con FFmpeg...',
    });

    await encodeVideo({ frameDir, fps, format, outputPath, jobId });

    // ── Done ────────────────────────────────────────────────────────────────
    const stat = fs.statSync(outputPath);
    sendEvent(jobId, {
      stage:       'done',
      progress:    100,
      message:     '¡Video listo!',
      downloadUrl: `/downloads/${outputName}`,
      fileName:    outputName,
      fileSize:    stat.size,
    });

  } catch (err) {
    console.error(`[${jobId}] ERROR:`, err.message);
    sendEvent(jobId, {
      stage:   'error',
      message: err.message || 'Error desconocido durante el renderizado.',
    });
  } finally {
    cleanup(frameDir, htmlPath);
  }
});

// ─── FFmpeg encode helper ──────────────────────────────────────────────────────

function encodeVideo({ frameDir, fps, format, outputPath, jobId }) {
  return new Promise((resolve, reject) => {
    const inputPattern = path.join(frameDir, 'frame_%05d.png');

    let cmd = ffmpeg()
      .input(inputPattern)
      .inputFPS(fps)
      .videoCodec('libx264')
      .outputOptions([
        '-pix_fmt yuv420p',
        '-crf 18',           // High quality (0=lossless, 51=worst)
        '-preset slow',      // Better compression
        '-movflags +faststart',
      ])
      .output(outputPath);

    if (format === 'webm') {
      cmd = ffmpeg()
        .input(inputPattern)
        .inputFPS(fps)
        .videoCodec('libvpx-vp9')
        .outputOptions(['-crf 31', '-b:v 0'])
        .output(outputPath);
    }

    cmd
      .on('progress', (info) => {
        const pct = 65 + Math.round((info.percent || 0) * 0.34);
        sendEvent(jobId, {
          stage:    'encode',
          progress: Math.min(pct, 99),
          message:  `Codificando... ${Math.round(info.percent || 0)}%`,
        });
      })
      .on('end', resolve)
      .on('error', (err) => reject(new Error(`FFmpeg: ${err.message}`)))
      .run();
  });
}

// ─── Cleanup ───────────────────────────────────────────────────────────────────

function cleanup(...paths) {
  for (const p of paths) {
    try {
      if (fs.existsSync(p)) {
        const stat = fs.statSync(p);
        if (stat.isDirectory()) {
          fs.rmSync(p, { recursive: true, force: true });
        } else {
          fs.unlinkSync(p);
        }
      }
    } catch (e) {
      console.warn('Cleanup error:', e.message);
    }
  }
}

// ─── Error handler ─────────────────────────────────────────────────────────────

app.use((err, req, res, _next) => {
  console.error('Express error:', err.message);
  res.status(err.status || 500).json({ error: err.message });
});

// ─── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log('');
  console.log('  🎬  HTML to Video');
  console.log(`  ─────────────────────────────`);
  console.log(`  Local:  http://localhost:${PORT}`);
  console.log(`  Status: ${ffmpegAvailable ? '✅ Ready' : '⚠️  FFmpeg missing'}`);
  console.log('');
});
