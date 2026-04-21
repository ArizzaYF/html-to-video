#!/bin/bash

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${CYAN}  🎬  HTML to Video — Setup${NC}"
echo "  ────────────────────────────────"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
  echo -e "  ${RED}✗ Node.js no encontrado${NC}"
  echo "    Instala desde: https://nodejs.org (v18+)"
  exit 1
fi

NODE_VER=$(node -v)
echo -e "  ${GREEN}✓ Node.js${NC} $NODE_VER"

# Check npm
if ! command -v npm &> /dev/null; then
  echo -e "  ${RED}✗ npm no encontrado${NC}"
  exit 1
fi
echo -e "  ${GREEN}✓ npm${NC} $(npm -v)"

# Check FFmpeg
if command -v ffmpeg &> /dev/null; then
  FF_VER=$(ffmpeg -version 2>&1 | head -n1 | awk '{print $3}')
  echo -e "  ${GREEN}✓ FFmpeg${NC} $FF_VER"
else
  echo -e "  ${RED}✗ FFmpeg no encontrado${NC}"
  echo ""
  echo "  FFmpeg es REQUERIDO. Instrucciones de instalación:"
  echo ""
  echo "  macOS (Homebrew):"
  echo "    brew install ffmpeg"
  echo ""
  echo "  Ubuntu/Debian:"
  echo "    sudo apt update && sudo apt install ffmpeg"
  echo ""
  echo "  Windows:"
  echo "    Descarga desde https://ffmpeg.org/download.html"
  echo "    Agrega al PATH del sistema"
  echo ""
  exit 1
fi

echo ""
echo "  Instalando dependencias npm..."
npm install

echo ""
echo -e "  ${GREEN}✅ Setup completo.${NC}"
echo ""
echo "  Inicia la aplicación con:"
echo -e "  ${CYAN}  npm start${NC}"
echo ""
echo "  Luego abre: http://localhost:3000"
echo ""
