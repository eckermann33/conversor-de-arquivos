# Passo a passo, do zero e sem Terminal

Guia para montar o app no seu Mac usando só o Finder, o Safari e o Xcode.
Leva uns 30 minutos, sendo que quase tudo é o Xcode baixando.

> Se em algum momento você topar com o Terminal e não quiser, pule para a
> seção **Sem Terminal em nenhum momento** lá no fim — tem alternativa pra tudo.

---

## Antes de começar: o que é o quê

O ZIP do projeto tem **dois programas diferentes** na mesma pasta:

```
conversor-de-arquivos/
├── index.html          ┐
├── assets/             │ APP WEB — abre no navegador, converte
│   ├── css/style.css   │ PDF, CSV, JSON, imagens…
│   └── icons/…         │ Não tem nada a ver com o app do Mac.
├── samples/            ┘
│
└── macos/              ← APP DO MAC (é só disso que você precisa aqui)
    ├── ConvrtVideo/
    └── scripts/
```

O `style.css`, o `index.html` e a imagem que você viu são do **app web**. O app
do Mac não usa nenhum deles: ele é feito só dos arquivos `.swift` dentro de
`macos/ConvrtVideo/`, e já tem o ícone próprio dele
(`macos/ConvrtVideo/Resources/AppIcon-1024.png`).

Para abrir o app web: dê dois cliques no `index.html`. Só isso.

---

## Passo 1 — Instalar o Xcode

1. Abra a **App Store** (o ícone azul com o "A")
2. Busque por **Xcode** e clique em **Obter** / **Instalar** (é gratuito)
3. São uns 7 GB, então vai demorar. Pode ir fazendo o passo 2 enquanto baixa
4. Quando terminar, abra o Xcode uma vez e aceite os termos que ele pede

---

## Passo 2 — Baixar os arquivos

1. Abra este link no Safari:
   <https://github.com/eckermann33/conversor-de-arquivos/archive/refs/heads/claude/epic-euler-6qzwgv.zip>
2. O Safari baixa e já descompacta sozinho (se não descompactar, dê dois cliques no `.zip`)
3. Vai aparecer em **Downloads** uma pasta com nome comprido, tipo
   `conversor-de-arquivos-claude-epic-euler-6qzwgv`
4. Arraste essa pasta para a **Mesa** (Desktop) e renomeie para `convrt`, só
   para ficar fácil de achar

---

## Passo 3 — Baixar o ffmpeg (o motor da conversão)

O app não converte sozinho: ele usa um programa chamado **ffmpeg**, que é quem
sabe abrir MOD, MTS, VOB e companhia. Ele não vem no Mac, então precisa baixar.

O ffmpeg não é um app normal com instalador — é um **arquivo único, sem
extensão**, que o nosso app chama por baixo dos panos. Por isso o processo é
meio esquisito. Vamos com calma.

### 3.1 — Descubra qual é o seu Mac

1. Clique no **🍎 (maçã)** no canto superior esquerdo
2. **Sobre Este Mac**
3. Olhe a linha **Chip** (ou **Processador**):
   - diz **Apple M1 / M2 / M3 / M4** → seu Mac é **Apple Silicon**
   - diz **Intel** → seu Mac é **Intel**

Anote, porque muda qual arquivo baixar.

### 3.2 — Baixe o ffmpeg e o ffprobe

São **dois arquivos**: o `ffmpeg` (converte) e o `ffprobe` (lê as informações do
vídeo). Baixe os dois.

**Se seu Mac é Apple Silicon (M1/M2/M3/M4) — recomendado:**

Abra <https://ffmpeg.martin-riedl.de/> no Safari. Na coluna **macOS**, seção
**arm64**, baixe o **ffmpeg** e o **ffprobe** (botão "Download" de cada um).
São builds nativas, mais rápidas.

**Se seu Mac é Intel, ou se o site acima não abrir:**

Clique nestes dois links, um de cada vez:

- ffmpeg: <https://evermeet.cx/ffmpeg/getrelease/ffmpeg/zip>
- ffprobe: <https://evermeet.cx/ffmpeg/getrelease/ffprobe/zip>

O Safari baixa um `.zip` de cada. Essas versões são para Intel — funcionam
também em Mac Apple Silicon, só que mais devagar (o macOS traduz na hora, e
pode pedir para instalar o **Rosetta**; se pedir, aceite e espere terminar).

> Se aparecer um arquivo `.7z` em vez de `.zip`, você pegou o link errado — o
> macOS não abre `.7z` sozinho. Volte e use os links de `zip` acima.

### 3.3 — Descompacte

1. Abra a pasta **Transferências** (Downloads) no Finder
2. Se o Safari já descompactou, você verá dois arquivos chamados **`ffmpeg`** e
   **`ffprobe`**, sem extensão nenhuma, com ícone de folha em branco ou de
   executável — é isso mesmo, não tem ícone bonito
3. Se ainda estiverem como `.zip`, dê **dois cliques** em cada um

