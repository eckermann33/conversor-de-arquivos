/**
 * CONVRT — funções puras de transformação de formatos.
 *
 * Este arquivo não toca no DOM de propósito: ele roda igual no browser
 * (window.CONVRT.formats) e no Node (require), que é o que permite os
 * testes automatizados em tests/formats.test.js.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.CONVRT = root.CONVRT || {}; root.CONVRT.formats = api; }
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  // ── helpers genéricos ────────────────────────────────────────────────
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function humanSize(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB';
    return (n / 1073741824).toFixed(2) + ' GB';
  }

  /** Bloqueia URLs perigosas (javascript:, data:text/html) em links gerados. */
  function safeUrl(url) {
    const u = String(url).trim();
    if (/^\s*javascript:/i.test(u)) return '#';
    if (/^\s*data:text\/html/i.test(u)) return '#';
    return u;
  }

  // ── CSV ──────────────────────────────────────────────────────────────
  /**
   * Parser CSV conforme RFC 4180: aspas, aspas escapadas ("") e quebras de
   * linha dentro do campo. Retorna matriz de strings.
   */
  function parseCsv(text, sep) {
    const s = String(text).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
    const delim = sep || ',';
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    let touched = false;

    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (inQuotes) {
        if (c === '"') {
          if (s[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += c;
        continue;
      }
      if (c === '"') { inQuotes = true; touched = true; continue; }
      if (c === delim) { row.push(field); field = ''; touched = true; continue; }
      if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; touched = false; continue; }
      if (c === '\r') continue;
      field += c; touched = true;
    }
    if (touched || field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  /** Adivinha o separador olhando a primeira linha não vazia. */
  function detectSeparator(text) {
    const line = String(text).replace(/\r/g, '').split('\n').find(l => l.trim()) || '';
    const candidates = [',', ';', '\t', '|'];
    let best = ',';
    let bestCount = 0;
    for (const c of candidates) {
      const count = line.split(c).length - 1;
      if (count > bestCount) { bestCount = count; best = c; }
    }
    return best;
  }

  function coerce(value) {
    const v = String(value).trim();
    if (v === '') return '';
    if (v === 'true') return true;
    if (v === 'false') return false;
    if (v === 'null') return null;
    if (/^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(v) && v.length < 16) return Number(v);
    return value;
  }

  /** Garante cabeçalhos únicos e não vazios. */
  function normalizeHeaders(cells) {
    const seen = new Map();
    return cells.map((h, i) => {
      let name = String(h || '').trim() || 'coluna_' + (i + 1);
      if (seen.has(name)) {
        const n = seen.get(name) + 1;
        seen.set(name, n);
        name = name + '_' + n;
      } else seen.set(name, 1);
      return name;
    });
  }

  function csvToJson(text, opts) {
    const o = opts || {};
    const sep = o.sep || detectSeparator(text);
    const rows = parseCsv(text, sep).filter(r => r.length > 1 || (r[0] || '').trim() !== '');
    if (!rows.length) return [];
    const headers = normalizeHeaders(rows[0]);
    return rows.slice(1).map(cells => {
      const obj = {};
      headers.forEach((h, i) => {
        const raw = cells[i] === undefined ? '' : cells[i];
        obj[h] = o.autoType === false ? raw : coerce(raw);
      });
      return obj;
    });
  }

  /** Achata objetos aninhados: {a:{b:1}} -> {'a.b':1} */
  function flatten(obj, prefix, out) {
    const target = out || {};
    const pre = prefix || '';
    if (obj === null || typeof obj !== 'object') { target[pre || 'valor'] = obj; return target; }
    for (const key of Object.keys(obj)) {
      const value = obj[key];
      const path = pre ? pre + '.' + key : key;
      if (value && typeof value === 'object' && !Array.isArray(value)) flatten(value, path, target);
      else if (Array.isArray(value)) target[path] = value.every(v => v === null || typeof v !== 'object')
        ? value.join('; ')
        : JSON.stringify(value);
      else target[path] = value;
    }
    return target;
  }

  function jsonToCsv(data, opts) {
    const o = opts || {};
    const sep = o.sep || ',';
    let list = data;
    if (!Array.isArray(list)) {
      // aceita {itens:[...]} ou um objeto solto
      const arrayProp = list && typeof list === 'object'
        ? Object.keys(list).find(k => Array.isArray(list[k]))
        : null;
      list = arrayProp ? list[arrayProp] : [list];
    }
    if (!list.length) return '';

    const rows = list.map(item => (item && typeof item === 'object' ? flatten(item) : { valor: item }));
    const headers = [];
    for (const row of rows) for (const k of Object.keys(row)) if (!headers.includes(k)) headers.push(k);

    const esc = value => {
      const s = value === null || value === undefined ? '' : String(value);
      return /["\n\r]/.test(s) || s.includes(sep) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };

    const lines = [headers.map(esc).join(sep)];
    for (const row of rows) lines.push(headers.map(h => esc(row[h])).join(sep));
    return lines.join('\n');
  }

  function csvToMarkdown(text, opts) {
    const o = opts || {};
    const sep = o.sep || detectSeparator(text);
    const rows = parseCsv(text, sep).filter(r => r.some(c => String(c).trim() !== ''));
    if (!rows.length) return '';
    const cell = v => String(v === undefined ? '' : v).replace(/\|/g, '\\|').replace(/\n/g, ' ');
    const width = Math.max(...rows.map(r => r.length));
    const pad = r => Array.from({ length: width }, (_, i) => cell(r[i]));
    const out = ['| ' + pad(rows[0]).join(' | ') + ' |', '| ' + pad(rows[0]).map(() => '---').join(' | ') + ' |'];
    for (const r of rows.slice(1)) out.push('| ' + pad(r).join(' | ') + ' |');
    return out.join('\n');
  }

  // ── YAML (dump) ──────────────────────────────────────────────────────
  function yamlScalar(value) {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'boolean' || typeof value === 'number') return String(value);
    const s = String(value);
    if (s === '') return "''";
    if (s.includes('\n')) return null; // tratado como bloco literal
    const needsQuote = /^[\s>|*&!%@`'"#-]|[:#]\s|\s$|^(true|false|null|yes|no|on|off|~)$/i.test(s)
      || /^-?\d+(\.\d+)?$/.test(s);
    return needsQuote ? "'" + s.replace(/'/g, "''") + "'" : s;
  }

  function jsonToYaml(value, indentLevel) {
    const level = indentLevel || 0;
    const pad = '  '.repeat(level);

    if (Array.isArray(value)) {
      if (!value.length) return pad + '[]';
      return value.map(item => {
        if (item !== null && typeof item === 'object') {
          const block = jsonToYaml(item, level + 1);
          return pad + '- ' + block.slice((level + 1) * 2).replace(/\n {2}/g, '\n' + pad + '  ').trimStart();
        }
        const scalar = yamlScalar(item);
        return pad + '- ' + (scalar === null ? blockString(item, level + 1) : scalar);
      }).join('\n');
    }

    if (value !== null && typeof value === 'object') {
      const keys = Object.keys(value);
      if (!keys.length) return pad + '{}';
      return keys.map(key => {
        const v = value[key];
        const safeKey = /^[\w.-]+$/.test(key) ? key : "'" + key.replace(/'/g, "''") + "'";
        if (v !== null && typeof v === 'object') {
          const isEmpty = Array.isArray(v) ? !v.length : !Object.keys(v).length;
          if (isEmpty) return pad + safeKey + ': ' + (Array.isArray(v) ? '[]' : '{}');
          return pad + safeKey + ':\n' + jsonToYaml(v, level + 1);
        }
        const scalar = yamlScalar(v);
        return pad + safeKey + ': ' + (scalar === null ? blockString(v, level + 1) : scalar);
      }).join('\n');
    }

    const scalar = yamlScalar(value);
    return pad + (scalar === null ? blockString(value, level + 1) : scalar);
  }

  function blockString(value, level) {
    const pad = '  '.repeat(level);
    return '|-\n' + String(value).split('\n').map(l => pad + l).join('\n');
  }

  // ── XML ──────────────────────────────────────────────────────────────
  function xmlName(name) {
    const clean = String(name).replace(/[^\w.-]/g, '_');
    return /^[A-Za-z_]/.test(clean) ? clean : 'item_' + clean;
  }

  function jsonToXml(value, rootName, indentLevel) {
    const root = rootName || 'root';
    const level = indentLevel || 0;
    const pad = '  '.repeat(level);
    const tag = xmlName(root);

    if (Array.isArray(value)) {
      const body = value.map(item => jsonToXml(item, singular(tag), level + 1)).join('\n');
      return pad + '<' + tag + '>\n' + body + '\n' + pad + '</' + tag + '>';
    }
    if (value !== null && typeof value === 'object') {
      const body = Object.keys(value).map(k => jsonToXml(value[k], k, level + 1)).join('\n');
      if (!body) return pad + '<' + tag + '/>';
      return pad + '<' + tag + '>\n' + body + '\n' + pad + '</' + tag + '>';
    }
    if (value === null || value === undefined) return pad + '<' + tag + '/>';
    return pad + '<' + tag + '>' + escapeHtml(String(value)) + '</' + tag + '>';
  }

  function singular(name) {
    if (/ns$/i.test(name)) return name.replace(/ns$/i, 'm');   // itens -> item
    if (/s$/i.test(name)) return name.replace(/s$/i, '');
    return name + '_item';
  }

  /** Identa um XML "achatado" para leitura humana. */
  function prettyXml(xml, indentUnit) {
    const unit = indentUnit || '  ';
    const normalized = String(xml).replace(/>\s*</g, '><').trim();
    const parts = normalized.replace(/></g, '>\n<').split('\n');
    let depth = 0;
    return parts.map(line => {
      if (/^<\/[^>]+>/.test(line)) depth = Math.max(0, depth - 1);
      const out = unit.repeat(depth) + line;
      const isSelfClosing = /\/>$/.test(line) || /^<\?/.test(line) || /^<!/.test(line);
      const isPair = /^<[^!?/][^>]*>[^<]*<\/[^>]+>$/.test(line);
      if (/^<[^!?/]/.test(line) && !isSelfClosing && !isPair) depth++;
      return out;
    }).join('\n');
  }

  // ── SQL ──────────────────────────────────────────────────────────────
  function jsonToSql(data, opts) {
    const o = opts || {};
    const table = xmlName(o.table || 'dados');
    const list = Array.isArray(data) ? data : [data];
    if (!list.length) return '';
    const rows = list.map(item => (item && typeof item === 'object' ? flatten(item) : { valor: item }));
    const columns = [];
    for (const row of rows) for (const k of Object.keys(row)) if (!columns.includes(k)) columns.push(k);

    const lit = value => {
      if (value === null || value === undefined || value === '') return 'NULL';
      if (typeof value === 'number') return String(value);
      if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
      return "'" + String(value).replace(/'/g, "''") + "'";
    };

    const colList = columns.map(c => '"' + xmlName(c) + '"').join(', ');
    const statements = rows.map(row =>
      'INSERT INTO "' + table + '" (' + colList + ') VALUES (' + columns.map(c => lit(row[c])).join(', ') + ');');

    if (o.createTable) {
      const ddl = 'CREATE TABLE IF NOT EXISTS "' + table + '" (\n' +
        columns.map(c => '  "' + xmlName(c) + '" TEXT').join(',\n') + '\n);\n';
      return ddl + '\n' + statements.join('\n') + '\n';
    }
    return statements.join('\n') + '\n';
  }

  // ── Markdown → HTML ──────────────────────────────────────────────────
  function inlineMd(text) {
    let out = escapeHtml(text);
    const codes = [];
    out = out.replace(/`([^`]+)`/g, (_, code) => { codes.push(code); return '\u0000C' + (codes.length - 1) + '\u0000'; });

    out = out
      .replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g,
        (_, alt, src, title) => '<img src="' + safeUrl(src) + '" alt="' + alt + '"' + (title ? ' title="' + title + '"' : '') + '/>')
      .replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g,
        (_, label, href, title) => '<a href="' + safeUrl(href) + '"' + (title ? ' title="' + title + '"' : '') + '>' + label + '</a>')
      .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '<strong>$2</strong>')
      .replace(/(^|[\s(])([*_])(?=\S)([^*_]*?\S)\2/g, '$1<em>$3</em>')
      .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>');

    return out.replace(/\u0000C(\d+)\u0000/g, (_, i) => '<code>' + escapeHtml(codes[Number(i)]) + '</code>');
  }

  function markdownToHtml(md) {
    const lines = String(md).replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    let i = 0;
    const blank = l => /^\s*$/.test(l);
    const isListItem = l => /^\s*([-*+]|\d+[.)])\s+/.test(l);
    const isBreak = l => /^\s*(#{1,6}\s|```|>|(-{3,}|\*{3,}|_{3,})\s*$)/.test(l) || isListItem(l);

    while (i < lines.length) {
      const line = lines[i];
      if (blank(line)) { i++; continue; }

      // bloco de código cercado
      const fence = /^\s*```+\s*(\S+)?/.exec(line);
      if (fence) {
        const lang = fence[1] || '';
        const buf = [];
        i++;
        while (i < lines.length && !/^\s*```/.test(lines[i])) { buf.push(lines[i]); i++; }
        i++;
        out.push('<pre><code' + (lang ? ' class="language-' + escapeHtml(lang) + '"' : '') + '>' +
          escapeHtml(buf.join('\n')) + '</code></pre>');
        continue;
      }

      // linha horizontal
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { out.push('<hr/>'); i++; continue; }

      // título
      const heading = /^\s*(#{1,6})\s+(.*)$/.exec(line);
      if (heading) {
        const level = heading[1].length;
        out.push('<h' + level + '>' + inlineMd(heading[2].replace(/\s+#+\s*$/, '')) + '</h' + level + '>');
        i++;
        continue;
      }

      // tabela
      if (line.includes('|') && i + 1 < lines.length && /^[\s|:-]+$/.test(lines[i + 1]) && lines[i + 1].includes('-')) {
        const splitRow = l => l.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim());
        const headers = splitRow(line);
        const aligns = splitRow(lines[i + 1]).map(spec => {
          const left = spec.startsWith(':');
          const right = spec.endsWith(':');
          return left && right ? 'center' : right ? 'right' : left ? 'left' : '';
        });
        i += 2;
        const body = [];
        while (i < lines.length && lines[i].includes('|') && !blank(lines[i])) { body.push(splitRow(lines[i])); i++; }
        const cellAttr = idx => (aligns[idx] ? ' style="text-align:' + aligns[idx] + '"' : '');
        out.push('<table>\n<thead><tr>' +
          headers.map((h, idx) => '<th' + cellAttr(idx) + '>' + inlineMd(h) + '</th>').join('') +
          '</tr></thead>\n<tbody>' +
          body.map(r => '<tr>' + headers.map((_, idx) =>
            '<td' + cellAttr(idx) + '>' + inlineMd(r[idx] === undefined ? '' : r[idx]) + '</td>').join('') + '</tr>').join('\n') +
          '</tbody>\n</table>');
        continue;
      }

      // citação
      if (/^\s*>/.test(line)) {
        const buf = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) { buf.push(lines[i].replace(/^\s*>\s?/, '')); i++; }
        out.push('<blockquote>\n' + markdownToHtml(buf.join('\n')) + '\n</blockquote>');
        continue;
      }

      // listas (com aninhamento por indentação)
      if (isListItem(line)) {
        const items = [];
        while (i < lines.length && isListItem(lines[i])) {
          const m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]);
          items.push({ indent: m[1].replace(/\t/g, '  ').length, ordered: /\d/.test(m[2]), text: m[3] });
          i++;
        }
        out.push(renderList(items));
        continue;
      }

      // parágrafo
      const buf = [];
      while (i < lines.length && !blank(lines[i]) && !isBreak(lines[i])) { buf.push(lines[i].trim()); i++; }
      out.push('<p>' + inlineMd(buf.join('\n')).replace(/\n/g, '<br/>\n') + '</p>');
    }

    return out.join('\n');
  }

  function renderList(items, start) {
    const from = start || 0;
    if (from >= items.length) return '';
    const baseIndent = items[from].indent;
    const tag = items[from].ordered ? 'ol' : 'ul';
    let html = '<' + tag + '>\n';
    let i = from;

    while (i < items.length && items[i].indent >= baseIndent) {
      if (items[i].indent > baseIndent) {
        const nested = [];
        const childIndent = items[i].indent;
        while (i < items.length && items[i].indent >= childIndent) { nested.push(items[i]); i++; }
        html = html.replace(/<\/li>\n$/, '\n' + renderList(nested) + '\n</li>\n');
        continue;
      }
      html += '<li>' + inlineMd(items[i].text) + '</li>\n';
      i++;
    }
    return html + '</' + tag + '>';
  }

  function htmlDocument(title, body) {
    return '<!DOCTYPE html>\n<html lang="pt-BR">\n<head>\n<meta charset="UTF-8"/>\n' +
      '<meta name="viewport" content="width=device-width,initial-scale=1"/>\n' +
      '<title>' + escapeHtml(title) + '</title>\n<style>\n' +
      '  body{font-family:-apple-system,Segoe UI,Roboto,Georgia,serif;max-width:780px;margin:40px auto;padding:0 20px;line-height:1.7;color:#222;background:#fff}\n' +
      '  h1,h2,h3,h4{line-height:1.25;margin:1.6em 0 .6em}\n' +
      '  code{background:#f4f4f4;padding:2px 6px;border-radius:3px;font-family:ui-monospace,Menlo,monospace;font-size:.9em}\n' +
      '  pre{background:#f4f4f4;padding:14px;border-radius:6px;overflow-x:auto}\n' +
      '  pre code{background:none;padding:0}\n' +
      '  blockquote{border-left:3px solid #ddd;margin:1em 0;padding-left:1em;color:#555}\n' +
      '  table{border-collapse:collapse;width:100%;margin:1em 0}\n' +
      '  th,td{border:1px solid #ddd;padding:8px 10px;text-align:left}\n' +
      '  th{background:#f7f7f7}\n' +
      '  img{max-width:100%}\n  a{color:#0066cc}\n  hr{border:none;border-top:1px solid #ddd;margin:2em 0}\n' +
      '</style>\n</head>\n<body>\n' + body + '\n</body>\n</html>\n';
  }

  // ── legendas ─────────────────────────────────────────────────────────
  function srtToVtt(text) {
    const body = String(text)
      .replace(/^\uFEFF/, '')
      .replace(/\r\n?/g, '\n')
      .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
      .trim();
    return 'WEBVTT\n\n' + body + '\n';
  }

  function vttToSrt(text) {
    const clean = String(text)
      .replace(/^\uFEFF/, '')
      .replace(/\r\n?/g, '\n')
      .replace(/^WEBVTT.*\n/, '')
      .replace(/^(NOTE|STYLE|REGION)[\s\S]*?(?:\n\n|$)/gm, '')
      .trim();

    const blocks = clean.split(/\n{2,}/).filter(Boolean);
    const out = [];
    let index = 1;

    for (const block of blocks) {
      const lines = block.split('\n');
      const timeIndex = lines.findIndex(l => l.includes('-->'));
      if (timeIndex === -1) continue;
      const time = lines[timeIndex]
        .split(/\s+/).slice(0, 3).join(' ')                       // descarta settings (align, line…)
        .replace(/(\d{2}:\d{2}:\d{2})\.(\d{3})/g, '$1,$2')
        .replace(/(^|\s)(\d{2}:\d{2},\d{3})/g, '$100:$2');         // mm:ss -> hh:mm:ss
      const content = lines.slice(timeIndex + 1).join('\n').trim();
      out.push(index + '\n' + time + (content ? '\n' + content : ''));
      index++;
    }
    return out.join('\n\n') + '\n';
  }

  // ── texto ────────────────────────────────────────────────────────────
  function words(text) {
    return String(text)
      .replace(/([a-z\d])([A-Z])/g, '$1 $2')
      .split(/[^A-Za-zÀ-ÿ0-9]+/)
      .filter(Boolean);
  }

  function changeCase(text, mode) {
    const s = String(text);
    switch (mode) {
      case 'upper': return s.toUpperCase();
      case 'lower': return s.toLowerCase();
      case 'title': return s.replace(/\p{L}[\p{L}\p{M}']*/gu, w => w[0].toUpperCase() + w.slice(1).toLowerCase());
      case 'sentence': return s.toLowerCase().replace(/(^\s*\p{L}|[.!?]\s+\p{L})/gu, m => m.toUpperCase());
      case 'camel': {
        const w = words(s);
        return w.map((x, i) => (i ? x[0].toUpperCase() + x.slice(1).toLowerCase() : x.toLowerCase())).join('');
      }
      case 'pascal': return words(s).map(x => x[0].toUpperCase() + x.slice(1).toLowerCase()).join('');
      case 'snake': return words(s).map(x => x.toLowerCase()).join('_');
      case 'kebab': return words(s).map(x => x.toLowerCase()).join('-');
      case 'slug': return slugify(s);
      default: return s;
    }
  }

  function slugify(text) {
    return String(text)
      .normalize('NFD').replace(/[\u0300-\u036F]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function textStats(text) {
    const s = String(text);
    const w = s.trim() ? s.trim().split(/\s+/).length : 0;
    return {
      caracteres: s.length,
      caracteresSemEspacos: s.replace(/\s/g, '').length,
      palavras: w,
      linhas: s ? s.split('\n').length : 0,
      paragrafos: s.split(/\n{2,}/).filter(p => p.trim()).length
    };
  }

  // ── JSON ─────────────────────────────────────────────────────────────
  function sortKeysDeep(value) {
    if (Array.isArray(value)) return value.map(sortKeysDeep);
    if (value && typeof value === 'object') {
      return Object.keys(value).sort().reduce((acc, k) => { acc[k] = sortKeysDeep(value[k]); return acc; }, {});
    }
    return value;
  }

  function formatJson(text, opts) {
    const o = opts || {};
    const data = typeof text === 'string' ? JSON.parse(text) : text;
    const value = o.sortKeys ? sortKeysDeep(data) : data;
    return o.minify ? JSON.stringify(value) : JSON.stringify(value, null, o.indent === undefined ? 2 : o.indent);
  }

  /** Converte um nome de arquivo trocando a extensão. */
  function rename(filename, newExt) {
    const base = String(filename).replace(/\.[^./\\]+$/, '');
    if (!newExt) return base;
    return base + (newExt.startsWith('.') ? newExt : '.' + newExt);
  }

  /**
   * As fontes padrão do PDF (Helvetica, Times, Courier) só falam WinAnsi.
   * Caracteres fora dessa tabela — → — “ ” … • ✓ — saem embaralhados, então
   * traduzimos os mais comuns e trocamos o resto por '?'.
   */
  const PDF_TRANSLIT = {
    '→': '->', '←': '<-', '↔': '<->', '⇒': '=>', '⇐': '<=',
    '—': '--', '–': '-', '―': '--', '−': '-',
    '“': '"', '”': '"', '„': '"', '‘': "'", '’': "'", '‚': "'",
    '…': '...', '•': '-', '◦': '-', '▪': '-', '·': '-',
    '✓': 'v', '✔': 'v', '✗': 'x', '✘': 'x', '★': '*', '☆': '*',
    '≈': '~', '≠': '!=', '≤': '<=', '≥': '>=',
    '™': '(TM)', '€': 'EUR',
    '─': '-', '│': '|', '█': '#',
    '­': '', '​': '', ' ': ' ', ' ': ' ', ' ': ' ', ' ': ' ', ' ': ' '
  };

  /** Deixa o texto seguro para as fontes padrão do PDF (WinAnsi). */
  function pdfSafe(text) {
    return String(text).replace(/[^\r\n\t\x20-\x7E\xA0-\xFF]/gu, ch =>
      PDF_TRANSLIT[ch] !== undefined ? PDF_TRANSLIT[ch] : '?');
  }

  return {
    escapeHtml, humanSize, safeUrl, rename,
    parseCsv, detectSeparator, csvToJson, jsonToCsv, csvToMarkdown, flatten, normalizeHeaders,
    jsonToYaml, jsonToXml, prettyXml, jsonToSql,
    markdownToHtml, inlineMd, htmlDocument,
    srtToVtt, vttToSrt,
    changeCase, slugify, textStats,
    formatJson, sortKeysDeep, pdfSafe
  };
});
