# CONVRT — conversor de arquivos

Dois programas no mesmo repositório:

| Pasta | O que é | Precisa de internet? |
| --- | --- | --- |
| raiz (`index.html`) | **App web**: 36 conversões de documentos, dados, imagens e texto que rodam dentro do navegador | só na primeira visita |
| [`macos/`](macos/) | **App nativo de macOS (Xcode)**: converte vídeo de câmeras antigas (MOD, MTS, AVI, VOB, WMV…) para MP4 | não, nunca |

Nenhum dos dois envia arquivo para servidor nenhum.

---

## App web

Abra o `index.html` no navegador — não precisa instalar nada, não precisa de build.
Para testar com service worker (modo offline), suba um servidor local:

```bash
npm start          # http://localhost:8080
```

### Conversões disponíveis

**Documentos**

| De → Para | Detalhes |
| --- | --- |
| TXT → PDF | fonte, tamanho, A4/Carta/A5, retrato/paisagem, numeração de página |
| MD → PDF | títulos, listas, blocos de código e citações formatados |
| PDF → TXT | preserva quebras de linha, aceita intervalo de páginas (`1-3,7`) |
| PDF → IMG | rasteriza páginas em PNG / JPG / WEBP em 1x, 2x ou 3x |
| PDFs → PDF | junta vários PDFs na ordem da fila |
| PDF → PDFs | separa página a página ou extrai um intervalo |
| PDF → PDF | gira páginas 90° / 180° / 270° |
| MD → HTML | tabelas, código, listas aninhadas, citações; com ou sem CSS |
| HTML → TXT | remove scripts/estilos e opcionalmente mantém as URLs |
| HTML → MD | volta para Markdown, inclusive tabelas |
| TXT/MD → DOCX | gera um `.docx` que abre no Word, Pages e LibreOffice |

**Dados e planilhas**

| De → Para | Detalhes |
| --- | --- |
| CSV → JSON | parser RFC 4180 (aspas, `""`, quebra de linha no campo), detecta o separador |
| JSON → CSV | achata objetos aninhados em `endereco.cidade` |
| JSON ↔ YAML | ida sem dependência; volta com js-yaml (aceita multi-documento) |
| JSON ↔ XML | atributos viram `@atributo` |
| CSV/JSON → XLSX | planilha real do Excel |
| XLSX → CSV / JSON | `.xlsx`, `.xls`, `.ods`; uma aba ou todas |
| CSV → MD | tabela Markdown pronta pra colar no GitHub |
| JSON → SQL | `INSERT`s com aspas escapadas e `CREATE TABLE` opcional |
| JSON → JSON | formata, minifica, ordena chaves e valida |

**Imagens**

| De → Para | Detalhes |
| --- | --- |
| IMG → IMG | converte entre PNG/JPG/WEBP, redimensiona e comprime |
| IMG → PDF | várias imagens viram um PDF, uma por página |
| SVG → PNG | rasteriza na largura escolhida |
| IMG → ICO | favicon com 16/32/48/64/128/256 embutidos |
| Arquivo ↔ Base64 | Data URL, string pura ou regra CSS pronta |

**Texto e utilidades**

| De → Para | Detalhes |
| --- | --- |
| SRT ↔ VTT | legendas, com renumeração automática |
| TXT → TXT | MAIÚSCULA, minúscula, Título, camelCase, snake_case, kebab-case, slug |
| TXT → relatório | contagem de palavras/linhas/parágrafos e ranking de palavras |
| Arquivo → hash | SHA-1, SHA-256 e SHA-512 |
| Arquivos → ZIP | compacta a fila inteira |

### Recursos da interface

- **busca** (tecla <kbd>/</kbd>) e filtro por categoria
- **fila de arquivos**: converte vários de uma vez e baixa tudo num `.zip`
- **arrastar e soltar** em qualquer lugar da página
- **link direto** para cada conversão (`index.html#csv2json`)
- **tema claro/escuro** que respeita a preferência do sistema e fica salvo
- **histórico** das conversões usadas recentemente
- <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>Enter</kbd> converte
- **offline** depois da primeira visita (service worker)

