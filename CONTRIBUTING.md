# Como contribuir

## Rodando o projeto

```bash
npm start     # servidor local em http://localhost:8080
npm test      # testes (node:test, sem dependências)
```

Não existe build: o app web é HTML, CSS e JavaScript servidos direto.

## Regras do projeto

1. **Lógica pura vai em `assets/js/formats.js`.** Se a função recebe string e
   devolve string, ela não pode tocar no DOM — assim continua testável no Node.
2. **Todo comportamento novo em `formats.js` vem com teste** em `tests/`.
3. **Bibliotecas externas entram por `assets/js/vendor.js`**, sempre com duas
   URLs (jsDelivr e cdnjs) e carregamento sob demanda. Nada de `<script>` novo
   no `index.html`.
4. **Nenhum arquivo do usuário sai do navegador.** Nada de upload, telemetria
   ou analytics — é a única promessa que o app faz.
5. Textos da interface em português, código e nomes de variáveis também.

## Adicionando um conversor

Veja o exemplo no [README](README.md#adicionando-um-conversor). Um conversor é um
objeto no array de `assets/js/converters.js`; a interface (card, opções, fila,
progresso, download) é montada sozinha a partir dele.

Antes de abrir o PR:

- [ ] `npm test` passando
- [ ] testado no navegador com um arquivo real de `samples/`
- [ ] descrição do card curta e em português
- [ ] se a conversão precisa de biblioteca, ela é carregada sob demanda

## App de macOS

O código Swift fica em `macos/`. Veja `macos/README.md` para build e teste.
Regra equivalente: o app não faz requisição de rede, e o ffmpeg vem do bundle
ou do sistema do usuário.
