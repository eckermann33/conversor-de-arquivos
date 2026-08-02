#!/usr/bin/env bash
# Compila o app sem projeto do Xcode, usando só o swiftc das Command Line Tools.
# Serve como plano B (e é o caminho mais rápido para testar uma mudança).
#
#   ./scripts/build-sem-xcode.sh              compila para a arquitetura do seu Mac
#   ./scripts/build-sem-xcode.sh --universal  compila para Apple Silicon + Intel
#   ./scripts/build-sem-xcode.sh --abrir      compila e abre o app
set -euo pipefail

cd "$(dirname "$0")/.."
RAIZ="$PWD"
APP="$RAIZ/build/ConvrtVideo.app"
BIN="$APP/Contents/MacOS/ConvrtVideo"
MIN_MACOS="13.0"

if ! command -v swiftc >/dev/null 2>&1; then
  echo "swiftc não encontrado. Instale as ferramentas de linha de comando:" >&2
  echo "  xcode-select --install" >&2
  exit 1
fi

FONTES=()
while IFS= read -r arquivo; do FONTES+=("$arquivo"); done < <(find ConvrtVideo -name '*.swift' | sort)
echo "→ ${#FONTES[@]} arquivos Swift"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

compilar() {
  local alvo="$1" destino="$2"
  echo "→ compilando para $alvo"
  swiftc \
    -O \
    -parse-as-library \
    -target "$alvo" \
    -sdk "$(xcrun --show-sdk-path --sdk macosx)" \
    -framework SwiftUI -framework AppKit -framework Foundation \
    -o "$destino" \
    "${FONTES[@]}"
}

if [[ "${1:-}" == "--universal" ]]; then
  compilar "arm64-apple-macos$MIN_MACOS" "$RAIZ/build/convrt-arm64"
  compilar "x86_64-apple-macos$MIN_MACOS" "$RAIZ/build/convrt-x86_64"
  lipo -create -output "$BIN" "$RAIZ/build/convrt-arm64" "$RAIZ/build/convrt-x86_64"
  rm -f "$RAIZ/build/convrt-arm64" "$RAIZ/build/convrt-x86_64"
else
  compilar "$(uname -m)-apple-macos$MIN_MACOS" "$BIN"
fi

# Info.plist com as variáveis já substituídas
sed -e 's|\$(EXECUTABLE_NAME)|ConvrtVideo|g' \
    -e 's|\$(PRODUCT_BUNDLE_IDENTIFIER)|com.convrt.video|g' \
    ConvrtVideo/Resources/Info.plist > "$APP/Contents/Info.plist"

# ffmpeg embutido, se você tiver rodado o fetch-ffmpeg.sh
for binario in ffmpeg ffprobe; do
  if [[ -x "ConvrtVideo/Resources/$binario" ]]; then
    cp "ConvrtVideo/Resources/$binario" "$APP/Contents/Resources/$binario"
    echo "→ $binario embutido no app"
  fi
done

codesign --force --deep --sign - "$APP" 2>/dev/null || echo "(assinatura ad-hoc falhou — o app ainda roda)"

echo
echo "✓ pronto: build/ConvrtVideo.app"
[[ "${1:-}" == "--abrir" ]] && open "$APP"
exit 0
