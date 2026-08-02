#!/usr/bin/env bash
# Coloca uma cópia do ffmpeg/ffprobe dentro do app, para ele funcionar em
# qualquer Mac sem depender de Homebrew.
#
#   ./scripts/fetch-ffmpeg.sh                    tenta baixar uma build estática
#   FFMPEG_URL=... ./scripts/fetch-ffmpeg.sh     usa a URL que você indicar
#   ./scripts/fetch-ffmpeg.sh --do-sistema       copia o ffmpeg já instalado
#
# Nota de licença: as builds estáticas de ffmpeg costumam incluir codecs GPL
# (x264/x265). Para uso pessoal tudo bem; se for redistribuir o app, leia
# https://ffmpeg.org/legal.html
set -euo pipefail

cd "$(dirname "$0")/.."
DESTINO="ConvrtVideo/Resources"
mkdir -p "$DESTINO"

conferir() {
  local binario="$1"
  if [[ ! -x "$binario" ]]; then
    echo "✗ $binario não é executável" >&2
    return 1
  fi
  if ! "$binario" -version >/dev/null 2>&1; then
    echo "✗ $binario não roda nesta máquina (arquitetura errada?)" >&2
    return 1
  fi
  echo "✓ $(basename "$binario"): $("$binario" -version | head -1)"
}

# ── modo 1: copiar o que já está instalado ────────────────────────────
if [[ "${1:-}" == "--do-sistema" ]]; then
  origem="$(command -v ffmpeg || true)"
  [[ -z "$origem" ]] && { echo "ffmpeg não está instalado. Rode: brew install ffmpeg" >&2; exit 1; }

  echo "→ copiando de $origem"
  cp "$origem" "$DESTINO/ffmpeg"
  origem_probe="$(command -v ffprobe || true)"
  [[ -n "$origem_probe" ]] && cp "$origem_probe" "$DESTINO/ffprobe"
  chmod +x "$DESTINO/ffmpeg" "$DESTINO/ffprobe" 2>/dev/null || true

  conferir "$DESTINO/ffmpeg" || true
  echo
  echo "ATENÇÃO: o ffmpeg do Homebrew é dinâmico — ele depende de dezenas de"
  echo "bibliotecas em $(brew --prefix 2>/dev/null || echo /opt/homebrew)/lib."
  echo "Ele vai funcionar no SEU Mac, mas não em um Mac sem Homebrew."
  echo "Para um app realmente portátil, use uma build estática (modo padrão)."
  exit 0
fi

# ── modo 2: baixar build estática ─────────────────────────────────────
ARQ="$(uname -m)"
echo "→ arquitetura detectada: $ARQ"

baixar() {
  local url="$1" nome="$2"
  local tmp
  tmp="$(mktemp -d)"
  echo "→ baixando $nome"
  echo "  $url"
  if ! curl -fL --connect-timeout 20 --retry 2 -o "$tmp/pacote" "$url"; then
    rm -rf "$tmp"
    return 1
  fi

  case "$url" in
    *.zip) (cd "$tmp" && unzip -qo pacote) ;;
    *.tar.xz|*.txz) (cd "$tmp" && tar xf pacote) ;;
    *.7z) command -v 7z >/dev/null && (cd "$tmp" && 7z x -y pacote >/dev/null) || { rm -rf "$tmp"; return 1; } ;;
    *) mv "$tmp/pacote" "$tmp/$nome" ;;
  esac

  local encontrado
  encontrado="$(find "$tmp" -type f -name "$nome" -perm -u+x | head -1)"
  [[ -z "$encontrado" ]] && encontrado="$(find "$tmp" -type f -name "$nome" | head -1)"
  if [[ -z "$encontrado" ]]; then
    rm -rf "$tmp"
    return 1
  fi

  chmod +x "$encontrado"
  mv "$encontrado" "$DESTINO/$nome"
  rm -rf "$tmp"
}

if [[ -n "${FFMPEG_URL:-}" ]]; then
  baixar "$FFMPEG_URL" ffmpeg || { echo "✗ não consegui baixar de FFMPEG_URL" >&2; exit 1; }
  [[ -n "${FFPROBE_URL:-}" ]] && baixar "$FFPROBE_URL" ffprobe
else
  # evermeet.cx publica builds estáticas de ffmpeg para macOS há muitos anos.
  # Em Apple Silicon elas rodam via Rosetta; se preferir uma build arm64 nativa,
  # passe FFMPEG_URL apontando para ela (ex.: osxexperts.net).
  baixar "https://evermeet.cx/ffmpeg/getrelease/ffmpeg/zip" ffmpeg || {
    cat <<'MSG' >&2

✗ Não consegui baixar automaticamente.

Alternativas:
  1. brew install ffmpeg          e depois ./scripts/fetch-ffmpeg.sh --do-sistema
  2. baixe manualmente uma build estática (evermeet.cx/ffmpeg ou osxexperts.net)
     e coloque os arquivos em macos/ConvrtVideo/Resources/ffmpeg e /ffprobe
  3. rode o app sem embutir nada: ele acha o ffmpeg do Homebrew sozinho

MSG
    exit 1
  }
  baixar "https://evermeet.cx/ffmpeg/getrelease/ffprobe/zip" ffprobe || \
    echo "⚠ ffprobe não baixou — o app ainda converte, mas não mostra as infos do vídeo"
fi

echo
conferir "$DESTINO/ffmpeg" || true
[[ -f "$DESTINO/ffprobe" ]] && conferir "$DESTINO/ffprobe" || true

if [[ "$ARQ" == "arm64" ]] && file "$DESTINO/ffmpeg" | grep -q x86_64; then
  echo
  echo "⚠ A build baixada é Intel (x86_64). Ela roda no seu Mac via Rosetta,"
  echo "  mas fica bem mais lenta. Para máxima velocidade use brew install ffmpeg"
  echo "  ou uma build arm64 nativa."
fi

echo
echo "✓ ffmpeg embutido em $DESTINO/"
echo "  agora compile: ./scripts/build.sh"
