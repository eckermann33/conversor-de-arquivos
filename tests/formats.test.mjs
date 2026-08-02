/**
 * Testes das funções puras de conversão.
 * Rodar com: npm test   (node --test tests/)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const F = require('../assets/js/formats.js');

// ── CSV ────────────────────────────────────────────────────────────────
test('parseCsv respeita aspas, vírgulas internas e aspas escapadas', () => {
  const csv = 'nome,obs\n"Silva, João","disse ""oi"""\nMaria,simples';
  assert.deepEqual(F.parseCsv(csv, ','), [
    ['nome', 'obs'],
    ['Silva, João', 'disse "oi"'],
    ['Maria', 'simples']
  ]);
});

test('parseCsv aceita quebra de linha dentro do campo e CRLF', () => {
  const csv = 'a,b\r\n"linha1\nlinha2",x\r\n';
  assert.deepEqual(F.parseCsv(csv, ','), [['a', 'b'], ['linha1\nlinha2', 'x']]);
});

test('parseCsv ignora BOM no começo do arquivo', () => {
  assert.deepEqual(F.parseCsv('﻿a,b\n1,2', ','), [['a', 'b'], ['1', '2']]);
});

test('detectSeparator identifica ; e tab', () => {
  assert.equal(F.detectSeparator('a;b;c\n1;2;3'), ';');
  assert.equal(F.detectSeparator('a\tb\tc'), '\t');
  assert.equal(F.detectSeparator('a,b,c'), ',');
});

test('csvToJson converte tipos e mantém strings quando pedido', () => {
  const csv = 'nome,idade,ativo,nota\nAna,30,true,4.5';
  assert.deepEqual(F.csvToJson(csv), [{ nome: 'Ana', idade: 30, ativo: true, nota: 4.5 }]);
  assert.deepEqual(F.csvToJson(csv, { autoType: false }), [
    { nome: 'Ana', idade: '30', ativo: 'true', nota: '4.5' }
  ]);
});

test('csvToJson gera nomes para colunas vazias ou repetidas', () => {
  const data = F.csvToJson('a,,a\n1,2,3', { sep: ',' });
  assert.deepEqual(Object.keys(data[0]), ['a', 'coluna_2', 'a_2']);
});

test('jsonToCsv achata objetos aninhados e escapa o separador', () => {
  const json = [{ nome: 'Ana; Maria', end: { cidade: 'SP' }, tags: ['a', 'b'] }];
  const csv = F.jsonToCsv(json, { sep: ';' });
  assert.equal(csv.split('\n')[0], 'nome;end.cidade;tags');
  assert.equal(csv.split('\n')[1], '"Ana; Maria";SP;"a; b"');
});

test('jsonToCsv aceita objeto único e objeto com array dentro', () => {
  assert.equal(F.jsonToCsv({ a: 1, b: 2 }), 'a,b\n1,2');
  assert.equal(F.jsonToCsv({ itens: [{ a: 1 }, { a: 2 }] }), 'a\n1\n2');
});

test('ida e volta CSV -> JSON -> CSV preserva os dados', () => {
  const original = 'nome,cidade\n"Silva, J",SP\nAna,RJ';
  const roundTrip = F.jsonToCsv(F.csvToJson(original, { sep: ',' }), { sep: ',' });
  assert.equal(roundTrip, original);
});

test('csvToMarkdown monta tabela com cabeçalho e separador', () => {
  const md = F.csvToMarkdown('a,b\n1,2');
  assert.equal(md, '| a | b |\n| --- | --- |\n| 1 | 2 |');
});

// ── YAML / XML / SQL ───────────────────────────────────────────────────
test('jsonToYaml gera escalares, listas e objetos aninhados', () => {
  const yaml = F.jsonToYaml({ nome: 'Ana', ativo: true, tags: ['x', 'y'], end: { cidade: 'SP' } });
  assert.equal(yaml, [
    'nome: Ana',
    'ativo: true',
    'tags:',
    '  - x',
    '  - y',
    'end:',
    '  cidade: SP'
  ].join('\n'));
});

test('jsonToYaml protege strings ambíguas com aspas', () => {
  assert.match(F.jsonToYaml({ v: 'true' }), /v: 'true'/);
  assert.match(F.jsonToYaml({ v: '123' }), /v: '123'/);
  assert.match(F.jsonToYaml({ v: '' }), /v: ''/);
  assert.match(F.jsonToYaml({ v: [] }), /v: \[\]/);
});

test('jsonToXml escapa conteúdo e trata arrays', () => {
  const xml = F.jsonToXml({ itens: ['a', 'b & c'] }, 'root');
  assert.match(xml, /<itens>/);
  assert.match(xml, /<item>a<\/item>/);
  assert.match(xml, /b &amp; c/);
});

test('jsonToSql escapa aspas simples e trata nulos', () => {
  const sql = F.jsonToSql([{ nome: "O'Brien", idade: 30, obs: null }], { table: 'pessoas' });
  assert.match(sql, /INSERT INTO "pessoas"/);
  assert.match(sql, /'O''Brien'/);
  assert.match(sql, /NULL/);
});

test('jsonToSql pode incluir o CREATE TABLE', () => {
  const sql = F.jsonToSql([{ a: 1 }], { table: 'x', createTable: true });
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "x"/);
});

// ── Markdown ───────────────────────────────────────────────────────────
test('markdownToHtml converte títulos, ênfase e código inline', () => {
  const html = F.markdownToHtml('# Título\n\ntexto **forte**, *leve* e `código`');
  assert.match(html, /<h1>Título<\/h1>/);
  assert.match(html, /<strong>forte<\/strong>/);
  assert.match(html, /<em>leve<\/em>/);
  assert.match(html, /<code>código<\/code>/);
});

test('markdownToHtml preserva bloco de código sem interpretar markdown', () => {
  const html = F.markdownToHtml('```js\nconst a = **x**;\n```');
  assert.match(html, /<pre><code class="language-js">/);
  assert.match(html, /const a = \*\*x\*\*;/);
  assert.doesNotMatch(html, /<strong>/);
});

test('markdownToHtml monta listas, tabelas e citações', () => {
  assert.match(F.markdownToHtml('- um\n- dois'), /<ul>\n<li>um<\/li>\n<li>dois<\/li>\n<\/ul>/);
  assert.match(F.markdownToHtml('1. um\n2. dois'), /<ol>/);
  assert.match(F.markdownToHtml('> citado'), /<blockquote>/);
  const table = F.markdownToHtml('| a | b |\n| --- | ---: |\n| 1 | 2 |');
  assert.match(table, /<table>/);
  assert.match(table, /<th>a<\/th>/);
  assert.match(table, /text-align:right/);
});

test('markdownToHtml escapa HTML e bloqueia javascript: em links', () => {
  const html = F.markdownToHtml('<script>alert(1)</script>\n\n[x](javascript:alert(1))');
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /href="#"/);
});

test('htmlDocument embrulha o corpo numa página válida', () => {
  const page = F.htmlDocument('Meu doc', '<p>oi</p>');
  assert.match(page, /^<!DOCTYPE html>/);
  assert.match(page, /<title>Meu doc<\/title>/);
  assert.match(page, /<p>oi<\/p>/);
});

// ── legendas ───────────────────────────────────────────────────────────
const SRT = '1\n00:00:01,000 --> 00:00:04,500\nPrimeira fala\n\n2\n00:00:05,000 --> 00:00:07,250\nSegunda fala\n';

test('srtToVtt troca vírgula por ponto e adiciona cabeçalho', () => {
  const vtt = F.srtToVtt(SRT);
  assert.match(vtt, /^WEBVTT\n\n/);
  assert.match(vtt, /00:00:01\.000 --> 00:00:04\.500/);
  assert.doesNotMatch(vtt, /,\d{3}/);
});

test('vttToSrt remove cabeçalho, settings e renumera', () => {
  const vtt = 'WEBVTT\n\nNOTE comentário\n\n00:00:01.000 --> 00:00:04.500 align:start\nPrimeira fala\n\n00:00:05.000 --> 00:00:07.250\nSegunda fala\n';
  const srt = F.vttToSrt(vtt);
  assert.match(srt, /^1\n00:00:01,000 --> 00:00:04,500\nPrimeira fala/);
  assert.match(srt, /\n2\n00:00:05,000 --> 00:00:07,250\nSegunda fala/);
  assert.doesNotMatch(srt, /align:start/);
  assert.doesNotMatch(srt, /WEBVTT/);
});

test('SRT -> VTT -> SRT volta ao original', () => {
  assert.equal(F.vttToSrt(F.srtToVtt(SRT)).trim(), SRT.trim());
});

// ── texto ──────────────────────────────────────────────────────────────
test('changeCase cobre os estilos principais', () => {
  assert.equal(F.changeCase('olá mundo cruel', 'upper'), 'OLÁ MUNDO CRUEL');
  assert.equal(F.changeCase('OLÁ MUNDO', 'title'), 'Olá Mundo');
  assert.equal(F.changeCase('olá mundo cruel', 'camel'), 'oláMundoCruel');
  assert.equal(F.changeCase('olá mundo cruel', 'pascal'), 'OláMundoCruel');
  assert.equal(F.changeCase('Olá Mundo', 'snake'), 'olá_mundo');
  assert.equal(F.changeCase('Olá Mundo', 'kebab'), 'olá-mundo');
  assert.equal(F.changeCase('Olá, Mundo Cruel!', 'slug'), 'ola-mundo-cruel');
});

test('changeCase entende camelCase existente ao separar palavras', () => {
  assert.equal(F.changeCase('minhaVariavelLegal', 'kebab'), 'minha-variavel-legal');
});

test('textStats conta caracteres, palavras e parágrafos', () => {
  const stats = F.textStats('uma frase\n\noutra frase aqui');
  assert.equal(stats.palavras, 5);
  assert.equal(stats.paragrafos, 2);
  assert.equal(stats.linhas, 3);
});

// ── JSON / utilidades ──────────────────────────────────────────────────
test('formatJson formata, minifica e ordena chaves', () => {
  assert.equal(F.formatJson('{"b":1,"a":2}', { minify: true }), '{"b":1,"a":2}');
  assert.equal(F.formatJson('{"b":1,"a":2}', { minify: true, sortKeys: true }), '{"a":2,"b":1}');
  assert.match(F.formatJson('{"a":1}'), /\{\n {2}"a": 1\n\}/);
});

test('formatJson estoura erro claro em JSON inválido', () => {
  assert.throws(() => F.formatJson('{ isso não é json }'), SyntaxError);
});

test('rename troca a extensão preservando pontos do nome', () => {
  assert.equal(F.rename('relatorio.final.csv', 'json'), 'relatorio.final.json');
  assert.equal(F.rename('sem-extensao', '.txt'), 'sem-extensao.txt');
});

test('humanSize formata bytes de forma legível', () => {
  assert.equal(F.humanSize(512), '512 B');
  assert.equal(F.humanSize(2048), '2.0 KB');
  assert.equal(F.humanSize(5 * 1048576), '5.0 MB');
});

test('flatten transforma estruturas aninhadas em caminhos com ponto', () => {
  assert.deepEqual(F.flatten({ a: { b: { c: 1 } }, d: [1, 2] }), { 'a.b.c': 1, d: '1; 2' });
});

test('rename sem extensão nova devolve só o nome base', () => {
  assert.equal(F.rename('exemplo.txt', ''), 'exemplo');
  assert.equal(F.rename('relatorio.final.csv', ''), 'relatorio.final');
});

test('pdfSafe traduz caracteres que as fontes padrão do PDF não têm', () => {
  assert.equal(F.pdfSafe('MD → HTML'), 'MD -> HTML');
  assert.equal(F.pdfSafe('travessão — e “aspas” …'), 'travessão -- e "aspas" ...');
  assert.equal(F.pdfSafe('acentuação: ação, coração'), 'acentuação: ação, coração');
  assert.equal(F.pdfSafe('emoji 🎉 e kanji 日'), 'emoji ? e kanji ?');
  assert.equal(F.pdfSafe('quebra\nde\tlinha'), 'quebra\nde\tlinha');
});
