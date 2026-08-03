#!/usr/bin/env python3
"""
Gera o ícone do app: AppIcon.icns (para os scripts de build) e
AppIcon-1024.png (para arrastar no Assets.xcassets do Xcode).

    python3 scripts/gerar-icone.py

Precisa do Pillow:  pip3 install Pillow
O desenho segue a identidade do app web: fundo escuro, "C" amarelo e um
play vermelho.
"""
import struct
from pathlib import Path

from PIL import Image, ImageDraw

RAIZ = Path(__file__).resolve().parent.parent
DESTINO = RAIZ / "ConvrtVideo" / "Resources"

FUNDO = (10, 10, 10, 255)
AMARELO = (232, 255, 71, 255)
VERMELHO = (255, 87, 51, 255)


def desenhar(tamanho: int) -> Image.Image:
    """Desenha o ícone em 4x e reduz, para as bordas saírem suaves."""
    escala = 4
    lado = tamanho * escala
    img = Image.new("RGBA", (lado, lado), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # macOS espera um quadrado arredondado com uma margem em volta
    margem = int(lado * 0.055)
    raio = int(lado * 0.225)
    d.rounded_rectangle(
        [margem, margem, lado - margem, lado - margem],
        radius=raio,
        fill=FUNDO,
    )

    # linhas de grade, como no fundo do app web. O ImageDraw substitui o pixel
    # em vez de misturar o alfa, então a transparência tem que vir numa camada
    # separada e ser composta por cima — senão a linha "apaga" o fundo.
    grade = Image.new("RGBA", (lado, lado), (0, 0, 0, 0))
    dg = ImageDraw.Draw(grade)
    espessura = max(1, lado // 350)
    for i in range(1, 10):
        p = margem + i * (lado - 2 * margem) // 10
        dg.line([(p, margem), (p, lado - margem)], fill=(232, 255, 71, 26), width=espessura)
        dg.line([(margem, p), (lado - margem, p)], fill=(232, 255, 71, 26), width=espessura)

    # a grade só aparece dentro do quadrado arredondado
    recorte = Image.new("L", (lado, lado), 0)
    ImageDraw.Draw(recorte).rounded_rectangle(
        [margem, margem, lado - margem, lado - margem], radius=raio, fill=255)
    img = Image.alpha_composite(img, Image.composite(grade, Image.new("RGBA", (lado, lado), (0, 0, 0, 0)), recorte))
    d = ImageDraw.Draw(img)

    # "C" amarelo: arco grosso aberto à direita
    centro = lado // 2
    raio_c = int(lado * 0.255)
    grossura = int(lado * 0.088)
    caixa = [centro - raio_c - int(lado * 0.075), centro - raio_c,
             centro + raio_c - int(lado * 0.075), centro + raio_c]
    d.arc(caixa, start=40, end=320, fill=AMARELO, width=grossura)

    # play vermelho, à direita do C
    x = centro + int(lado * 0.105)
    altura = int(lado * 0.235)
    largura = int(lado * 0.195)
    d.polygon(
        [(x, centro - altura // 2), (x, centro + altura // 2), (x + largura, centro)],
        fill=VERMELHO,
    )

    return img.resize((tamanho, tamanho), Image.LANCZOS)


def png_bytes(tamanho: int) -> bytes:
    from io import BytesIO
    buffer = BytesIO()
    desenhar(tamanho).save(buffer, format="PNG")
    return buffer.getvalue()


def montar_icns(caminho: Path) -> None:
    """Escreve um .icns com os PNGs embutidos (formato aceito desde o 10.7)."""
    tipos = [
        (b"icp4", 16), (b"icp5", 32), (b"icp6", 64),
        (b"ic07", 128), (b"ic08", 256), (b"ic09", 512),
        (b"ic11", 32), (b"ic12", 64), (b"ic13", 256),
        (b"ic14", 512), (b"ic10", 1024),
    ]
    blocos = b""
    for tipo, tamanho in tipos:
        dados = png_bytes(tamanho)
        blocos += tipo + struct.pack(">I", len(dados) + 8) + dados

    conteudo = b"icns" + struct.pack(">I", len(blocos) + 8) + blocos
    caminho.write_bytes(conteudo)


def main() -> None:
    DESTINO.mkdir(parents=True, exist_ok=True)

    grande = DESTINO / "AppIcon-1024.png"
    desenhar(1024).save(grande, format="PNG")
    print(f"✓ {grande.relative_to(RAIZ)}  ({grande.stat().st_size // 1024} KB)")

    icns = DESTINO / "AppIcon.icns"
    montar_icns(icns)
    print(f"✓ {icns.relative_to(RAIZ)}  ({icns.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
