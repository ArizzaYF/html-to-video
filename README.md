# 🎬 HTML to Video

Herramienta local para convertir animaciones HTML en videos de alta calidad.

## Requisitos del sistema

| Dependencia | Versión mínima | Instalación |
|-------------|----------------|-------------|
| Node.js     | 18+            | [nodejs.org](https://nodejs.org) |
| FFmpeg      | 4.0+           | Ver abajo |

### Instalar FFmpeg

**macOS:**
```bash
brew install ffmpeg
```

**Ubuntu / Debian:**
```bash
sudo apt update && sudo apt install ffmpeg
```

**Windows:**
Descarga desde [ffmpeg.org](https://ffmpeg.org/download.html) y agrega al PATH.

## Instalación

```bash
# Clonar o descomprimir el proyecto
cd html-to-video

# Setup automático
./setup.sh

# O manual
npm install
```

## Uso

```bash
npm start
```

Abre **http://localhost:3000** en tu navegador.

## Flujo de uso

1. **Sube** tu archivo `.html` con animaciones
2. **Configura** resolución, FPS y duración
3. Haz clic en **Renderizar animación**
4. Monitorea el progreso en tiempo real
5. **Descarga** el video generado

## Opciones de configuración

| Opción      | Valores                | Default |
|-------------|------------------------|---------|
| Resolución  | 1080p, 2K, 4K         | 1080p   |
| Frame Rate  | 24, 30, 60 fps         | 30 fps  |
| Duración    | 0.5 — 300 segundos     | 5 s     |
| Formato     | MP4 (H.264), WebM (VP9)| MP4     |

> **Nota 4K:** Se usa `deviceScaleFactor: 2` a 1920×1080 para producir
> capturas de 3840×2160. El HTML debe estar diseñado para verse bien a 1920px.

## Estructura del proyecto

```
html-to-video/
├── server.js          # Servidor Express + API
├── renderer/
│   └── capture.js     # Motor de captura con Puppeteer
├── frontend/
│   └── index.html     # Interfaz de usuario
├── output/            # Videos generados (creado automáticamente)
├── temp/              # Frames temporales (limpiado automáticamente)
├── package.json
├── setup.sh
└── README.md
```

## API REST

| Método | Ruta                  | Descripción                        |
|--------|-----------------------|------------------------------------|
| POST   | `/api/render`         | Inicia un job de renderizado       |
| GET    | `/api/progress/:id`   | SSE stream de progreso             |
| GET    | `/api/outputs`        | Lista videos generados             |
| DELETE | `/api/output/:file`   | Elimina un video                   |
| GET    | `/api/info`           | Estado del sistema                 |

## Consejos para animaciones HTML

- Usa `animation-iteration-count: infinite` para loops
- La app pausa y reinicia las animaciones antes de capturar
- Assets externos (fuentes, imágenes) deben estar inline o en base64
- La app bloquea el acceso a internet durante la captura

## Licencia

MIT
