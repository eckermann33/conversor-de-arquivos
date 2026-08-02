/**
 * CONVRT — carregador preguiçoso de bibliotecas externas.
 *
 * Nenhuma lib é baixada no load da página: cada conversor pede a sua com
 * `await lib('jspdf')` só na hora de converter. Cada lib tem uma URL primária
 * (jsDelivr) e uma alternativa (cdnjs) — se a primeira falhar, tenta a segunda.
 */
(function (root) {
  'use strict';

  const V = {
    jspdf: '2.5.1',
    pdfjs: '3.11.174',
    jszip: '3.10.1',
    xlsx: '0.18.5',
    jsyaml: '4.1.0',
    pdflib: '1.17.1'
  };

  const LIBS = {
    jspdf: {
      global: 'jspdf',
      label: 'jsPDF',
      urls: [
        'https://cdn.jsdelivr.net/npm/jspdf@' + V.jspdf + '/dist/jspdf.umd.min.js',
        'https://cdnjs.cloudflare.com/ajax/libs/jspdf/' + V.jspdf + '/jspdf.umd.min.js'
      ]
    },
    pdfjs: {
      global: 'pdfjsLib',
      label: 'PDF.js',
      urls: [
        'https://cdn.jsdelivr.net/npm/pdfjs-dist@' + V.pdfjs + '/build/pdf.min.js',
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/' + V.pdfjs + '/pdf.min.js'
      ],
      after(lib, usedIndex) {
        const worker = usedIndex === 0
          ? 'https://cdn.jsdelivr.net/npm/pdfjs-dist@' + V.pdfjs + '/build/pdf.worker.min.js'
          : 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/' + V.pdfjs + '/pdf.worker.min.js';
        lib.GlobalWorkerOptions.workerSrc = worker;
      }
    },
    jszip: {
      global: 'JSZip',
      label: 'JSZip',
      urls: [
        'https://cdn.jsdelivr.net/npm/jszip@' + V.jszip + '/dist/jszip.min.js',
        'https://cdnjs.cloudflare.com/ajax/libs/jszip/' + V.jszip + '/jszip.min.js'
      ]
    },
    xlsx: {
      global: 'XLSX',
      label: 'SheetJS',
      urls: [
        'https://cdn.jsdelivr.net/npm/xlsx@' + V.xlsx + '/dist/xlsx.full.min.js',
        'https://cdnjs.cloudflare.com/ajax/libs/xlsx/' + V.xlsx + '/xlsx.full.min.js'
      ]
    },
    jsyaml: {
      global: 'jsyaml',
      label: 'js-yaml',
      urls: [
        'https://cdn.jsdelivr.net/npm/js-yaml@' + V.jsyaml + '/dist/js-yaml.min.js',
        'https://cdnjs.cloudflare.com/ajax/libs/js-yaml/' + V.jsyaml + '/js-yaml.min.js'
      ]
    },
    pdflib: {
      global: 'PDFLib',
      label: 'pdf-lib',
      urls: [
        'https://cdn.jsdelivr.net/npm/pdf-lib@' + V.pdflib + '/dist/pdf-lib.min.js',
        'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/' + V.pdflib + '/pdf-lib.min.js'
      ]
    }
  };

  const cache = new Map();

  function loadScript(url) {
    return new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = url;
      el.async = true;
      el.onload = () => resolve(url);
      el.onerror = () => { el.remove(); reject(new Error('falha ao carregar ' + url)); };
      document.head.appendChild(el);
    });
  }

  /**
   * @param {string} name chave em LIBS
   * @returns {Promise<*>} o objeto global da lib já pronto para uso
   */
  function lib(name) {
    const spec = LIBS[name];
    if (!spec) return Promise.reject(new Error('biblioteca desconhecida: ' + name));
    if (root[spec.global]) return Promise.resolve(root[spec.global]);
    if (cache.has(name)) return cache.get(name);

    const promise = (async () => {
      let lastError = null;
      for (let i = 0; i < spec.urls.length; i++) {
        try {
          await loadScript(spec.urls[i]);
          const loaded = root[spec.global];
          if (!loaded) throw new Error(spec.global + ' não ficou disponível');
          if (spec.after) spec.after(loaded, i);
          return loaded;
        } catch (err) {
          lastError = err;
        }
      }
      cache.delete(name);
      throw new Error(
        'Não consegui carregar ' + spec.label + '. Essa conversão precisa de internet ' +
        'na primeira vez (depois fica em cache). Detalhe: ' + (lastError && lastError.message)
      );
    })();

    cache.set(name, promise);
    return promise;
  }

  /** Pré-carrega libs em segundo plano, sem quebrar se estiver offline. */
  function preload(names) {
    for (const name of names) lib(name).catch(() => {});
  }

  root.CONVRT = root.CONVRT || {};
  root.CONVRT.lib = lib;
  root.CONVRT.preload = preload;
  root.CONVRT.libVersions = V;
})(window);
