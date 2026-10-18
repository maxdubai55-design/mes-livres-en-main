#!/usr/bin/env bash
# Reconstruit tout le film : modèles, images, son, rendu.
set -euo pipefail
cd "$(dirname "$0")/.."
M=travail/modeles
mkdir -p "$M/rembg"

pip install -q numpy scipy opencv-python-headless pillow rembg onnxruntime torch piper-tts

if [ ! -f "$M/vits-piper-fr_FR-tom-medium/fr_FR-tom-medium.onnx" ]; then
  T=$(mktemp -d)
  curl -sSL -o "$T/v.tar.bz2" https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-fr_FR-tom-medium.tar.bz2
  tar -xjf "$T/v.tar.bz2" -C "$M"
  rm -rf "$T"
fi
[ -f "$M/realesr-general-x4v3.pth" ] || curl -sSL -o "$M/realesr-general-x4v3.pth" \
  https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesr-general-x4v3.pth
[ -f "$M/rembg/isnet-general-use.onnx" ] || curl -sSL -o "$M/rembg/isnet-general-use.onnx" \
  https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx

python3 outils/preparer_images.py
python3 outils/audio.py "$@"
python3 outils/rendu.py --film