Confira o tamanho: cada um tem entre 40 e 80 MB. Se estiver com poucos KB,
o download falhou — baixe de novo.

### 3.4 — Guarde num lugar fixo

Os arquivos não podem ficar em Transferências, senão qualquer limpeza apaga e o
app para de funcionar.

1. No Finder, abra a pasta do projeto: `convrt` → `macos` → `ConvrtVideo` → **`Resources`**
2. **Arraste** os dois arquivos (`ffmpeg` e `ffprobe`) para dentro dela

Pode ser qualquer pasta, na verdade — só precisa ser uma que você não vá apagar.
Uso a `Resources` porque deixa tudo do projeto junto.

### 3.5 — O macOS vai reclamar (e isso é esperado)

Como os arquivos vieram da internet e não são assinados pela Apple, o macOS
bloqueia na primeira execução. Você **não precisa** resolver isso agora — o app
te avisa na hora certa, no passo 7, com um botão que leva direto ao lugar.

Se quiser adiantar: **Ajustes do Sistema → Privacidade e Segurança**, role até
o fim, e se houver uma mensagem sobre o `ffmpeg` clique em **Abrir Mesmo Assim**.

---

## Passo 4 — Criar o projeto no Xcode

1. Abra o **Xcode**
2. Na tela inicial, clique em **Create New Project…**
   (ou menu **File → New → Project…**)
3. Na barra de cima escolha **macOS**, selecione **App** e clique em **Next**
4. Preencha:
   - **Product Name:** `ConvrtVideo` *(exatamente assim, sem espaço nem acento)*
   - **Team:** pode deixar **None**
   - **Organization Identifier:** `com.convrt`
   - **Interface:** **SwiftUI**
   - **Language:** **Swift**
   - **Storage:** **None** (se aparecer essa opção)
   - deixe desmarcado "Include Tests"
5. **Next**, escolha salvar na **Mesa**, e **Create**

> Deu outro nome ao projeto? Tudo bem, funciona igual — só lembre que daí em
> diante, onde este guia disser `ConvrtVideo`, leia o nome que você usou. O app
> vai aparecer com esse nome no Dock; para trocar depois, é a aba **General** do
> target, campo **Display Name**.

O Xcode abre o projeto com uma janela cheia de painéis. A coluna da esquerda é
o **navegador de arquivos** — é com ela que vamos trabalhar.

---

## Passo 5 — Trocar os arquivos de exemplo pelos do app

O Xcode criou dois arquivos de exemplo. Vamos apagar e colocar os nossos.

**5a. Apagar os de exemplo**

1. Na coluna da esquerda, clique em **`ContentView.swift`**
2. Segure **⌘** e clique também no arquivo terminado em **`App.swift`**
3. Aperte **Delete** e escolha **Move to Trash**

> **Se você deu outro nome ao projeto** (`myapp`, por exemplo), o segundo arquivo
> se chama `myappApp.swift`. Apague esse mesmo. Não tem problema o projeto ter
> outro nome — só não pule esta parte: se sobrar o arquivo do Xcode junto com o
> nosso, a compilação falha com `'main' attribute can only apply to one type in
> a module` (dois arquivos disputando ser o início do app) ou
> `Invalid redeclaration of 'ContentView'` (duas telas com o mesmo nome).

**5b. Trazer os nossos**

1. Abra o **Finder** e vá até `convrt/macos/ConvrtVideo/`
2. Selecione **quatro itens** ao mesmo tempo (⌘ + clique):
   - o arquivo `ConvrtVideoApp.swift`
   - a pasta `Models`
   - a pasta `Services`
   - a pasta `Views`
3. **Arraste os quatro** para a coluna da esquerda do Xcode, soltando em cima
   da pasta amarela `ConvrtVideo`
4. Vai abrir uma janelinha. Confira estas três coisas — **é aqui que dá errado
   se passar batido**:
   - ☑️ **Copy items if needed** — marcado
   - 🔘 **Create groups** — selecionado (e *não* "Create folder references")
   - ☑️ o **target** em **Add to targets** — marcado. Ele tem o nome que você
     deu ao projeto no passo 4: se você chamou de `myapp`, marque `myapp`
5. Clique em **Finish**

**5c. Conferir que deu certo**

Na coluna da esquerda você deve ver as pastas `Models`, `Services` e `Views`
com o ícone de **pasta amarela**. Se estiverem **azuis**, apague e refaça o 5b
escolhendo "Create groups".

Contando, têm que ser **11 arquivos `.swift`** no total.

---

## Passo 6 — Duas configurações obrigatórias

**6a. Desligar a caixa de areia (App Sandbox)**

Sem isso o app não consegue chamar o ffmpeg, e nada converte.

1. Clique no ícone azul **ConvrtVideo** lá no topo da coluna da esquerda
2. No meio da tela, selecione o TARGET **ConvrtVideo** (embaixo de "TARGETS")
3. Abra a aba **Signing & Capabilities**
4. Ache o quadro **App Sandbox** e clique no **×** no canto dele para remover
   - se não existir esse quadro, ótimo, já está do jeito que precisa

