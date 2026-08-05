/**
 * CONVRT — registro de conversores.
 *
 * Cada conversor é um objeto:
 *   id       identificador único (usado na URL: index.html#csv2json)
 *   from/to  rótulos mostrados no card
 *   cat      categoria (docs | dados | img | texto)
 *   desc     descrição curta
 *   accept   filtro do <input type="file">
 *   batch    true  -> run(files[], opts, ctx) recebe todos os arquivos de uma vez
 *            false -> run(file, opts, ctx) é chamado uma vez por arquivo
 *   options  campos declarativos renderizados pelo app.js
 *   run      devolve um resultado {name, blob, text, kind} ou uma lista deles
 */
(function (root) {
  'use strict';

  const F = root.CONVRT.formats;
  const lib = root.CONVRT.lib;

  // ── helpers ──────────────────────────────────────────────────────────
  const TEXT = 'text/plain;charset=utf-8';

  function out(name, blob, text, kind) {
    return { name, blob, text: text === undefined ? null : text, kind: kind || (text != null ? 'text' : 'binary') };
  }

  function textResult(name, text, mime) {
    return out(name, new Blob([text], { type: mime || TEXT }), text, 'text');
  }

  function bytes(data, mime) {
    return new Blob([data], { type: mime });
  }

  async function readJson(file) {
    const raw = await file.text();
    try {
      return JSON.parse(raw);
    } catch (err) {
      throw new Error('JSON inválido: ' + err.message);
    }
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('não consegui abrir a imagem ' + file.name)); };
      img.src = url;
    });
  }

  function canvasToBlob(canvas, mime, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('falha ao gerar ' + mime))), mime, quality);
    });
  }

  /** Desenha a imagem redimensionada respeitando proporção e fundo opcional. */
  function drawImage(img, opts) {
    const o = opts || {};
    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;
    const maxW = o.maxW > 0 ? o.maxW : srcW;
    const maxH = o.maxH > 0 ? o.maxH : srcH;
    const scale = Math.min(maxW / srcW, maxH / srcH, o.allowUpscale ? Infinity : 1);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(srcW * scale));
    canvas.height = Math.max(1, Math.round(srcH * scale));
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    if (o.background) {
      ctx.fillStyle = o.background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  const SEP_OPTIONS = [
    { value: ',', label: 'Vírgula ( , )' },
    { value: ';', label: 'Ponto e vírgula ( ; )' },
    { value: '\t', label: 'Tab' },
    { value: '|', label: 'Pipe ( | )' },
    { value: 'auto', label: 'Detectar automaticamente' }
  ];

  function sepOf(opts, text) {
    const value = opts.sep || ',';
    return value === 'auto' ? F.detectSeparator(text) : value;
  }

  // ── DOCX mínimo (Office Open XML) ────────────────────────────────────
  function docxEscape(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /** Converte inline markdown simples (**negrito**, *itálico*, `código`) em runs. */
  function docxRuns(text) {
    const tokens = String(text).split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g).filter(t => t !== '');
    return tokens.map(token => {
      let props = '';
      let content = token;
      if (/^\*\*[\s\S]+\*\*$/.test(token)) { props = '<w:b/>'; content = token.slice(2, -2); }
      else if (/^\*[\s\S]+\*$/.test(token)) { props = '<w:i/>'; content = token.slice(1, -1); }
      else if (/^`[\s\S]+`$/.test(token)) { props = '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>'; content = token.slice(1, -1); }
      return '<w:r>' + (props ? '<w:rPr>' + props + '</w:rPr>' : '') +
        '<w:t xml:space="preserve">' + docxEscape(content) + '</w:t></w:r>';
    }).join('');
  }

  function docxParagraph(text, opts) {
    const o = opts || {};
    const runProps = [];
    if (o.bold) runProps.push('<w:b/>');
    if (o.size) runProps.push('<w:sz w:val="' + o.size * 2 + '"/><w:szCs w:val="' + o.size * 2 + '"/>');
    if (o.mono) runProps.push('<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>');
    const pPr = '<w:pPr>' +
      (o.spacingBefore ? '<w:spacing w:before="' + o.spacingBefore + '"/>' : '') +
      (o.indent ? '<w:ind w:left="' + o.indent + '"/>' : '') +
      (runProps.length ? '<w:rPr>' + runProps.join('') + '</w:rPr>' : '') +
      '</w:pPr>';

    if (o.plain) {
      return '<w:p>' + pPr + '<w:r>' + (runProps.length ? '<w:rPr>' + runProps.join('') + '</w:rPr>' : '') +
        '<w:t xml:space="preserve">' + docxEscape(text) + '</w:t></w:r></w:p>';
    }
    if (runProps.length) {
      return '<w:p>' + pPr + '<w:r><w:rPr>' + runProps.join('') + '</w:rPr>' +
        '<w:t xml:space="preserve">' + docxEscape(text) + '</w:t></w:r></w:p>';
    }
    return '<w:p>' + pPr + docxRuns(text) + '</w:p>';
  }

  /** Monta o .docx a partir de parágrafos já serializados. */
  async function buildDocx(paragraphs) {
    const JSZip = await lib('jszip');
    const zip = new JSZip();

    zip.file('[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '</Types>');

    zip.folder('_rels').file('.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>');

    zip.folder('word').file('document.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
      paragraphs.join('') +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
      '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr>' +
      '</w:body></w:document>');

    return zip.generateAsync({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      compression: 'DEFLATE'
    });
  }

  /** Quebra markdown em parágrafos DOCX (títulos, listas, código, citação). */
  function markdownToDocxParagraphs(text) {
    const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
    const paragraphs = [];
    let inCode = false;

    for (const line of lines) {
      if (/^\s*```/.test(line)) { inCode = !inCode; continue; }
      if (inCode) { paragraphs.push(docxParagraph(line || ' ', { mono: true, size: 10, plain: true })); continue; }
      if (!line.trim()) { paragraphs.push('<w:p/>'); continue; }

      const heading = /^(#{1,6})\s+(.*)$/.exec(line);
      if (heading) {
        const sizes = [20, 17, 15, 13, 12, 11];
        paragraphs.push(docxParagraph(heading[2], { bold: true, size: sizes[heading[1].length - 1], spacingBefore: 240 }));
        continue;
      }
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { paragraphs.push(docxParagraph('────────', { plain: true })); continue; }
      const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
      if (bullet) { paragraphs.push(docxParagraph('•  ' + bullet[1], { indent: 360 })); continue; }
      const ordered = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);
      if (ordered) { paragraphs.push(docxParagraph(ordered[1] + '.  ' + ordered[2], { indent: 360 })); continue; }
      const quote = /^\s*>\s?(.*)$/.exec(line);
      if (quote) { paragraphs.push(docxParagraph(quote[1], { indent: 360, mono: false })); continue; }

      paragraphs.push(docxParagraph(line));
    }
    return paragraphs;
  }

  // ── PDF helpers ──────────────────────────────────────────────────────
  const PAGE_SIZES = { a4: [210, 297], letter: [215.9, 279.4], a5: [148, 210] };

  async function newPdf(opts) {
    const { jsPDF } = await lib('jspdf');
    const o = opts || {};
    const size = PAGE_SIZES[o.pageSize || 'a4'] || PAGE_SIZES.a4;
    const landscape = o.orientation === 'l';
    return {
      doc: new jsPDF({ unit: 'mm', format: o.pageSize || 'a4', orientation: landscape ? 'l' : 'p' }),
      width: landscape ? size[1] : size[0],
      height: landscape ? size[0] : size[1]
    };
  }

  function stampPageNumbers(doc) {
    const total = doc.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
      doc.setPage(p);
      doc.setFontSize(8);
      doc.setTextColor(130);
      const size = doc.internal.pageSize;
      doc.text(p + ' / ' + total, size.getWidth() / 2, size.getHeight() - 8, { align: 'center' });
    }
    doc.setTextColor(0);
  }

  /** "1-3,5,8-" -> [0,1,2,4,7,...] (índices 0-based, limitado a total) */
  function parseRanges(spec, total) {
    const text = String(spec || '').trim();
    if (!text) return Array.from({ length: total }, (_, i) => i);
    const pages = new Set();
    for (const part of text.split(',')) {
      const chunk = part.trim();
      if (!chunk) continue;
      const range = /^(\d*)\s*-\s*(\d*)$/.exec(chunk);
      if (range) {
        const start = Math.max(1, parseInt(range[1] || '1', 10));
        const end = Math.min(total, parseInt(range[2] || String(total), 10));
        for (let p = start; p <= end; p++) pages.add(p - 1);
      } else {
        const n = parseInt(chunk, 10);
        if (n >= 1 && n <= total) pages.add(n - 1);
      }
    }
    const list = [...pages].sort((a, b) => a - b);
    if (!list.length) throw new Error('nenhuma página válida no intervalo informado');
    return list;
  }

  // ── conversores ──────────────────────────────────────────────────────
  const converters = [

    // ═══ DOCUMENTOS ═══
    {
      id: 'txt2pdf', from: 'TXT', to: 'PDF', cat: 'docs', icon: '📝',
      desc: 'Texto puro em PDF paginado, com título e numeração',
      accept: '.txt,.log,.md,text/plain',
      options: [
        { id: 'title', label: 'título do documento', type: 'text', placeholder: 'opcional' },
        { id: 'fontSize', label: 'tamanho da fonte', type: 'number', value: 12, min: 6, max: 32 },
        { id: 'font', label: 'fonte', type: 'select', value: 'helvetica', options: [
          { value: 'helvetica', label: 'Helvetica' }, { value: 'times', label: 'Times' }, { value: 'courier', label: 'Courier (mono)' }] },
        { id: 'pageSize', label: 'página', type: 'select', value: 'a4', options: [
          { value: 'a4', label: 'A4' }, { value: 'letter', label: 'Carta' }, { value: 'a5', label: 'A5' }] },
        { id: 'orientation', label: 'orientação', type: 'select', value: 'p', options: [
          { value: 'p', label: 'Retrato' }, { value: 'l', label: 'Paisagem' }] },
        { id: 'numbers', label: 'numerar páginas', type: 'checkbox', value: true }
      ],
      async run(file, opts) {
        const text = F.pdfSafe(await file.text());
        const { doc, width, height } = await newPdf(opts);
        const fontSize = Number(opts.fontSize) || 12;
        const margin = 18;
        const lineHeight = fontSize * 0.42;
        const maxWidth = width - margin * 2;
        let y = margin;

        doc.setFont(opts.font || 'helvetica', 'normal');
        if (opts.title) {
          doc.setFontSize(fontSize + 6);
          doc.setFont(opts.font || 'helvetica', 'bold');
          for (const line of doc.splitTextToSize(F.pdfSafe(opts.title), maxWidth)) {
            doc.text(line, margin, y);
            y += (fontSize + 6) * 0.45;
          }
          y += lineHeight;
          doc.setFont(opts.font || 'helvetica', 'normal');
        }

        doc.setFontSize(fontSize);
        for (const paragraph of text.replace(/\r\n?/g, '\n').split('\n')) {
          const lines = paragraph ? doc.splitTextToSize(paragraph, maxWidth) : [''];
          for (const line of lines) {
            if (y + lineHeight > height - margin) { doc.addPage(); y = margin; }
            doc.text(line, margin, y);
            y += lineHeight;
          }
        }
        if (opts.numbers) stampPageNumbers(doc);
        return out(F.rename(file.name, 'pdf'), doc.output('blob'), null, 'binary');
      }
    },

    {
      id: 'md2pdf', from: 'MD', to: 'PDF', cat: 'docs', icon: '📄',
      desc: 'Markdown em PDF com títulos, listas e blocos de código',
      accept: '.md,.markdown,text/markdown',
      options: [
        { id: 'pageSize', label: 'página', type: 'select', value: 'a4', options: [
          { value: 'a4', label: 'A4' }, { value: 'letter', label: 'Carta' }, { value: 'a5', label: 'A5' }] },
        { id: 'base', label: 'tamanho do texto', type: 'number', value: 11, min: 7, max: 20 },
        { id: 'numbers', label: 'numerar páginas', type: 'checkbox', value: true }
      ],
      async run(file, opts) {
        const md = (await file.text()).replace(/\r\n?/g, '\n');
        const { doc, width, height } = await newPdf(opts);
        const base = Number(opts.base) || 11;
        const margin = 18;
        const maxWidth = width - margin * 2;
        let y = margin;
        let inCode = false;

        const write = (line, { size, style, indent = 0, color = 0, font = 'helvetica' }) => {
          doc.setFont(font, style || 'normal');
          doc.setFontSize(size);
          doc.setTextColor(color);
          const lineHeight = size * 0.45;
          for (const piece of doc.splitTextToSize(F.pdfSafe(line), maxWidth - indent)) {
            if (y + lineHeight > height - margin) { doc.addPage(); y = margin; }
            doc.text(piece, margin + indent, y);
            y += lineHeight;
          }
        };

        for (const raw of md.split('\n')) {
          if (/^\s*```/.test(raw)) { inCode = !inCode; y += 1; continue; }
          if (inCode) { write(raw || ' ', { size: base - 1, font: 'courier', indent: 4, color: 60 }); continue; }
          if (!raw.trim()) { y += base * 0.35; continue; }

          const heading = /^(#{1,6})\s+(.*)$/.exec(raw);
          if (heading) {
            const level = heading[1].length;
            y += base * 0.5;
            write(heading[2], { size: base + Math.max(0, 8 - level * 1.6), style: 'bold' });
            y += base * 0.2;
            continue;
          }
          if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(raw)) {
            if (y + 4 > height - margin) { doc.addPage(); y = margin; }
            doc.setDrawColor(200);
            doc.line(margin, y, width - margin, y);
            y += base * 0.6;
            continue;
          }
          const bullet = /^\s*[-*+]\s+(.*)$/.exec(raw);
          if (bullet) { write('•  ' + stripInline(bullet[1]), { size: base, indent: 5 }); continue; }
          const ordered = /^\s*(\d+)[.)]\s+(.*)$/.exec(raw);
          if (ordered) { write(ordered[1] + '.  ' + stripInline(ordered[2]), { size: base, indent: 5 }); continue; }
          const quote = /^\s*>\s?(.*)$/.exec(raw);
          if (quote) { write(stripInline(quote[1]), { size: base, style: 'italic', indent: 6, color: 90 }); continue; }

          write(stripInline(raw), { size: base });
        }

        if (opts.numbers) stampPageNumbers(doc);
        return out(F.rename(file.name, 'pdf'), doc.output('blob'), null, 'binary');

        function stripInline(s) {
          return s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1')
            .replace(/`(.+?)`/g, '$1').replace(/\[(.+?)\]\((.+?)\)/g, '$1 ($2)');
        }
      }
    },

    {
      id: 'pdf2txt', from: 'PDF', to: 'TXT', cat: 'docs', icon: '📑',
      desc: 'Extrai o texto de um PDF preservando as quebras de linha',
      accept: '.pdf,application/pdf',
      options: [
        { id: 'marks', label: 'marcar início de cada página', type: 'checkbox', value: true },
        { id: 'range', label: 'páginas (ex.: 1-3,7)', type: 'text', placeholder: 'todas' }
      ],
      async run(file, opts, ctx) {
        const pdfjsLib = await lib('pdfjs');
        const data = new Uint8Array(await file.arrayBuffer());
        const pdf = await pdfjsLib.getDocument({ data }).promise;
        const pages = parseRanges(opts.range, pdf.numPages);
        let text = '';

        for (let i = 0; i < pages.length; i++) {
          ctx.progress(Math.round((i / pages.length) * 95));
          const page = await pdf.getPage(pages[i] + 1);
          const content = await page.getTextContent();
          let lastY = null;
          let lastEndX = null;
          let line = '';
          const lines = [];
          for (const item of content.items) {
            if (!item.str) { if (item.hasEOL) { lines.push(line.trim()); line = ''; lastEndX = null; } continue; }
            const x = item.transform[4];
            const y = Math.round(item.transform[5]);
            if (lastY !== null && Math.abs(y - lastY) > 2) {
              lines.push(line.trim());
              line = '';
              lastEndX = null;
            } else if (lastEndX !== null && x - lastEndX > 1 && !/\s$/.test(line)) {
              line += ' ';   // trechos separados no PDF que na verdade são palavras vizinhas
            }
            line += item.str;
            if (item.hasEOL) { lines.push(line.trim()); line = ''; lastEndX = null; }
            else lastEndX = x + (item.width || 0);
            lastY = y;
          }
          if (line.trim()) lines.push(line.trim());
          if (opts.marks) text += '───── página ' + (pages[i] + 1) + ' ─────\n';
          text += lines.join('\n').replace(/\n{3,}/g, '\n\n') + '\n\n';
        }
        return textResult(F.rename(file.name, 'txt'), text.trim() + '\n');
      }
    },

    {
      id: 'pdf2img', from: 'PDF', to: 'IMG', cat: 'docs', icon: '🖼️',
      desc: 'Rasteriza cada página do PDF em PNG ou JPG',
      accept: '.pdf,application/pdf',
      options: [
        { id: 'format', label: 'formato', type: 'select', value: 'image/png', options: [
          { value: 'image/png', label: 'PNG' }, { value: 'image/jpeg', label: 'JPG' }, { value: 'image/webp', label: 'WEBP' }] },
        { id: 'scale', label: 'qualidade (escala)', type: 'select', value: '2', options: [
          { value: '1', label: '1x — rápido' }, { value: '2', label: '2x — recomendado' }, { value: '3', label: '3x — alta' }] },
        { id: 'range', label: 'páginas (ex.: 1-3,7)', type: 'text', placeholder: 'todas' }
      ],
      async run(file, opts, ctx) {
        const pdfjsLib = await lib('pdfjs');
        const data = new Uint8Array(await file.arrayBuffer());
        const pdf = await pdfjsLib.getDocument({ data }).promise;
        const pages = parseRanges(opts.range, pdf.numPages);
        const scale = Number(opts.scale) || 2;
        const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[opts.format] || 'png';
        const results = [];

        for (let i = 0; i < pages.length; i++) {
          ctx.progress(Math.round((i / pages.length) * 95));
          const page = await pdf.getPage(pages[i] + 1);
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const context = canvas.getContext('2d');
          context.fillStyle = '#fff';
          context.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: context, viewport }).promise;
          const blob = await canvasToBlob(canvas, opts.format, 0.92);
          const num = String(pages[i] + 1).padStart(3, '0');
          results.push(out(F.rename(file.name, '') + '-p' + num + '.' + ext, blob, null, 'image'));
        }
        return results;
      }
    },

    {
      id: 'pdfmerge', from: 'PDFs', to: 'PDF', cat: 'docs', icon: '🧩',
      desc: 'Junta vários PDFs em um só, na ordem da lista',
      accept: '.pdf,application/pdf', batch: true, multiple: true,
      options: [],
      async run(files, opts, ctx) {
        if (files.length < 2) throw new Error('selecione pelo menos 2 PDFs para juntar');
        const PDFLib = await lib('pdflib');
        const merged = await PDFLib.PDFDocument.create();
        for (let i = 0; i < files.length; i++) {
          ctx.progress(Math.round((i / files.length) * 90));
          const src = await PDFLib.PDFDocument.load(await files[i].arrayBuffer(), { ignoreEncryption: true });
          const pages = await merged.copyPages(src, src.getPageIndices());
          pages.forEach(p => merged.addPage(p));
        }
        const data = await merged.save();
        return out('unido.pdf', bytes(data, 'application/pdf'), null, 'binary');
      }
    },

    {
      id: 'pdfsplit', from: 'PDF', to: 'PDFs', cat: 'docs', icon: '✂️',
      desc: 'Separa páginas do PDF em arquivos individuais ou em um recorte',
      accept: '.pdf,application/pdf',
      options: [
        { id: 'mode', label: 'modo', type: 'select', value: 'each', options: [
          { value: 'each', label: 'Uma página por arquivo' },
          { value: 'extract', label: 'Extrair intervalo em um único PDF' }] },
        { id: 'range', label: 'páginas (ex.: 1-3,7)', type: 'text', placeholder: 'todas' }
      ],
      async run(file, opts, ctx) {
        const PDFLib = await lib('pdflib');
        const src = await PDFLib.PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
        const pages = parseRanges(opts.range, src.getPageCount());
        const base = F.rename(file.name, '');

        if (opts.mode === 'extract') {
          const doc = await PDFLib.PDFDocument.create();
          const copied = await doc.copyPages(src, pages);
          copied.forEach(p => doc.addPage(p));
          return out(base + '-recorte.pdf', bytes(await doc.save(), 'application/pdf'), null, 'binary');
        }

        const results = [];
        for (let i = 0; i < pages.length; i++) {
          ctx.progress(Math.round((i / pages.length) * 95));
          const doc = await PDFLib.PDFDocument.create();
          const [page] = await doc.copyPages(src, [pages[i]]);
          doc.addPage(page);
          results.push(out(base + '-p' + String(pages[i] + 1).padStart(3, '0') + '.pdf',
            bytes(await doc.save(), 'application/pdf'), null, 'binary'));
        }
        return results;
      }
    },

    {
      id: 'pdfrotate', from: 'PDF', to: 'PDF', cat: 'docs', icon: '🔄',
      desc: 'Gira as páginas do PDF (útil para digitalizações tortas)',
      accept: '.pdf,application/pdf',
      options: [
        { id: 'angle', label: 'ângulo', type: 'select', value: '90', options: [
          { value: '90', label: '90° horário' }, { value: '180', label: '180°' }, { value: '270', label: '90° anti-horário' }] },
        { id: 'range', label: 'páginas (ex.: 1-3,7)', type: 'text', placeholder: 'todas' }
      ],
      async run(file, opts) {
        const PDFLib = await lib('pdflib');
        const doc = await PDFLib.PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
        const pages = parseRanges(opts.range, doc.getPageCount());
        const delta = Number(opts.angle) || 90;
        for (const index of pages) {
          const page = doc.getPage(index);
          page.setRotation(PDFLib.degrees((page.getRotation().angle + delta) % 360));
        }
        return out(F.rename(file.name, '') + '-girado.pdf', bytes(await doc.save(), 'application/pdf'), null, 'binary');
      }
    },

    {
      id: 'md2html', from: 'MD', to: 'HTML', cat: 'docs', icon: '📝',
      desc: 'Markdown para HTML (tabelas, código, listas, citações)',
      accept: '.md,.markdown,text/markdown',
      options: [
        { id: 'full', label: 'saída', type: 'select', value: 'yes', options: [
          { value: 'yes', label: 'Página completa com CSS' }, { value: 'no', label: 'Só o fragmento HTML' }] }
      ],
      async run(file, opts) {
        const body = F.markdownToHtml(await file.text());
        const html = opts.full === 'no' ? body : F.htmlDocument(F.rename(file.name, '').replace(/[-_]/g, ' '), body);
        return textResult(F.rename(file.name, 'html'), html, 'text/html;charset=utf-8');
      }
    },

    {
      id: 'html2txt', from: 'HTML', to: 'TXT', cat: 'docs', icon: '🌐',
      desc: 'Tira as tags e devolve só o texto legível',
      accept: '.html,.htm,text/html',
      options: [{ id: 'links', label: 'manter URLs dos links', type: 'checkbox', value: false }],
      async run(file, opts) {
        const doc = new DOMParser().parseFromString(await file.text(), 'text/html');
        doc.querySelectorAll('script,style,noscript,template,svg').forEach(el => el.remove());
        if (opts.links) doc.querySelectorAll('a[href]').forEach(a => { a.textContent = a.textContent + ' (' + a.getAttribute('href') + ')'; });
        doc.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
        doc.querySelectorAll('p,div,li,tr,h1,h2,h3,h4,h5,h6,section,article').forEach(el => el.append('\n'));
        const text = (doc.body ? doc.body.textContent : '')
          .replace(/[ \t]+/g, ' ')
          .replace(/ *\n */g, '\n')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
        return textResult(F.rename(file.name, 'txt'), text + '\n');
      }
    },

    {
      id: 'html2md', from: 'HTML', to: 'MD', cat: 'docs', icon: '↩️',
      desc: 'HTML para Markdown (títulos, listas, links, código, tabelas)',
      accept: '.html,.htm,text/html',
      options: [],
      async run(file) {
        const doc = new DOMParser().parseFromString(await file.text(), 'text/html');
        doc.querySelectorAll('script,style,noscript,template').forEach(el => el.remove());
        const md = htmlNodeToMarkdown(doc.body || doc.documentElement)
          .replace(/\n{3,}/g, '\n\n')
          .trim();
        return textResult(F.rename(file.name, 'md'), md + '\n', 'text/markdown;charset=utf-8');
      }
    },

    {
      id: 'txt2docx', from: 'TXT/MD', to: 'DOCX', cat: 'docs', icon: '📘',
      desc: 'Gera um .docx do Word a partir de texto ou markdown',
      accept: '.txt,.md,.markdown,text/plain,text/markdown',
      options: [],
      async run(file) {
        const text = await file.text();
        const paragraphs = markdownToDocxParagraphs(text);
        const blob = await buildDocx(paragraphs);
        return out(F.rename(file.name, 'docx'), blob, null, 'binary');
      }
    },

    // ═══ DADOS ═══
    {
      id: 'csv2json', from: 'CSV', to: 'JSON', cat: 'dados', icon: '📊',
      desc: 'CSV para JSON com parser RFC 4180 (aspas e quebras de linha)',
      accept: '.csv,.tsv,text/csv',
      options: [
        { id: 'sep', label: 'separador', type: 'select', value: 'auto', options: SEP_OPTIONS },
        { id: 'autoType', label: 'converter números e booleanos', type: 'checkbox', value: true },
        { id: 'minify', label: 'saída compacta', type: 'checkbox', value: false }
      ],
      async run(file, opts) {
        const text = await file.text();
        const data = F.csvToJson(text, { sep: sepOf(opts, text), autoType: opts.autoType !== false });
        const json = opts.minify ? JSON.stringify(data) : JSON.stringify(data, null, 2);
        return textResult(F.rename(file.name, 'json'), json, 'application/json');
      }
    },

    {
      id: 'json2csv', from: 'JSON', to: 'CSV', cat: 'dados', icon: '📊',
      desc: 'JSON para CSV achatando objetos aninhados (a.b.c)',
      accept: '.json,application/json',
      options: [{ id: 'sep', label: 'separador', type: 'select', value: ',', options: SEP_OPTIONS.slice(0, 4) }],
      async run(file, opts) {
        const csv = F.jsonToCsv(await readJson(file), { sep: opts.sep || ',' });
        return textResult(F.rename(file.name, 'csv'), csv, 'text/csv;charset=utf-8');
      }
    },

    {
      id: 'json2yaml', from: 'JSON', to: 'YAML', cat: 'dados', icon: '🧾',
      desc: 'JSON para YAML legível, sem dependências',
      accept: '.json,application/json',
      options: [],
      async run(file) {
        const yaml = F.jsonToYaml(await readJson(file)) + '\n';
        return textResult(F.rename(file.name, 'yaml'), yaml, 'text/yaml;charset=utf-8');
      }
    },

    {
      id: 'yaml2json', from: 'YAML', to: 'JSON', cat: 'dados', icon: '🧾',
      desc: 'YAML (inclusive multi-documento) para JSON',
      accept: '.yaml,.yml,text/yaml',
      options: [{ id: 'minify', label: 'saída compacta', type: 'checkbox', value: false }],
      async run(file, opts) {
        const jsyaml = await lib('jsyaml');
        const docs = jsyaml.loadAll(await file.text());
        const data = docs.length === 1 ? docs[0] : docs;
        const json = opts.minify ? JSON.stringify(data) : JSON.stringify(data, null, 2);
        return textResult(F.rename(file.name, 'json'), json, 'application/json');
      }
    },

    {
      id: 'json2xml', from: 'JSON', to: 'XML', cat: 'dados', icon: '🔖',
      desc: 'JSON para XML identado',
      accept: '.json,application/json',
      options: [{ id: 'root', label: 'elemento raiz', type: 'text', value: 'root', placeholder: 'root' }],
      async run(file, opts) {
        const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
          F.jsonToXml(await readJson(file), opts.root || 'root') + '\n';
        return textResult(F.rename(file.name, 'xml'), xml, 'application/xml');
      }
    },

    {
      id: 'xml2json', from: 'XML', to: 'JSON', cat: 'dados', icon: '🔖',
      desc: 'XML para JSON (atributos viram @attr)',
      accept: '.xml,.rss,.svg,application/xml,text/xml',
      options: [{ id: 'minify', label: 'saída compacta', type: 'checkbox', value: false }],
      async run(file, opts) {
        const doc = new DOMParser().parseFromString(await file.text(), 'application/xml');
        const error = doc.querySelector('parsererror');
        if (error) throw new Error('XML inválido: ' + error.textContent.split('\n')[0]);
        const data = { [doc.documentElement.nodeName]: xmlNodeToJson(doc.documentElement) };
        const json = opts.minify ? JSON.stringify(data) : JSON.stringify(data, null, 2);
        return textResult(F.rename(file.name, 'json'), json, 'application/json');
      }
    },

    {
      id: 'csv2xlsx', from: 'CSV', to: 'XLSX', cat: 'dados', icon: '📗',
      desc: 'CSV para planilha do Excel (.xlsx)',
      accept: '.csv,.tsv,text/csv',
      options: [
        { id: 'sep', label: 'separador', type: 'select', value: 'auto', options: SEP_OPTIONS },
        { id: 'sheet', label: 'nome da aba', type: 'text', value: 'Dados', placeholder: 'Dados' }
      ],
      async run(file, opts) {
        const XLSX = await lib('xlsx');
        const text = await file.text();
        const rows = F.parseCsv(text, sepOf(opts, text));
        const ws = XLSX.utils.aoa_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, (opts.sheet || 'Dados').slice(0, 31));
        const data = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        return out(F.rename(file.name, 'xlsx'),
          bytes(data, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'), null, 'binary');
      }
    },

    {
      id: 'json2xlsx', from: 'JSON', to: 'XLSX', cat: 'dados', icon: '📗',
      desc: 'Array JSON para planilha do Excel',
      accept: '.json,application/json',
      options: [{ id: 'sheet', label: 'nome da aba', type: 'text', value: 'Dados', placeholder: 'Dados' }],
      async run(file, opts) {
        const XLSX = await lib('xlsx');
        const data = await readJson(file);
        const list = (Array.isArray(data) ? data : [data]).map(item =>
          (item && typeof item === 'object' ? F.flatten(item) : { valor: item }));
        const ws = XLSX.utils.json_to_sheet(list);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, (opts.sheet || 'Dados').slice(0, 31));
        const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        return out(F.rename(file.name, 'xlsx'),
          bytes(buf, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'), null, 'binary');
      }
    },

    {
      id: 'xlsx2csv', from: 'XLSX', to: 'CSV', cat: 'dados', icon: '📗',
      desc: 'Planilha (.xlsx/.xls/.ods) para CSV — uma aba ou todas',
      accept: '.xlsx,.xls,.ods,.xlsm',
      options: [
        { id: 'sheet', label: 'aba', type: 'select', value: 'first', options: [
          { value: 'first', label: 'Primeira aba' }, { value: 'all', label: 'Todas (um CSV por aba)' }] },
        { id: 'sep', label: 'separador', type: 'select', value: ',', options: SEP_OPTIONS.slice(0, 4) }
      ],
      async run(file, opts) {
        const XLSX = await lib('xlsx');
        const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
        const base = F.rename(file.name, '');
        const names = opts.sheet === 'all' ? wb.SheetNames : [wb.SheetNames[0]];
        const results = names.map(name => {
          const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name], { FS: opts.sep || ',' });
          const suffix = names.length > 1 ? '-' + F.slugify(name) : '';
          return textResult(base + suffix + '.csv', csv, 'text/csv;charset=utf-8');
        });
        return results.length === 1 ? results[0] : results;
      }
    },

    {
      id: 'xlsx2json', from: 'XLSX', to: 'JSON', cat: 'dados', icon: '📗',
      desc: 'Planilha para JSON usando a primeira linha como cabeçalho',
      accept: '.xlsx,.xls,.ods,.xlsm',
      options: [
        { id: 'sheet', label: 'aba', type: 'select', value: 'first', options: [
          { value: 'first', label: 'Primeira aba' }, { value: 'all', label: 'Todas (objeto por aba)' }] }
      ],
      async run(file, opts) {
        const XLSX = await lib('xlsx');
        const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
        const toJson = name => XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '' });
        const data = opts.sheet === 'all'
          ? wb.SheetNames.reduce((acc, name) => { acc[name] = toJson(name); return acc; }, {})
          : toJson(wb.SheetNames[0]);
        return textResult(F.rename(file.name, 'json'), JSON.stringify(data, null, 2), 'application/json');
      }
    },

    {
      id: 'csv2md', from: 'CSV', to: 'MD', cat: 'dados', icon: '📋',
      desc: 'CSV para tabela Markdown pronta pra colar no GitHub',
      accept: '.csv,.tsv,text/csv',
      options: [{ id: 'sep', label: 'separador', type: 'select', value: 'auto', options: SEP_OPTIONS }],
      async run(file, opts) {
        const text = await file.text();
        const md = F.csvToMarkdown(text, { sep: sepOf(opts, text) }) + '\n';
        return textResult(F.rename(file.name, 'md'), md, 'text/markdown;charset=utf-8');
      }
    },

    {
      id: 'json2sql', from: 'JSON', to: 'SQL', cat: 'dados', icon: '🗄️',
      desc: 'Gera INSERTs (e opcionalmente o CREATE TABLE)',
      accept: '.json,application/json',
      options: [
        { id: 'table', label: 'nome da tabela', type: 'text', value: 'dados', placeholder: 'dados' },
        { id: 'createTable', label: 'incluir CREATE TABLE', type: 'checkbox', value: true }
      ],
      async run(file, opts) {
        const sql = F.jsonToSql(await readJson(file), { table: opts.table || 'dados', createTable: !!opts.createTable });
        return textResult(F.rename(file.name, 'sql'), sql, 'application/sql');
      }
    },

    {
      id: 'jsonfmt', from: 'JSON', to: 'JSON', cat: 'dados', icon: '✨',
      desc: 'Formata, minifica, ordena chaves e valida o JSON',
      accept: '.json,application/json',
      options: [
        { id: 'mode', label: 'modo', type: 'select', value: 'pretty', options: [
          { value: 'pretty', label: 'Formatar (2 espaços)' },
          { value: 'pretty4', label: 'Formatar (4 espaços)' },
          { value: 'minify', label: 'Minificar' }] },
        { id: 'sortKeys', label: 'ordenar chaves', type: 'checkbox', value: false }
      ],
      async run(file, opts) {
        const data = await readJson(file);
        const json = F.formatJson(data, {
          minify: opts.mode === 'minify',
          indent: opts.mode === 'pretty4' ? 4 : 2,
          sortKeys: !!opts.sortKeys
        });
        return textResult(F.rename(file.name, '') + (opts.mode === 'minify' ? '.min.json' : '.json'), json, 'application/json');
      }
    },

    // ═══ IMAGENS ═══
    {
      id: 'imgconv', from: 'IMG', to: 'IMG', cat: 'img', icon: '🎨',
      desc: 'Converte, redimensiona e comprime PNG / JPG / WEBP',
      accept: 'image/*', multiple: true,
      options: [
        { id: 'format', label: 'formato de saída', type: 'select', value: 'image/webp', options: [
          { value: 'image/webp', label: 'WEBP (menor)' }, { value: 'image/jpeg', label: 'JPG' }, { value: 'image/png', label: 'PNG' }] },
        { id: 'quality', label: 'qualidade (1–100, só JPG/WEBP)', type: 'number', value: 82, min: 1, max: 100 },
        { id: 'maxW', label: 'largura máxima em px (0 = original)', type: 'number', value: 0, min: 0, max: 20000 },
        { id: 'maxH', label: 'altura máxima em px (0 = original)', type: 'number', value: 0, min: 0, max: 20000 },
        { id: 'bg', label: 'fundo para transparência', type: 'select', value: '#ffffff', options: [
          { value: '#ffffff', label: 'Branco' }, { value: '#000000', label: 'Preto' }, { value: '', label: 'Manter transparente (só PNG/WEBP)' }] }
      ],
      async run(file, opts) {
        const img = await loadImage(file);
        const opaque = opts.format === 'image/jpeg';
        const canvas = drawImage(img, {
          maxW: Number(opts.maxW) || 0,
          maxH: Number(opts.maxH) || 0,
          background: opaque ? (opts.bg || '#ffffff') : (opts.bg || null)
        });
        const quality = Math.min(100, Math.max(1, Number(opts.quality) || 82)) / 100;
        const blob = await canvasToBlob(canvas, opts.format, quality);
        const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[opts.format] || 'png';
        return out(F.rename(file.name, ext), blob, null, 'image');
      }
    },

    {
      id: 'img2pdf', from: 'IMG', to: 'PDF', cat: 'img', icon: '🖼️',
      desc: 'Uma ou várias imagens viram um PDF (uma por página)',
      accept: 'image/*', batch: true, multiple: true,
      options: [
        { id: 'fit', label: 'página', type: 'select', value: 'a4', options: [
          { value: 'a4', label: 'A4 com margem' }, { value: 'letter', label: 'Carta com margem' }, { value: 'image', label: 'Do tamanho da imagem' }] },
        { id: 'orientation', label: 'orientação (A4/Carta)', type: 'select', value: 'auto', options: [
          { value: 'auto', label: 'Automática' }, { value: 'p', label: 'Retrato' }, { value: 'l', label: 'Paisagem' }] },
        { id: 'margin', label: 'margem em mm', type: 'number', value: 10, min: 0, max: 40 }
      ],
      async run(files, opts, ctx) {
        const { jsPDF } = await lib('jspdf');
        const margin = Math.max(0, Number(opts.margin) || 0);
        let doc = null;

        for (let i = 0; i < files.length; i++) {
          ctx.progress(Math.round((i / files.length) * 90));
          const img = await loadImage(files[i]);
          const canvas = drawImage(img, {});
          const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
          const landscape = opts.orientation === 'l' ||
            (opts.orientation === 'auto' && canvas.width > canvas.height);

          if (opts.fit === 'image') {
            const pageW = canvas.width * 0.2646;   // px -> mm a 96dpi
            const pageH = canvas.height * 0.2646;
            if (!doc) doc = new jsPDF({ unit: 'mm', format: [pageW, pageH], orientation: pageW > pageH ? 'l' : 'p' });
            else doc.addPage([pageW, pageH], pageW > pageH ? 'l' : 'p');
            doc.addImage(dataUrl, 'JPEG', 0, 0, pageW, pageH);
            continue;
          }

          const format = opts.fit === 'letter' ? 'letter' : 'a4';
          if (!doc) doc = new jsPDF({ unit: 'mm', format, orientation: landscape ? 'l' : 'p' });
          else doc.addPage(format, landscape ? 'l' : 'p');

          const pageW = doc.internal.pageSize.getWidth();
          const pageH = doc.internal.pageSize.getHeight();
          const maxW = pageW - margin * 2;
          const maxH = pageH - margin * 2;
          const ratio = Math.min(maxW / canvas.width, maxH / canvas.height);
          const w = canvas.width * ratio;
          const h = canvas.height * ratio;
          doc.addImage(dataUrl, 'JPEG', margin + (maxW - w) / 2, margin + (maxH - h) / 2, w, h);
        }

        const name = files.length === 1 ? F.rename(files[0].name, 'pdf') : 'imagens.pdf';
        return out(name, doc.output('blob'), null, 'binary');
      }
    },

    {
      id: 'svg2png', from: 'SVG', to: 'PNG', cat: 'img', icon: '🔺',
      desc: 'Rasteriza SVG em PNG na largura que você escolher',
      accept: '.svg,image/svg+xml', multiple: true,
      options: [
        { id: 'width', label: 'largura em px', type: 'number', value: 1024, min: 16, max: 8000 },
        { id: 'bg', label: 'fundo', type: 'select', value: '', options: [
          { value: '', label: 'Transparente' }, { value: '#ffffff', label: 'Branco' }, { value: '#000000', label: 'Preto' }] }
      ],
      async run(file, opts) {
        const svgText = await file.text();
        const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
        const svg = doc.documentElement;
        const viewBox = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
        const naturalW = parseFloat(svg.getAttribute('width')) || (viewBox.length === 4 ? viewBox[2] : 300);
        const naturalH = parseFloat(svg.getAttribute('height')) || (viewBox.length === 4 ? viewBox[3] : 150);
        const width = Math.max(16, Number(opts.width) || 1024);
        const height = Math.round(width * (naturalH / naturalW));

        const img = await loadImage(new File([svgText], file.name, { type: 'image/svg+xml' }));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx2d = canvas.getContext('2d');
        if (opts.bg) { ctx2d.fillStyle = opts.bg; ctx2d.fillRect(0, 0, width, height); }
        ctx2d.drawImage(img, 0, 0, width, height);
        return out(F.rename(file.name, 'png'), await canvasToBlob(canvas, 'image/png'), null, 'image');
      }
    },

    {
      id: 'img2ico', from: 'IMG', to: 'ICO', cat: 'img', icon: '⭐',
      desc: 'Cria favicon .ico com vários tamanhos embutidos',
      accept: 'image/*',
      options: [
        { id: 'sizes', label: 'tamanhos', type: 'select', value: '16,32,48,64,128,256', options: [
          { value: '16,32,48', label: '16 / 32 / 48 (clássico)' },
          { value: '16,32,48,64,128,256', label: '16 até 256 (completo)' },
          { value: '32', label: 'só 32×32' }] }
      ],
      async run(file, opts) {
        const img = await loadImage(file);
        const sizes = String(opts.sizes || '16,32,48').split(',').map(Number).filter(Boolean);
        const pngs = [];
        for (const size of sizes) {
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = size;
          canvas.getContext('2d').drawImage(img, 0, 0, size, size);
          pngs.push({ size, data: new Uint8Array(await (await canvasToBlob(canvas, 'image/png')).arrayBuffer()) });
        }

        const header = 6 + pngs.length * 16;
        const total = header + pngs.reduce((sum, p) => sum + p.data.length, 0);
        const buffer = new ArrayBuffer(total);
        const view = new DataView(buffer);
        const all = new Uint8Array(buffer);
        view.setUint16(0, 0, true);            // reservado
        view.setUint16(2, 1, true);            // tipo 1 = ícone
        view.setUint16(4, pngs.length, true);  // quantidade

        let offset = header;
        pngs.forEach((png, i) => {
          const entry = 6 + i * 16;
          all[entry] = png.size >= 256 ? 0 : png.size;
          all[entry + 1] = png.size >= 256 ? 0 : png.size;
          all[entry + 2] = 0;                  // paleta
          all[entry + 3] = 0;                  // reservado
          view.setUint16(entry + 4, 1, true);  // planos
          view.setUint16(entry + 6, 32, true); // bits por pixel
          view.setUint32(entry + 8, png.data.length, true);
          view.setUint32(entry + 12, offset, true);
          all.set(png.data, offset);
          offset += png.data.length;
        });

        return out(F.rename(file.name, 'ico'), bytes(all, 'image/x-icon'), null, 'binary');
      }
    },

    {
      id: 'file2b64', from: 'ARQ', to: 'B64', cat: 'img', icon: '🔐',
      desc: 'Qualquer arquivo em Base64 / Data URL (ótimo para CSS e HTML)',
      accept: '', multiple: true,
      options: [
        { id: 'format', label: 'formato', type: 'select', value: 'dataurl', options: [
          { value: 'dataurl', label: 'Data URL (data:...;base64,...)' },
          { value: 'raw', label: 'Só a string Base64' },
          { value: 'css', label: 'Regra CSS pronta (background-image)' }] }
      ],
      async run(file, opts) {
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error('não consegui ler o arquivo'));
          reader.readAsDataURL(file);
        });
        let text = dataUrl;
        if (opts.format === 'raw') text = dataUrl.split(',')[1] || '';
        if (opts.format === 'css') text = '.imagem {\n  background-image: url("' + dataUrl + '");\n}\n';
        return textResult(file.name + '.base64.txt', text);
      }
    },

    {
      id: 'b642file', from: 'B64', to: 'ARQ', cat: 'img', icon: '🔓',
      desc: 'Volta de Base64 / Data URL para o arquivo original',
      accept: '.txt,.b64,.base64,text/plain',
      options: [{ id: 'name', label: 'nome do arquivo de saída', type: 'text', placeholder: 'detectar automaticamente' }],
      async run(file, opts) {
        const raw = (await file.text()).trim();
        const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(raw);
        const mime = match && match[1] ? match[1] : 'application/octet-stream';
        const payload = (match ? match[3] : raw).replace(/\s+/g, '');
        let binary;
        try {
          binary = atob(payload);
        } catch (err) {
          throw new Error('conteúdo não parece Base64 válido');
        }
        const array = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
        const guessed = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif',
          'application/pdf': 'pdf', 'image/svg+xml': 'svg', 'text/plain': 'txt' }[mime] || 'bin';
        const base = F.rename(file.name, '').replace(/\.(b64|base64)$/i, '');
        const name = opts.name || (base.toLowerCase().endsWith('.' + guessed) ? base : base + '.' + guessed);
        return out(name, bytes(array, mime), null, mime.startsWith('image/') ? 'image' : 'binary');
      }
    },

    // ═══ TEXTO E UTILIDADES ═══
    {
      id: 'srt2vtt', from: 'SRT', to: 'VTT', cat: 'texto', icon: '💬',
      desc: 'Legenda SRT para WebVTT (usado em <track> do HTML5)',
      accept: '.srt,.sub,text/plain', multiple: true,
      options: [],
      async run(file) {
        return textResult(F.rename(file.name, 'vtt'), F.srtToVtt(await file.text()), 'text/vtt;charset=utf-8');
      }
    },

    {
      id: 'vtt2srt', from: 'VTT', to: 'SRT', cat: 'texto', icon: '💬',
      desc: 'WebVTT para SRT, renumerando as legendas',
      accept: '.vtt,text/vtt', multiple: true,
      options: [],
      async run(file) {
        return textResult(F.rename(file.name, 'srt'), F.vttToSrt(await file.text()), 'application/x-subrip');
      }
    },

    {
      id: 'case', from: 'TXT', to: 'TXT', cat: 'texto', icon: '🔠',
      desc: 'Troca a caixa do texto: MAIÚSCULA, snake_case, camelCase…',
      accept: '.txt,.md,.csv,text/plain', multiple: true,
      options: [
        { id: 'mode', label: 'estilo', type: 'select', value: 'upper', options: [
          { value: 'upper', label: 'MAIÚSCULAS' }, { value: 'lower', label: 'minúsculas' },
          { value: 'title', label: 'Título' }, { value: 'sentence', label: 'Frase' },
          { value: 'camel', label: 'camelCase' }, { value: 'pascal', label: 'PascalCase' },
          { value: 'snake', label: 'snake_case' }, { value: 'kebab', label: 'kebab-case' },
          { value: 'slug', label: 'slug-para-url' }] }
      ],
      async run(file, opts) {
        const text = F.changeCase(await file.text(), opts.mode || 'upper');
        return textResult(F.rename(file.name, '') + '-' + (opts.mode || 'upper') + '.txt', text);
      }
    },

    {
      id: 'txtstats', from: 'TXT', to: 'TXT', cat: 'texto', icon: '📈',
      desc: 'Relatório do texto: palavras, linhas e palavras mais usadas',
      accept: '.txt,.md,text/plain',
      options: [{ id: 'top', label: 'quantas palavras no ranking', type: 'number', value: 20, min: 5, max: 100 }],
      async run(file, opts) {
        const text = await file.text();
        const stats = F.textStats(text);
        const counts = new Map();
        for (const word of text.toLowerCase().match(/[\p{L}\p{N}'-]+/gu) || []) {
          if (word.length < 3) continue;
          counts.set(word, (counts.get(word) || 0) + 1);
        }
        const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, Number(opts.top) || 20);
        const report =
          'Relatório — ' + file.name + '\n' +
          '='.repeat(40) + '\n' +
          Object.entries(stats).map(([k, v]) => k.padEnd(24, '.') + ' ' + v).join('\n') +
          '\n\nPalavras mais frequentes\n' + '-'.repeat(40) + '\n' +
          top.map(([w, n], i) => String(i + 1).padStart(3) + '. ' + w.padEnd(22, '.') + ' ' + n).join('\n') + '\n';
        return textResult(F.rename(file.name, '') + '-relatorio.txt', report);
      }
    },

    {
      id: 'hash', from: 'ARQ', to: 'HASH', cat: 'texto', icon: '🔎',
      desc: 'Calcula SHA-1 / SHA-256 / SHA-512 para conferir integridade',
      accept: '', multiple: true,
      options: [
        { id: 'algo', label: 'algoritmo', type: 'select', value: 'all', options: [
          { value: 'all', label: 'Todos' }, { value: 'SHA-256', label: 'SHA-256' },
          { value: 'SHA-1', label: 'SHA-1' }, { value: 'SHA-512', label: 'SHA-512' }] }
      ],
      async run(file, opts) {
        const buffer = await file.arrayBuffer();
        const algos = opts.algo === 'all' || !opts.algo ? ['SHA-1', 'SHA-256', 'SHA-512'] : [opts.algo];
        const lines = [file.name, 'tamanho: ' + F.humanSize(file.size) + ' (' + file.size + ' bytes)', ''];
        for (const algo of algos) {
          const digest = await crypto.subtle.digest(algo, buffer);
          const hex = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
          lines.push(algo.padEnd(8) + ' ' + hex);
        }
        return textResult(file.name + '.hash.txt', lines.join('\n') + '\n');
      }
    },

    {
      id: 'zip', from: 'ARQS', to: 'ZIP', cat: 'texto', icon: '🗜️',
      desc: 'Compacta os arquivos selecionados em um único .zip',
      accept: '', batch: true, multiple: true,
      options: [
        { id: 'name', label: 'nome do zip', type: 'text', value: 'arquivos', placeholder: 'arquivos' },
        { id: 'level', label: 'compressão', type: 'select', value: '6', options: [
          { value: '0', label: 'Nenhuma (mais rápido)' }, { value: '6', label: 'Padrão' }, { value: '9', label: 'Máxima' }] }
      ],
      async run(files, opts, ctx) {
        const JSZip = await lib('jszip');
        const zip = new JSZip();
        files.forEach(file => zip.file(file.name, file));
        const level = Number(opts.level);
        const blob = await zip.generateAsync({
          type: 'blob',
          compression: level === 0 ? 'STORE' : 'DEFLATE',
          compressionOptions: { level: level || 6 }
        }, meta => ctx.progress(Math.round(meta.percent)));
        return out((opts.name || 'arquivos') + '.zip', blob, null, 'binary');
      }
    }
  ];

  // ── auxiliares usados por conversores acima ──────────────────────────
  function xmlNodeToJson(node) {
    const result = {};
    for (const attr of node.attributes || []) result['@' + attr.name] = attr.value;

    const children = [...node.childNodes].filter(n =>
      n.nodeType === 1 || (n.nodeType === 3 && n.textContent.trim()));

    if (!children.length) return Object.keys(result).length ? result : '';
    if (children.length === 1 && children[0].nodeType === 3) {
      const text = children[0].textContent.trim();
      if (!Object.keys(result).length) return text;
      result['#text'] = text;
      return result;
    }

    for (const child of children) {
      if (child.nodeType === 3) { result['#text'] = (result['#text'] || '') + child.textContent.trim(); continue; }
      const value = xmlNodeToJson(child);
      if (result[child.nodeName] === undefined) result[child.nodeName] = value;
      else if (Array.isArray(result[child.nodeName])) result[child.nodeName].push(value);
      else result[child.nodeName] = [result[child.nodeName], value];
    }
    return result;
  }

  function htmlNodeToMarkdown(node, depth) {
    const level = depth || 0;
    let md = '';
    for (const child of node.childNodes) {
      if (child.nodeType === 3) { md += child.textContent.replace(/\s+/g, ' '); continue; }
      if (child.nodeType !== 1) continue;
      const tag = child.tagName.toLowerCase();
      const inner = () => htmlNodeToMarkdown(child, level).trim();

      switch (tag) {
        case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
          md += '\n\n' + '#'.repeat(Number(tag[1])) + ' ' + inner() + '\n\n'; break;
        case 'p': md += '\n\n' + inner() + '\n\n'; break;
        case 'br': md += '\n'; break;
        case 'hr': md += '\n\n---\n\n'; break;
        case 'strong': case 'b': md += '**' + inner() + '**'; break;
        case 'em': case 'i': md += '*' + inner() + '*'; break;
        case 'del': case 's': md += '~~' + inner() + '~~'; break;
        case 'code':
          md += child.closest('pre') ? inner() : '`' + child.textContent + '`'; break;
        case 'pre':
          md += '\n\n```\n' + child.textContent.replace(/\n+$/, '') + '\n```\n\n'; break;
        case 'blockquote':
          md += '\n\n' + inner().split('\n').map(l => '> ' + l).join('\n') + '\n\n'; break;
        case 'a': {
          const href = child.getAttribute('href') || '';
          const label = inner() || href;
          md += href ? '[' + label + '](' + href + ')' : label;
          break;
        }
        case 'img': {
          const src = child.getAttribute('src') || '';
          md += '![' + (child.getAttribute('alt') || '') + '](' + src + ')';
          break;
        }
        case 'ul': case 'ol': {
          const ordered = tag === 'ol';
          const items = [...child.children].filter(el => el.tagName.toLowerCase() === 'li');
          md += '\n\n' + items.map((li, i) => {
            const prefix = '  '.repeat(level) + (ordered ? (i + 1) + '. ' : '- ');
            return prefix + htmlNodeToMarkdown(li, level + 1).trim().replace(/\n/g, '\n' + '  '.repeat(level + 1));
          }).join('\n') + '\n\n';
          break;
        }
        case 'table': {
          const rows = [...child.querySelectorAll('tr')];
          if (!rows.length) break;
          const cells = tr => [...tr.children].map(td => htmlNodeToMarkdown(td, level).trim().replace(/\|/g, '\\|'));
          const head = cells(rows[0]);
          md += '\n\n| ' + head.join(' | ') + ' |\n| ' + head.map(() => '---').join(' | ') + ' |\n' +
            rows.slice(1).map(tr => '| ' + cells(tr).join(' | ') + ' |').join('\n') + '\n\n';
          break;
        }
        case 'script': case 'style': break;
        default: md += htmlNodeToMarkdown(child, level);
      }
    }
    return md;
  }

  const byCategory = {
    docs: { label: 'Documentos', icon: '📄' },
    dados: { label: 'Dados & planilhas', icon: '📊' },
    img: { label: 'Imagens', icon: '🖼️' },
    texto: { label: 'Texto & utilidades', icon: '🧰' }
  };

  root.CONVRT.converters = converters;
  root.CONVRT.categories = byCategory;
  root.CONVRT.get = id => converters.find(c => c.id === id) || null;
})(window);
