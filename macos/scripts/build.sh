#!/usr/bin/env bash
# Gera o projeto Xcode e compila o app.
#
#   ./scripts/build.sh            gera o .xcodeproj e compila em build/
#   ./scripts/build.sh --abrir    gera o .xcodeproj e abre no Xcode
#
# Precisa do XcodeGen: brew install xcodegen
set -euo pipefail

cd "$(dirname "$0")/.."
RAIZ="$PWD"

if ! command -v xcodegen >/dev/null 2>&1; then
  cat <<'MSG'
XcodeGen não encontrado.

  brew install xcodegen

Ou, se você não quiser instalar nada:
  ./scripts/build-sem-xcode.sh     compila direto com o swiftc
MSG
  exit 1
fi

echo "→ gerando ConvrtVideo.xcodeproj"
xcodegen generate --spec project.yml

if [[ "${1:-}" == "--abrir" ]]; then
  open ConvrtVideo.xcodeproj
  echo "→ aberto no Xcode. Use ⌘R para rodar."
  exit 0
fi

echo "→ compilando (Release)"
xcodebuild \
  -project ConvrtVideo.xcodeproj \
  -scheme ConvrtVideo \
  -configuration Release \
  -derivedDataPath build/DerivedData \
  CODE_SIGN_IDENTITY="-" \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGNING_ALLOWED=NO \
  build

APP="$RAIZ/build/DerivedData/Build/Products/Release/ConvrtVideo.app"
if [[ -d "$APP" ]]; then
  mkdir -p "$RAIZ/build"
  rm -rf "$RAIZ/build/ConvrtVideo.app"
  cp -R "$APP" "$RAIZ/build/ConvrtVideo.app"
  codesign --force --deep --sign - "$RAIZ/build/ConvrtVideo.app" 2>/dev/null || true
  echo
  echo "✓ pronto: build/ConvrtVideo.app"
  echo "  abrir:  open build/ConvrtVideo.app"
  echo "  instalar: cp -R build/ConvrtVideo.app /Applications/"
else
  echo "✗ não encontrei o .app compilado" >&2
  exit 1
fi
