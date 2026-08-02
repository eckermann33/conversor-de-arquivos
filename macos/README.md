# CONVRT Vídeo — app de macOS

App nativo (SwiftUI) que converte vídeo de câmera antiga para MP4. Roda offline,
não fala com servidor nenhum, e o arquivo original nunca é apagado.

![sem screenshot ainda — o app abre com uma área de arrastar e soltar à esquerda e os ajustes à direita]

## O que ele converte

Formatos que os camcorders e celulares antigos gravavam e que hoje quase nada abre:

| Origem | Onde aparece |
| --- | --- |
| `.MOD`, `.TOD`, `.VRO` | camcorder JVC/Panasonic/Canon de HDD e DVD |
| `.MTS`, `.M2TS`, `.M2T` | AVCHD (Sony, Panasonic, Canon HD) |
| `.VOB`, `.MPG`, `.MPEG`, `.M2V` | DVD e camcorder de DVD |
| `.DV`, `.DIF`, `.AVI` | MiniDV, câmeras digitais dos anos 2000 |
| `.3GP`, `.3G2`, `.AMV` | celular antigo |
| `.WMV`, `.ASF`, `.RM`, `.RMVB`, `.FLV` | vídeo de PC e web antigos |
| `.MKV`, `.WEBM`, `.MOV`, `.MP4`, `.MXF` | formatos atuais (recomprimir/normalizar) |

Saída: **MP4 (H.264 ou H.265) + áudio AAC**, com `faststart`.

## Por que não dá pra fazer isso no app web

Converter vídeo no navegador exigiria carregar o ffmpeg compilado em WebAssembly
(dezenas de MB), que é várias vezes mais lento, não usa aceleração de hardware e
não abre boa parte dos formatos antigos. Nativo é a ferramenta certa aqui.

## Recursos

- **fila em lote**: arraste uma pasta inteira; converte um vídeo por vez (o ffmpeg
  já usa todos os núcleos) com progresso real por arquivo
- **desentrelaçamento automático** — detecta pelo `field_order` do arquivo. É o que
  tira as listras horizontais típicas de MiniDV/AVCHD em cenas com movimento
- **correção de proporção** — conserta o vídeo espremido/esticado de origens com
  pixel não quadrado (DV 4:3, VOB)
- **presets**: compatibilidade máxima, melhor qualidade, menor arquivo (H.265),
  rápido por GPU (VideoToolbox) e "só trocar o invólucro" (sem recodificar)
- **rotação**, limite de resolução, CRF ajustável, taxa do áudio
- **mantém a data de gravação original** (senão o Fotos/Finder joga tudo pra hoje)
- **mostra o comando ffmpeg** que será executado — nada de caixa-preta
- nunca sobrescreve: se já existir um `ferias.mp4`, gera `ferias-2.mp4`

## Instalação

### 1. O motor: ffmpeg

O app usa o `ffmpeg` para decodificar. Três caminhos, em ordem de simplicidade:

```bash
brew install ffmpeg                    # o app acha sozinho depois disso
```

```bash
./scripts/fetch-ffmpeg.sh              # embute uma cópia dentro do app
./scripts/fetch-ffmpeg.sh --do-sistema # copia o que já está instalado
```

Ou aponte o caminho manualmente na própria tela do app.

### 2. Compilar

**Com XcodeGen (recomendado):**

```bash
brew install xcodegen
./scripts/build.sh --abrir     # gera o .xcodeproj e abre no Xcode (⌘R para rodar)
./scripts/build.sh             # ou compila direto em build/ConvrtVideo.app
```

**Sem instalar nada além das ferramentas de linha de comando:**

```bash
./scripts/build-sem-xcode.sh --abrir
```

**Direto no Xcode, sem scripts:** crie um novo projeto macOS App (SwiftUI,
Swift, deployment target 13.0), apague o `ContentView.swift` e o
`<Nome>App.swift` que o Xcode cria, arraste a pasta `ConvrtVideo/` para dentro do
projeto e, em *Signing & Capabilities*, remova o **App Sandbox** — sem isso o app
não consegue executar o ffmpeg.

## Como usar

1. Arraste os vídeos (ou uma pasta) para a janela
2. Escolha o preset à direita — se estiver em dúvida, deixe em *Compatibilidade máxima*
3. **Converter tudo** (⌘Return)
4. Quando terminar, o botão da pasta abre o arquivo no Finder

Dica para material antigo: mantenha *Desentrelaçar: automático* e *Corrigir
proporção* ligados. São eles que transformam um MTS de 2007 num MP4 que parece
normal no iPhone.

## Estrutura do código

```
ConvrtVideo/
  ConvrtVideoApp.swift          entrada do app, menus e painéis de arquivo
  Models/
    MediaInfo.swift             o que o ffprobe descobriu do arquivo
    ConversionSettings.swift    presets e a montagem dos argumentos do ffmpeg
    VideoJob.swift              um item da fila
  Services/
    FFmpegLocator.swift         acha o ffmpeg (bundle > escolha do usuário > Homebrew)
    FFmpegRunner.swift          executa e lê o progresso de `-progress pipe:1`
    ConversionQueue.swift       orquestra a fila
  Views/
    ContentView.swift           janela principal e arrastar-e-soltar
    LinhaDoVideo.swift          linha da fila
    PainelDeAjustes.swift       painel lateral de opções
    TelaDeInstalacao.swift      tela que aparece quando falta o ffmpeg
```

A lógica que decide *o que* o ffmpeg vai fazer está toda em
`ConversionSettings.filtros(para:)` e `.argumentos(entrada:saida:info:)` — é lá que
se mexe para ajustar a conversão.

## Sobre a caixa de areia (App Sandbox)

O app roda com sandbox **desligada**, porque a caixa de areia do macOS impede um
app de executar binários de fora do bundle (o `ffmpeg` do Homebrew). Isso é
aceitável para um app pessoal compilado por você. Se um dia quiser publicar na
App Store, seria preciso embutir o ffmpeg no bundle e reativar a sandbox — e aí
entra também a questão de licença GPL dos codecs.

## Estado deste código

Escrito e revisado linha a linha, mas **não compilado**: foi produzido num
ambiente Linux, sem Xcode nem SDK da Apple. Se o compilador reclamar de alguma
coisa na primeira build, deve ser algo pontual (um import, uma assinatura de API),
não a estrutura. O app web na raiz do repositório, esse sim, foi testado de ponta
a ponta num navegador real.

## Licença

MIT, igual ao resto do repositório. O ffmpeg tem licença própria (LGPL/GPL
conforme a build) — veja https://ffmpeg.org/legal.html