### Como está organizado

```
index.html               casca da página
assets/css/style.css     estilos (tema claro e escuro)
assets/js/formats.js     conversões puras, sem DOM — é o que os testes cobrem
assets/js/vendor.js      carrega jsPDF, PDF.js, SheetJS… sob demanda, com CDN reserva
assets/js/converters.js  registro dos conversores
assets/js/app.js         interface
sw.js                    service worker (cache do app e das bibliotecas)
tools/serve.mjs          servidor estático sem dependências
tests/                   testes com node:test
samples/                 arquivos de exemplo para testar
```

As bibliotecas pesadas **não** são baixadas ao abrir a página: cada conversor pede a
sua na hora de rodar (`await lib('jspdf')`), e o service worker guarda em cache.
Conversões de texto, CSV, JSON, YAML (ida), legendas e imagem funcionam sem
nenhuma biblioteca externa.

### Testes

```bash
npm test
```

33 testes cobrem parser CSV, ida e volta CSV↔JSON, YAML, XML, SQL, Markdown,
legendas, caixa de texto e os utilitários. Rodam em Node puro, sem instalar nada.

### Adicionando um conversor

Basta acrescentar um objeto em `assets/js/converters.js` — a interface se monta sozinha:

```js
{
  id: 'meu2formato',
  from: 'MEU', to: 'FORMATO',
  cat: 'dados',                         // docs | dados | img | texto
  icon: '🧪',
  desc: 'o que ele faz, em uma linha',
  accept: '.meu,text/plain',
  multiple: true,                       // aceita vários arquivos
  options: [
    { id: 'sep', label: 'separador', type: 'select', value: ',',
      options: [{ value: ',', label: 'Vírgula' }] }
  ],
  async run(file, opts, ctx) {
    const texto = await file.text();
    ctx.progress(50);
    return { name: CONVRT.formats.rename(file.name, 'formato'),
             blob: new Blob([texto]), text: texto, kind: 'text' };
  }
}
```

Se a lógica for pura (string entra, string sai), escreva em `assets/js/formats.js`
e cubra com teste — é o combinado do projeto.

### Limitações honestas

- PDFs gerados usam as fontes padrão (Helvetica/Times/Courier), que só cobrem
  Latin-1. Caracteres como `→`, `—` e `…` são transliterados (`->`, `--`, `...`);
  emoji e ideogramas viram `?`. Acentuação do português funciona normalmente.
- `PDF → TXT` extrai o texto embutido no arquivo. PDF que é foto de página
  escaneada não tem texto — precisaria de OCR, que o app não faz.
- Arquivos gigantes (centenas de MB) dependem da memória da aba do navegador.
- **Vídeo não é convertido aqui** — para isso existe o app de macOS abaixo.

---

## App de macOS para vídeo

O app web não converte vídeo: fazer isso no navegador exigiria baixar dezenas de
megabytes de WebAssembly e ainda assim falharia com formatos de câmera antiga.

Em [`macos/`](macos/) existe um app nativo em SwiftUI que converte **MOD, TOD, MTS,
M2TS, AVI, VOB, MPG, WMV, 3GP, DV, RM, FLV, MOV** e outros para **MP4 (H.264/H.265)**,
com desentrelaçamento, correção de proporção e presets prontos. Roda 100% offline.

Instruções de build no [`macos/README.md`](macos/README.md). Se você nunca usou o
Xcode, comece pelo [`macos/PASSO-A-PASSO.md`](macos/PASSO-A-PASSO.md) — é um guia
do zero, só com Finder e Xcode, sem Terminal.

**Atenção:** o app do Mac usa apenas os arquivos dentro de `macos/`. O
`index.html`, o `assets/css/style.css` e as imagens da raiz são do app web e não
entram no projeto do Xcode.

---

## Licença

MIT — veja [LICENSE](LICENSE).