**6b. Colocar o ícone (opcional, mas fica bonito)**

1. Na coluna da esquerda, clique em **Assets** (ou `Assets.xcassets`)
2. Clique em **AppIcon**
3. No Finder, abra `convrt/macos/ConvrtVideo/Resources/`
4. Arraste o arquivo **`AppIcon-1024.png`** para o quadrado maior (1024) que
   apareceu no Xcode

---

## Passo 7 — Rodar

1. Aperte **⌘R** (ou o botão ▶︎ no topo)
2. Primeira vez demora um pouco: o Xcode está compilando
3. O app abre. Como ele ainda não sabe onde está o ffmpeg, vai aparecer a tela
   **"Falta o motor de conversão"**
4. Clique em **"Escolher o arquivo ffmpeg…"**
5. Navegue até `convrt/macos/ConvrtVideo/Resources/` e escolha o arquivo
   **`ffmpeg`** (o que você baixou no passo 3)
   - dica: se não estiver enxergando a pasta, aperte **⌘⇧G** e cole o caminho
6. A bolinha lá embaixo fica **verde** e aparece a versão do ffmpeg

**Se aparecer um aviso laranja no lugar da bolinha verde**, o app te diz o que
houve. Os dois casos comuns:

*"O macOS está bloqueando esse arquivo porque ele veio da internet"*
1. Clique no botão **Abrir Ajustes do Sistema** que aparece junto do aviso
2. Em **Privacidade e Segurança**, role até o fim
3. Clique em **Abrir Mesmo Assim** na mensagem sobre o `ffmpeg`
4. Volte no app e clique em **Verificar de novo**

*"Esse arquivo não roda neste Mac"*
→ Você baixou a versão da arquitetura errada. Volte ao passo 3.1 e confira se
seu Mac é Apple Silicon ou Intel.

O app corrige sozinho a permissão de execução do arquivo, então esse problema
você não vai ver.

---

## Passo 8 — Converter

1. Arraste seus vídeos (ou uma pasta inteira) para a janela do app
2. À direita, deixe **Compatibilidade máxima** se estiver na dúvida
3. Clique em **Converter tudo**
4. Os MP4 aparecem na mesma pasta dos originais. Os originais **não são
   apagados nem sobrescritos**

Para material de câmera antiga, mantenha ligados *Desentrelaçar: automático* e
*Corrigir proporção esticada* — são eles que tiram as listras horizontais e
consertam a imagem espremida.

---

## Passo 9 — Deixar o app instalado de verdade

Enquanto você roda pelo Xcode, o app só existe enquanto o Xcode está aberto.
Para ter ele na pasta Aplicativos:

1. No Xcode, menu **Product → Archive**… ou, mais simples:
2. Na coluna da esquerda, abra **Products** e clique com o botão direito em
   **ConvrtVideo.app** → **Show in Finder**
3. Arraste o `ConvrtVideo.app` que aparecer para a pasta **Aplicativos**

Pronto: dois cliques e ele abre como qualquer outro app.

---

## Sem Terminal em nenhum momento

Tudo acima é Finder + Xcode. Só três pontos costumam empurrar as pessoas para
o Terminal, e aqui está a alternativa de cada um:

| Situação | Alternativa sem Terminal |
| --- | --- |
| Instalar o ffmpeg com `brew install` | Baixar o executável pronto do evermeet.cx (passo 3) e apontar pelo botão do app |
| macOS bloqueia o ffmpeg baixado | Botão **Abrir Ajustes do Sistema** dentro do próprio app → **Abrir Mesmo Assim** |
| `chmod +x` para dar permissão ao ffmpeg | O app faz isso sozinho quando você escolhe o arquivo |
| Baixar o projeto com `git clone` | Link do ZIP no passo 2 |

---

## Se algo der errado

**"Cannot find 'ConversionQueue' in scope"** (ou qualquer outro nome)
→ Faltou marcar o target no passo 5b. Clique no projeto → target **ConvrtVideo**
→ aba **Build Phases** → **Compile Sources**: precisa ter 11 arquivos. Se
faltar, clique no **+** e adicione.

**O app abre mas o botão "Converter tudo" fica apagado**
→ Ou não tem vídeo na fila, ou o ffmpeg não foi encontrado (bolinha laranja
embaixo). Refaça o passo 7.

**"O ffmpeg terminou com erro"** em um vídeo específico
→ Tente o preset **Compatibilidade máxima**. Se continuar, o arquivo pode estar
corrompido — abra ele no QuickTime para conferir.

**Converteu, mas a imagem está com listras horizontais**
→ Ligue *Desentrelaçar: sempre* e converta de novo.

**Converteu, mas a imagem está espremida ou esticada**
→ Confirme que *Corrigir proporção esticada* está ligado.
