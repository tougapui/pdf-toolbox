/* PDF 工具箱 v2：所有原始檔案均由使用者瀏覽器本機讀取、處理。 */
(function () {
  'use strict';

  const TOOLS = {
    merge: { title: '合併 PDF', group: '頁面管理', desc: '將多份 PDF 合成一份，也能從頁面預覽中調整順序或移除不需要的頁面。', multi: true, image: false, verb: '合併並下載 PDF', instruction: '預設保留所有頁面。點一下縮圖可取消選取，拖曳可調整合併後的頁面順序。', groupReorder: true },
    split: { title: '拆分／擷取頁面', group: '頁面管理', desc: '上傳 PDF 後，直接勾選要拆出的頁面，再選 PDF、JPG 或 PNG。', multi: false, image: false, verb: '下載選取頁面', instruction: '點選要擷取的頁面；可用「全選」或「全部取消」快速調整。', groupReorder: false },
    organize: { title: '整理 PDF', group: '頁面管理', desc: '拖曳重新排序、旋轉、複製或刪除頁面，整理好後下載新 PDF。', multi: true, image: false, verb: '下載整理後 PDF', instruction: '拖曳縮圖可重排；縮圖下方可旋轉、複製或刪除頁面。', groupReorder: true },
    rotate: { title: '旋轉 PDF', group: '頁面管理', desc: '勾選頁面後，按上方旋轉按鈕。每次只把選取頁面向左旋轉 90°。', multi: false, image: false, verb: '下載旋轉後 PDF', instruction: '勾選要旋轉的頁面，按「↶ 向左旋轉 90°」；可全選、全部取消，也能分批旋轉。', groupReorder: false },
    number: { title: '新增頁碼', group: '頁面管理', desc: '選擇要加上頁碼的頁面及顯示位置，原始 PDF 內容不變。', multi: false, image: false, verb: '下載加頁碼 PDF', instruction: '勾選要加頁碼的頁面，並在下方調整頁碼位置。', groupReorder: false },
    'pdf-images': { title: 'PDF 轉圖片', group: '格式轉換', desc: '勾選 PDF 頁面並轉為 JPG 或 PNG，多頁會打包成 ZIP。', multi: false, image: false, verb: '下載圖片', instruction: '直接勾選要轉換的頁面，並在下方選擇圖片格式。', groupReorder: false },
    'images-pdf': { title: '圖片轉 PDF', group: '格式轉換', desc: '將 JPG、PNG、WebP 圖片變成 PDF，每張圖片就是一頁。', multi: true, image: true, verb: '下載 PDF', instruction: '可拖曳調整圖片順序，點縮圖取消不需要加入 PDF 的圖片。', groupReorder: true },
    extract: { title: '擷取 PDF 文字', group: '格式轉換', desc: '勾選頁面並將 PDF 內可選取的文字匯出為 TXT。', multi: false, image: false, verb: '下載 TXT', instruction: '勾選要擷取的頁面。掃描照片型 PDF 無法辨識文字。', groupReorder: false },
    watermark: { title: '加浮水印', group: '文件處理', desc: '在指定頁面加入文字浮水印，保留 PDF 原有文字與版面。', multi: false, image: false, verb: '下載加浮水印 PDF', instruction: '勾選要加浮水印的頁面，並在下方輸入浮水印文字。', groupReorder: false },
    compress: { title: '壓縮 PDF', group: '文件處理', desc: '選擇保留文字的基本最佳化，或掃描／照片專用的影像壓縮，並比較輸出大小。', multi: false, image: false, verb: '壓縮 PDF', instruction: '預設保留所有頁面。保留文字模式不保證縮小；影像型壓縮可能大幅減少掃描文件大小，但會失去可選取文字。', groupReorder: false }
  };

  const state = {
    tool: 'merge', sources: [], pages: [], busy: false,
    fileToken: 0, pageSerial: 0, sourceSerial: 0,
    outputFormat: 'pdf', splitSeparate: false,
    thumbObserver: null, thumbQueue: [], thumbRunning: 0,
    thumbURLs: new Map(), dragId: null
  };
  const $ = function (id) { return document.getElementById(id); };
  const els = {
    nav: $('toolNav'), title: $('toolTitle'), desc: $('toolDescription'), crumb: $('breadcrumbTool'),
    reset: $('resetBtn'), upload: $('uploadZone'), input: $('fileInput'), browse: $('browseButton'),
    uploadTitle: $('uploadTitle'), uploadHelp: $('uploadHelp'), workspace: $('workspace'),
    fileHeading: $('fileHeading'), fileSummary: $('fileSummary'), chips: $('fileChips'),
    add: $('addFilesBtn'), clear: $('removeAllBtn'),
    pageSummary: $('pageSummary'), grid: $('pageGrid'), empty: $('emptyPages'),
    instruction: $('instruction'), all: $('selectAll'), none: $('selectNone'), rotateSelected: $('rotateSelected'),
    thumbSize: $('thumbSize'), settings: $('settings'), settingsTitle: $('settingsTitle'),
    settingsSub: $('settingsSub'), settingsFields: $('settingsFields'),
    feedback: $('feedback'), actionBar: $('actionBar'), selected: $('selectedCount'),
    actionHint: $('actionHint'), run: $('processButton'), runText: $('processText')
  };

  function tool() { return TOOLS[state.tool]; }
  function countSelected() { return state.pages.reduce(function (n, p) { return n + (p.selected ? 1 : 0); }, 0); }
  function sourceFor(page) { return state.sources.find(function (src) { return src.id === page.sourceId; }); }
  function filename(file) { return file.name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_').slice(0, 75) || 'PDF'; }
  function bytesLabel(size) { return size >= 1048576 ? (size / 1048576).toFixed(1) + ' MB' : size >= 1024 ? Math.round(size / 1024) + ' KB' : size + ' B'; }
  function uniqueId() { state.pageSerial += 1; return 'page-' + state.pageSerial; }
  function valid(file) { return tool().image ? /\.(jpg|jpeg|png|webp)$/i.test(file.name) : /\.pdf$/i.test(file.name); }

  function message(text, type) {
    els.feedback.hidden = false;
    els.feedback.className = 'feedback' + (type ? ' ' + type : '');
    els.feedback.textContent = text;
  }
  function clearMessage() { els.feedback.hidden = true; els.feedback.textContent = ''; }
  function ready() {
    if (!window.PDFLib || !window.pdfjsLib || !window.JSZip) {
      message('必要的 PDF 程式庫尚未載入。請確認網路連線，再重新整理網頁。', 'error');
      return false;
    }
    return true;
  }
  function setBusy(busy) {
    state.busy = busy;
    els.upload.setAttribute('aria-disabled', String(busy));
    els.add.disabled = busy; els.clear.disabled = busy; els.reset.disabled = busy;
    updateAction();
  }
  function newPage(sourceId, index) {
    return { id: uniqueId(), sourceId: sourceId, index: index, selected: state.tool !== 'split' && state.tool !== 'rotate', turn: 0 };
  }
  function revokeThumbnails() {
    if (state.thumbObserver) { state.thumbObserver.disconnect(); state.thumbObserver = null; }
    state.thumbQueue = [];
    state.thumbURLs.forEach(function (url) { URL.revokeObjectURL(url); });
    state.thumbURLs.clear();
  }
  function dispose() {
    state.fileToken += 1;
    revokeThumbnails();
    state.sources.forEach(function (src) {
      if (src.previewURL) URL.revokeObjectURL(src.previewURL);
      if (src.pdfjs) { try { src.pdfjs.destroy(); } catch (_) {} }
    });
    state.sources = []; state.pages = [];
    els.input.value = '';
    clearMessage();
  }
  function chooseTool(name) {
    if (state.busy || !TOOLS[name]) return;
    dispose();
    state.tool = name;
    state.outputFormat = name === 'pdf-images' ? 'jpg' : 'pdf';
    state.splitSeparate = false;
    els.title.textContent = tool().title;
    els.desc.textContent = tool().desc;
    els.crumb.textContent = tool().group;
    els.instruction.textContent = tool().instruction;
    els.uploadTitle.textContent = tool().image ? '選擇圖片檔案' : '選擇 PDF 檔案';
    els.uploadHelp.textContent = tool().image ? '支援 JPG、PNG、WebP；可直接按 Ctrl + V／⌘ + V 貼上圖片' : tool().multi ? '可一次選取多份 PDF' : '支援 PDF 格式';
    els.input.accept = tool().image ? '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp' : '.pdf,application/pdf';
    els.input.multiple = tool().multi;
    els.add.hidden = !tool().multi;
    els.all.hidden = false;
    els.none.hidden = false;
    els.rotateSelected.hidden = name !== 'rotate';
    const toolDivider = document.querySelector('.toolbar-divider');
    if (toolDivider) toolDivider.hidden = false;
    document.querySelectorAll('.nav-item').forEach(function (btn) {
      const active = btn.dataset.tool === name;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
    settingsForTool();
    render();
  }

  async function uploadFiles(files) {
    if (state.busy || !files || !files.length) return;
    if (!ready()) return;
    const incoming = Array.from(files).filter(valid);
    if (!incoming.length) { message('檔案格式不支援。請選擇' + (tool().image ? ' JPG、PNG 或 WebP 圖片。' : ' PDF 檔案。'), 'error'); return; }
    const batch = tool().multi ? incoming : incoming.slice(0, 1);
    if (!tool().multi) dispose();
    const token = ++state.fileToken;
    setBusy(true);
    message('正在讀取檔案及準備頁面預覽…', 'busy');
    let failed = 0;
    try {
      for (let i = 0; i < batch.length; i += 1) {
        if (token !== state.fileToken) break;
        const file = batch[i];
        if (file.size > 200 * 1024 * 1024) { failed += 1; continue; }
        const source = { id: 'source-' + (++state.sourceSerial), file: file, pages: 1, pdfjs: null, previewURL: null, type: tool().image ? 'image' : 'pdf' };
        try {
          if (source.type === 'pdf') {
            const task = pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
            source.pdfjs = await task.promise;
            source.pages = source.pdfjs.numPages;
            if (!source.pages) throw new Error('這份 PDF 沒有頁面。');
          } else {
            source.previewURL = URL.createObjectURL(file);
            await verifyImage(source.previewURL);
          }
          state.sources.push(source);
          for (let p = 0; p < source.pages; p += 1) state.pages.push(newPage(source.id, p));
        } catch (err) {
          failed += 1;
          if (source.previewURL) URL.revokeObjectURL(source.previewURL);
          if (source.pdfjs) { try { source.pdfjs.destroy(); } catch (_) {} }
          console.warn('無法讀取檔案：', file.name, err);
        }
      }
      if (failed) message('有 ' + failed + ' 份檔案無法讀取（可能加密、格式不符或超過 200 MB）。其他檔案仍可使用。', 'error');
      else clearMessage();
    } finally {
      setBusy(false);
      els.input.value = '';
      render();
    }
  }
  function verifyImage(url) {
    return new Promise(function (resolve, reject) {
      const img = new Image();
      img.onload = function () { resolve(); };
      img.onerror = function () { reject(new Error('無法讀取圖片')); };
      img.src = url;
    });
  }
  function removeSource(id) {
    if (state.busy) return;
    const source = state.sources.find(function (src) { return src.id === id; });
    if (!source) return;
    state.pages = state.pages.filter(function (p) { return p.sourceId !== id; });
    state.sources = state.sources.filter(function (src) { return src.id !== id; });
    if (source.previewURL) URL.revokeObjectURL(source.previewURL);
    if (source.pdfjs) { try { source.pdfjs.destroy(); } catch (_) {} }
    revokeThumbnails();
    clearMessage();
    render();
  }

  function render() {
    const has = state.sources.length > 0;
    els.upload.hidden = has;
    els.workspace.hidden = !has;
    els.settings.hidden = !has || !els.settingsFields.firstElementChild || !els.settingsFields.firstElementChild.childElementCount;
    els.actionBar.hidden = !has;
    els.reset.hidden = !has;
    if (!has) { els.input.value = ''; updateAction(); return; }
    els.fileSummary.textContent = state.sources.length + ' 個檔案';
    els.chips.replaceChildren();
    state.sources.forEach(function (src) {
      const chip = document.createElement('div'); chip.className = 'file-chip';
      const name = document.createElement('span'); name.className = 'file-chip-name'; name.title = src.file.name; name.textContent = src.file.name;
      const size = document.createElement('small'); size.textContent = bytesLabel(src.file.size);
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'chip-remove'; remove.textContent = '×'; remove.setAttribute('aria-label', '移除 ' + src.file.name);
      remove.addEventListener('click', function () { removeSource(src.id); });
      chip.append(name, size, remove); els.chips.append(chip);
    });
    renderPages();
    updateAction();
  }
  function renderPages() {
    if (state.thumbObserver) state.thumbObserver.disconnect();
    const fragment = document.createDocumentFragment();
    const reorderable = tool().groupReorder;
    state.pages.forEach(function (p, i) {
      const source = sourceFor(p); if (!source) return;
      const card = document.createElement('article');
      card.className = 'page-card' + (p.selected ? ' selected' : '') + (state.tool === 'rotate' ? ' rotate-page-card' : '');
      card.dataset.pageId = p.id;
      card.draggable = reorderable;
      const preview = document.createElement('div'); preview.className = 'page-preview';
      const rotateMode = state.tool === 'rotate';
      preview.setAttribute('role', 'button'); preview.tabIndex = 0;
      preview.setAttribute('aria-label', '第 ' + (p.index + 1) + ' 頁，' + (p.selected ? '已選取' : '未選取') + '，點擊切換選取');
      const mark = document.createElement('span'); mark.className = 'selection-check'; mark.textContent = '✓';
      const placeholder = document.createElement('span'); placeholder.className = 'page-placeholder'; placeholder.textContent = '預覽載入中…';
      preview.append(mark, placeholder);
      function toggle() { if (!state.busy) { p.selected = !p.selected; renderPages(); updateAction(); } }
      preview.addEventListener('click', toggle);
      preview.addEventListener('keydown', function (event) { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(); } });
      const meta = document.createElement('div'); meta.className = 'page-meta';
      const num = document.createElement('span');
      const turnLabel = rotateMode ? (p.turn === 270 ? ' · 左轉 90°' : p.turn === 180 ? ' · 旋轉 180°' : p.turn === 90 ? ' · 右轉 90°' : '') : (p.turn ? ' · ' + p.turn + '°' : '');
      num.textContent = '第 ' + (p.index + 1) + ' 頁' + turnLabel;
      const from = document.createElement('span'); from.className = 'page-source'; from.textContent = state.sources.length > 1 ? filename(source.file).slice(0, 11) : (i + 1) + ' / ' + state.pages.length;
      meta.append(num, from);
      card.append(preview, meta);
      if (state.tool === 'organize') {
        const actions = document.createElement('div'); actions.className = 'page-card-actions';
        actions.append(pageAction('↻', '順時針旋轉 90 度', function () { p.turn = (p.turn + 90) % 360; renderPages(); }, false));
        actions.append(pageAction('⧉', '複製這一頁', function () { state.pages.splice(i + 1, 0, { id: uniqueId(), sourceId: p.sourceId, index: p.index, selected: true, turn: p.turn }); renderPages(); updateAction(); }, false));
        actions.append(pageAction('×', '刪除這一頁', function () { state.pages.splice(i, 1); renderPages(); updateAction(); }, true));
        card.append(actions);
      }
      if (reorderable) {
        card.addEventListener('dragstart', function (ev) {
          if (state.busy) return ev.preventDefault();
          state.dragId = p.id; card.classList.add('dragging');
          if (ev.dataTransfer) { ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', p.id); }
        });
        card.addEventListener('dragover', function (ev) { ev.preventDefault(); card.classList.add('dragover'); });
        card.addEventListener('dragleave', function () { card.classList.remove('dragover'); });
        card.addEventListener('drop', function (ev) {
          ev.preventDefault(); card.classList.remove('dragover');
          const from = state.pages.findIndex(function (a) { return a.id === state.dragId; });
          const to = state.pages.findIndex(function (a) { return a.id === p.id; });
          if (from >= 0 && to >= 0 && from !== to) {
            const moved = state.pages.splice(from, 1)[0];
            state.pages.splice(to, 0, moved);
            renderPages();
          }
        });
        card.addEventListener('dragend', function () { state.dragId = null; card.classList.remove('dragging'); card.classList.remove('dragover'); });
      }
      fragment.append(card);
    });
    els.grid.replaceChildren(fragment);
    els.empty.hidden = state.pages.length > 0;
    els.pageSummary.textContent = state.pages.length + ' 頁';
    if ('IntersectionObserver' in window) {
      state.thumbObserver = new IntersectionObserver(function (entries, obs) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            obs.unobserve(entry.target);
            requestThumbnail(entry.target);
          }
        });
      }, { root: els.grid, rootMargin: '250px' });
      els.grid.querySelectorAll('.page-card').forEach(function (card) { state.thumbObserver.observe(card); });
    } else {
      els.grid.querySelectorAll('.page-card').forEach(requestThumbnail);
    }
  }
  function pageAction(symbol, title, callback, danger) {
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'page-icon-button' + (danger ? ' delete' : '');
    btn.textContent = symbol; btn.title = title; btn.setAttribute('aria-label', title);
    btn.addEventListener('click', function (event) { event.stopPropagation(); if (!state.busy) callback(); });
    return btn;
  }
  function requestThumbnail(card) {
    const id = card.dataset.pageId; const page = state.pages.find(function (p) { return p.id === id; });
    if (!page) return;
    const src = sourceFor(page); if (!src) return;
    const cacheKey = src.id + ':' + page.index;
    const cached = state.thumbURLs.get(cacheKey);
    if (cached || src.previewURL) { insertThumb(card, cached || src.previewURL, page.turn); return; }
    state.thumbQueue.push({ id: id, key: cacheKey, sourceId: src.id, index: page.index });
    pumpThumbnails();
  }
  function insertThumb(card, url, turn) {
    const preview = card.querySelector('.page-preview'); if (!preview || !url) return;
    const image = document.createElement('img'); image.src = url; image.alt = 'PDF 頁面縮圖'; image.loading = 'lazy';
    image.style.transform = 'rotate(' + turn + 'deg) scale(' + (turn % 180 ? 0.75 : 1) + ')';
    const existing = preview.querySelector('img,.page-placeholder'); if (existing) existing.replaceWith(image);
  }
  function pumpThumbnails() {
    while (state.thumbRunning < 3 && state.thumbQueue.length) {
      const task = state.thumbQueue.shift();
      const current = state.sources.find(function (s) { return s.id === task.sourceId; });
      if (!current || !current.pdfjs) continue;
      state.thumbRunning += 1;
      (async function () {
        let canvas = null;
        try {
          const pdfPage = await current.pdfjs.getPage(task.index + 1);
          const base = pdfPage.getViewport({ scale: 1 });
          const scale = Math.min(175 / base.width, 200 / base.height, 1.2);
          const viewport = pdfPage.getViewport({ scale: scale });
          canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.ceil(viewport.width)); canvas.height = Math.max(1, Math.ceil(viewport.height));
          const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
          await pdfPage.render({ canvasContext: ctx, viewport: viewport }).promise;
          const blob = await canvasToBlob(canvas, 'jpeg', .78);
          if (!state.sources.some(function (s) { return s.id === task.sourceId; })) return;
          const url = URL.createObjectURL(blob);
          state.thumbURLs.set(task.key, url);
          const cards = els.grid.querySelectorAll('.page-card');
          cards.forEach(function (card) {
            const id = card.dataset.pageId;
            const p = state.pages.find(function (x) { return x.id === id; });
            if (p && p.sourceId === task.sourceId && p.index === task.index) insertThumb(card, url, p.turn);
          });
          pdfPage.cleanup();
        } catch (err) {
          const card = els.grid.querySelector('[data-page-id="' + task.id + '"]');
          if (card) { const pl = card.querySelector('.page-placeholder'); if (pl) pl.textContent = '無法預覽'; }
          console.warn('縮圖載入失敗：', err);
        } finally {
          if (canvas) { canvas.width = 0; canvas.height = 0; }
          state.thumbRunning -= 1; pumpThumbnails();
        }
      }());
    }
  }

  function setting(label, control) {
    const wrap = document.createElement('div'); wrap.className = 'setting';
    const text = document.createElement('label'); text.textContent = label;
    if (control.id) text.htmlFor = control.id;
    wrap.append(text, control); return wrap;
  }
  function selectField(id, options) {
    const select = document.createElement('select'); select.id = id;
    options.forEach(function (item) {
      const option = document.createElement('option'); option.value = item[0]; option.textContent = item[1]; select.append(option);
    }); return select;
  }
  function textField(id, placeholder, initial) {
    const input = document.createElement('input'); input.type = 'text'; input.id = id; input.placeholder = placeholder; input.value = initial || ''; return input;
  }
  function numberField(id, initial, min, max) {
    const input = document.createElement('input'); input.type = 'number'; input.id = id; input.value = String(initial); input.min = String(min); input.max = String(max); return input;
  }
  function formatPicker(labels) {
    const segmented = document.createElement('div'); segmented.className = 'segmented'; segmented.setAttribute('role', 'group'); segmented.setAttribute('aria-label', '輸出格式');
    labels.forEach(function (item) {
      const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'segment'; btn.dataset.format = item[0]; btn.textContent = item[1];
      btn.setAttribute('aria-pressed', String(state.outputFormat === item[0]));
      btn.addEventListener('click', function () {
        state.outputFormat = item[0];
        segmented.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b === btn)); });
        const separate = $('splitSeparateWrap'); if (separate) separate.hidden = state.outputFormat !== 'pdf';
        updateAction();
      });
      segmented.append(btn);
    }); return segmented;
  }
  function settingsForTool() {
    const fields = document.createElement('div'); fields.className = 'settings-grid';
    els.settingsTitle.textContent = '輸出設定';
    els.settingsSub.textContent = '';
    if (state.tool === 'split') {
      fields.append(setting('輸出格式', formatPicker([['pdf','PDF'],['jpg','JPG'],['png','PNG']])));
      const separate = document.createElement('label'); separate.id = 'splitSeparateWrap'; separate.className = 'checkbox-setting';
      const check = document.createElement('input'); check.type = 'checkbox'; check.id = 'splitSeparate'; check.addEventListener('change', function () { state.splitSeparate = check.checked; updateAction(); });
      separate.append(check, document.createTextNode('每頁存成獨立 PDF（ZIP）')); fields.append(separate);
    } else if (state.tool === 'pdf-images') {
      fields.append(setting('圖片格式', formatPicker([['jpg','JPG'],['png','PNG']])));
      fields.append(setting('解析度', selectField('renderScale', [['1','一般'],['1.5','清晰'],['2','高畫質']])));
      $('toolTitle').textContent = TOOLS[state.tool].title;
    } else if (state.tool === 'images-pdf') {
      fields.append(setting('紙張大小', selectField('paperSize', [['auto','符合原圖比例'],['a4','A4（自動判斷方向）']])));
    } else if (state.tool === 'number') {
      fields.append(setting('頁碼位置', selectField('numberPos', [['bottom','下方置中'],['bottom-right','右下角'],['top','上方置中'],['top-right','右上角']])));
      fields.append(setting('起始頁碼', numberField('numberStart', 1, 0, 999999)));
    } else if (state.tool === 'watermark') {
      const wrap = setting('浮水印文字', textField('watermarkText', '例如：內部使用', '內部使用')); wrap.classList.add('wide'); fields.append(wrap);
      fields.append(setting('深淺', selectField('watermarkOpacity', [['0.12','淡'],['0.22','中'],['0.36','深']])));
      fields.append(setting('方向', selectField('watermarkRotation', [['-35','斜向'],['0','水平']])));
    } else if (state.tool === 'compress') {
      const mode = selectField('compressMode', [
        ['structure','保留文字及版面（基本最佳化）'],
        ['image','掃描文件／圖片型（高壓縮）']
      ]);
      fields.append(setting('壓縮模式', mode));
      const qualitySetting = setting('影像畫質', selectField('compressQuality', [
        ['small','最小檔案（畫質較低）'],
        ['balanced','平衡（建議）'],
        ['clear','畫質優先']
      ]));
      fields.append(qualitySetting);
      const warn = document.createElement('p'); warn.className = 'setting-note warning';
      const updateCompressionMode = function () {
        const isImage = mode.value === 'image';
        qualitySetting.hidden = !isImage;
        warn.textContent = isImage
          ? '影像壓縮會把選取頁面全部轉成圖片，會失去可選取文字、超連結與書籤。適合掃描文件，不適合需保留文字的 PDF；也不保證一定縮小。'
          : '保留文字與向量圖形，僅重新整理 PDF 物件結構。對已壓縮的圖片通常無效，也可能使檔案略微變大；數位簽章及特殊互動功能可能失效。';
        updateAction();
      };
      mode.addEventListener('change', updateCompressionMode);
      fields.append(warn);
      updateCompressionMode();
    }
    els.settingsFields.replaceChildren(fields);
    els.settings.hidden = !state.sources.length || (!fields.childElementCount);
  }

  function updateAction() {
    const selected = countSelected(), total = state.pages.length;
    const rotated = state.pages.filter(function (page) { return page.turn !== 0; }).length;
    els.selected.textContent = state.tool === 'rotate' ? '已選擇 ' + selected + ' / ' + total + ' 頁'
      : state.tool === 'watermark' || state.tool === 'number' ? '要處理 ' + selected + ' / ' + total + ' 頁'
      : '已選擇 ' + selected + ' / ' + total + ' 頁';
    let label = tool().verb;
    if (state.tool === 'split') label = state.outputFormat === 'pdf' ? (state.splitSeparate ? '下載各頁 PDF（ZIP）' : '下載選取 PDF') : '下載 ' + state.outputFormat.toUpperCase() + ' 圖片';
    if (state.tool === 'pdf-images') label = '下載 ' + state.outputFormat.toUpperCase() + ' 圖片';
    els.runText.textContent = state.busy ? '處理中…' : label;
    els.actionHint.textContent = state.tool === 'rotate' ? '已調整 ' + rotated + ' 頁，可重新選擇其他頁面繼續旋轉'
      : selected ? (state.tool === 'split' || state.tool === 'pdf-images' ? '已勾選的頁面將被輸出' : '在本機處理，完成後直接下載') : '請先勾選至少一頁';
    els.run.disabled = state.busy || !state.sources.length || (state.tool === 'rotate' ? rotated === 0 : selected === 0) || (state.tool === 'merge' && state.sources.length < 1);
    els.all.disabled = state.busy; els.none.disabled = state.busy;
    els.rotateSelected.disabled = state.busy || state.tool !== 'rotate' || selected === 0;
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) { blob ? resolve(blob) : reject(new Error('圖片處理失敗，請嘗試降低解析度。')); }, type === 'jpeg' ? 'image/jpeg' : 'image/png', quality);
    });
  }
  function download(data, name, mime) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; document.body.append(anchor); anchor.click(); anchor.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }
  async function zipSave(zip, name) {
    message('正在打包 ZIP 檔案…', 'busy');
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 3 } });
    download(blob, name, 'application/zip');
  }
  async function docFor(source, cache) {
    if (cache.has(source.id)) return cache.get(source.id);
    const pdf = await PDFLib.PDFDocument.load(new Uint8Array(await source.file.arrayBuffer()), { updateMetadata: false });
    cache.set(source.id, pdf); return pdf;
  }
  async function assemble(pages) {
    const output = await PDFLib.PDFDocument.create(); const cache = new Map();
    for (let i = 0; i < pages.length; i += 1) {
      if (i % 5 === 0) message('正在組合頁面 ' + (i + 1) + ' / ' + pages.length + '…', 'busy');
      const src = await docFor(sourceFor(pages[i]), cache);
      const copy = (await output.copyPages(src, [pages[i].index]))[0];
      if (pages[i].turn) copy.setRotation(PDFLib.degrees((copy.getRotation().angle + pages[i].turn) % 360));
      output.addPage(copy);
    }
    return output;
  }
  async function simpleTransform(transform) {
    const cache = new Map(); const src = await docFor(state.sources[0], cache);
    const selected = state.pages.filter(function (p) { return p.selected; });
    for (let i = 0; i < selected.length; i += 1) {
      await transform(src.getPage(selected[i].index), selected[i], i, selected.length, src);
    }
    return src;
  }
  async function outputSplit() {
    const pages = state.pages.filter(function (p) { return p.selected; });
    const source = state.sources[0], baseName = filename(source.file);
    if (state.outputFormat !== 'pdf') {
      await imagesExport(pages, baseName + '_擷取');
      return '完成！已輸出 ' + pages.length + ' 張圖片。';
    }
    if (state.splitSeparate) {
      const zip = new JSZip(), cache = new Map();
      const src = await docFor(source, cache);
      for (let i = 0; i < pages.length; i += 1) {
        message('正在拆分頁面 ' + (i + 1) + ' / ' + pages.length + '…', 'busy');
        const target = await PDFLib.PDFDocument.create();
        target.addPage((await target.copyPages(src, [pages[i].index]))[0]);
        zip.file(baseName + '_第' + (pages[i].index + 1) + '頁.pdf', await target.save());
      }
      await zipSave(zip, baseName + '_拆分.zip');
    } else {
      const pdf = await assemble(pages);
      download(await pdf.save(), baseName + '_擷取頁面.pdf');
    }
    return '完成！已輸出 ' + pages.length + ' 頁 PDF。';
  }
  async function renderPdfPage(src, index, scale, type, quality) {
    const pdfPage = await src.pdfjs.getPage(index + 1);
    const viewport = pdfPage.getViewport({ scale: scale });
    if (viewport.width * viewport.height > 18000000) throw new Error('頁面太大。請選擇較低的解析度再試一次。');
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(viewport.width)); canvas.height = Math.max(1, Math.ceil(viewport.height));
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('瀏覽器無法處理圖片。');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    try {
      await pdfPage.render({ canvasContext: ctx, viewport: viewport }).promise;
      return { blob: await canvasToBlob(canvas, type, quality || .86), width: viewport.width, height: viewport.height };
    } finally { canvas.width = 0; canvas.height = 0; pdfPage.cleanup(); }
  }
  async function imagesExport(pages, prefix) {
    if (pages.length > 150) throw new Error('一次最多可轉換 150 頁，請分批勾選處理。');
    const type = state.outputFormat === 'png' ? 'png' : 'jpeg';
    const ext = type === 'png' ? 'png' : 'jpg';
    const scale = Number(($('renderScale') || {}).value || 1.5);
    const zip = new JSZip(); let single = null;
    for (let i = 0; i < pages.length; i += 1) {
      const p = pages[i], src = sourceFor(p);
      message('正在轉換圖片 ' + (i + 1) + ' / ' + pages.length + '…', 'busy');
      const rendered = await renderPdfPage(src, p.index, scale, type, .9);
      const name = prefix + '_第' + String(p.index + 1).padStart(3, '0') + '頁.' + ext;
      if (pages.length === 1) single = { blob: rendered.blob, name: name };
      else zip.file(name, rendered.blob);
    }
    if (single) download(single.blob, single.name, type === 'png' ? 'image/png' : 'image/jpeg');
    else await zipSave(zip, prefix + '_圖片.zip');
  }
  async function outputImagesPdf() {
    const pages = state.pages.filter(function (p) { return p.selected; });
    const out = await PDFLib.PDFDocument.create();
    for (let i = 0; i < pages.length; i += 1) {
      message('正在加入圖片 ' + (i + 1) + ' / ' + pages.length + '…', 'busy');
      const source = sourceFor(pages[i]);
      const file = source.file;
      let img;
      if (/\.jpe?g$/i.test(file.name)) img = await out.embedJpg(new Uint8Array(await file.arrayBuffer()));
      else if (/\.png$/i.test(file.name)) img = await out.embedPng(new Uint8Array(await file.arrayBuffer()));
      else {
        const bitmap = await createImageBitmap(file);
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width; canvas.height = bitmap.height;
        if (canvas.width * canvas.height > 25000000) { bitmap.close(); throw new Error('圖片過大，請先縮小尺寸後再試一次。'); }
        const ctx = canvas.getContext('2d'); ctx.drawImage(bitmap, 0, 0); bitmap.close();
        const blob = await canvasToBlob(canvas, 'png');
        img = await out.embedPng(new Uint8Array(await blob.arrayBuffer()));
        canvas.width = 0; canvas.height = 0;
      }
      let width = img.width, height = img.height, padding = 0;
      if (($('paperSize') || {}).value === 'a4') {
        const landscape = width > height;
        width = landscape ? 841.89 : 595.28;
        height = landscape ? 595.28 : 841.89;
        padding = 24;
      } else {
        const scale = Math.min(.75, 1440 / Math.max(width, height));
        width *= scale; height *= scale;
      }
      const fit = Math.min((width - padding * 2) / img.width, (height - padding * 2) / img.height);
      const w = img.width * fit, h = img.height * fit;
      const page = out.addPage([width, height]);
      page.drawImage(img, { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h });
    }
    download(await out.save(), '圖片合併.pdf');
    return '完成！已輸出 ' + pages.length + ' 頁 PDF。';
  }
  async function outputRotate() {
    const src = state.sources[0];
    const pdf = await PDFLib.PDFDocument.load(new Uint8Array(await src.file.arrayBuffer()), { updateMetadata: false });
    let changed = 0;
    state.pages.forEach(function (p) {
      if (!p.turn) return;
      const page = pdf.getPage(p.index);
      page.setRotation(PDFLib.degrees((page.getRotation().angle + p.turn) % 360));
      changed += 1;
    });
    if (!changed) throw new Error('請先在至少一頁按下「左轉 90°」。');
    download(await pdf.save(), filename(src.file) + '_旋轉.pdf');
    return '完成！已獨立調整 ' + changed + ' 頁的方向，其他頁面保持原樣。';
  }
  async function outputPageNumber() {
    const start = Number($('numberStart').value);
    if (!Number.isInteger(start) || start < 0 || start > 999999) throw new Error('請輸入正確的起始頁碼。');
    const pos = $('numberPos').value, src = state.sources[0];
    let cachedFont = null;
    const pdf = await simpleTransform(async function (page, p, i, n, pdf) {
      const { width, height } = page.getSize();
      const pageText = String(start + p.index);
      if (!cachedFont) cachedFont = await pdf.embedFont(PDFLib.StandardFonts.Helvetica);
      const font = cachedFont;
      const size = 11, tw = font.widthOfTextAtSize(pageText, size);
      const x = pos.endsWith('right') ? width - tw - 32 : (width - tw) / 2;
      const y = pos.startsWith('top') ? height - 31 : 26;
      page.drawText(pageText, { x: x, y: y, font: font, size: size, color: PDFLib.rgb(.27,.35,.43), opacity: .9 });
    });
    download(await pdf.save(), filename(src.file) + '_頁碼.pdf');
    return '完成！已在 ' + countSelected() + ' 頁加上頁碼。';
  }
  function watermarkCanvas(text) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const font = 'bold 70px "Microsoft JhengHei","Noto Sans TC",sans-serif';
    ctx.font = font; const measured = ctx.measureText(text);
    canvas.width = Math.max(250, Math.min(2500, Math.ceil(measured.width) + 60));
    canvas.height = 132; ctx.font = font; ctx.fillStyle = '#496b84'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2, canvas.width - 30);
    return canvas;
  }
  async function outputWatermark() {
    const text = $('watermarkText').value.trim();
    if (!text) throw new Error('請先輸入浮水印文字。');
    if (text.length > 60) throw new Error('浮水印文字最多 60 字。');
    const canvas = watermarkCanvas(text);
    const blob = await canvasToBlob(canvas, 'png'); canvas.width = 0; canvas.height = 0;
    const png = new Uint8Array(await blob.arrayBuffer());
    const opacity = Number($('watermarkOpacity').value);
    const deg = Number($('watermarkRotation').value);
    let cachedImage = null;
    const pdf = await simpleTransform(async function (page, p, i, n, pdf) {
      if (!cachedImage) cachedImage = await pdf.embedPng(png);
      const image = cachedImage; const { width, height } = page.getSize();
      const drawWidth = Math.min(width * .75, image.width * .35);
      const drawHeight = drawWidth * image.height / image.width;
      const rad = deg * Math.PI / 180;
      const x = width / 2 - (drawWidth * Math.cos(rad) - drawHeight * Math.sin(rad)) / 2;
      const y = height / 2 - (drawWidth * Math.sin(rad) + drawHeight * Math.cos(rad)) / 2;
      page.drawImage(image, { x: x, y: y, width: drawWidth, height: drawHeight, rotate: PDFLib.degrees(deg), opacity: opacity });
    });
    download(await pdf.save(), filename(state.sources[0].file) + '_浮水印.pdf');
    return '完成！已在 ' + countSelected() + ' 頁加上浮水印。';
  }
  async function outputExtract() {
    const pages = state.pages.filter(function (p) { return p.selected; });
    const source = state.sources[0], chunks = [], texts = [];
    for (let i = 0; i < pages.length; i += 1) {
      message('正在擷取文字 ' + (i + 1) + ' / ' + pages.length + '…', 'busy');
      const page = await source.pdfjs.getPage(pages[i].index + 1);
      const content = await page.getTextContent();
      const words = content.items.map(function (x) { return (x.str || '') + (x.hasEOL ? '\n' : ' '); }).join('').trim();
      texts.push(words); chunks.push('── 第 ' + (pages[i].index + 1) + ' 頁 ──\n' + words);
      page.cleanup();
    }
    if (!texts.some(function (s) { return s.length > 0; })) throw new Error('這份 PDF 沒有可選取的文字。如果是掃描文件，需先使用 OCR。');
    download(new Blob(['\ufeff', chunks.join('\n\n')], { type: 'text/plain;charset=utf-8' }), filename(source.file) + '_文字.txt', 'text/plain;charset=utf-8');
    return '完成！文字已擷取到 TXT 檔案。';
  }
  async function outputCompress() {
    const pages = state.pages.filter(function (p) { return p.selected; });
    const file = state.sources[0].file;
    const originalSize = file.size;
    const prefix = filename(file);
    const formatSize = function (size) { return size >= 1048576 ? (size / 1048576).toFixed(2) + ' MB' : Math.round(size / 1024) + ' KB'; };
    const mode = $('compressMode')?.value || 'structure';
    if (mode === 'structure') {
      message('正在整理 PDF 物件結構，保留文字和向量內容…', 'busy');
      const selectedAll = pages.length === state.pages.length;
      const doc = selectedAll
        ? await PDFLib.PDFDocument.load(new Uint8Array(await file.arrayBuffer()), { updateMetadata: false })
        : await assemble(pages);
      const optimized = await doc.save({ useObjectStreams: true, addDefaultPage: false });
      if (selectedAll && optimized.byteLength >= originalSize) {
        return '這份 PDF 已經相當精簡，保留文字模式未能縮小（原檔 ' + formatSize(originalSize) + '，重新整理後 ' + formatSize(optimized.byteLength) + '）。為避免產生更大的檔案，沒有下載重複檔。可改用「掃描文件／圖片型」，但會失去可選取文字。';
      }
      download(optimized, prefix + '_保留文字最佳化.pdf');
      const diff = originalSize ? Math.round((1 - optimized.byteLength / originalSize) * 1000) / 10 : 0;
      return '處理完成。原檔 ' + formatSize(originalSize) + ' → ' + formatSize(optimized.byteLength) + '（約減少 ' + diff + '%）。文字與向量圖形會保留；請檢查數位簽章與特殊互動功能。';
    }
    if (pages.length > 50) throw new Error('影像型壓縮每次最多處理 50 頁，請分批處理。');
    const presets = { small: { scale: .85, quality: .50 }, balanced: { scale: 1.15, quality: .68 }, clear: { scale: 1.6, quality: .84 } };
    const preset = presets[$('compressQuality').value];
    const pdf = await PDFLib.PDFDocument.create();
    for (let i = 0; i < pages.length; i += 1) {
      message('正在壓縮頁面 ' + (i + 1) + ' / ' + pages.length + '…', 'busy');
      const p = pages[i], source = sourceFor(p);
      const rendered = await renderPdfPage(source, p.index, preset.scale, 'jpeg', preset.quality);
      const img = await pdf.embedJpg(new Uint8Array(await rendered.blob.arrayBuffer()));
      const sourcePage = await source.pdfjs.getPage(p.index + 1);
      const size = sourcePage.getViewport({ scale: 1 });
      const page = pdf.addPage([size.width, size.height]);
      page.drawImage(img, { x: 0, y: 0, width: size.width, height: size.height });
      sourcePage.cleanup();
    }
    const bytes = await pdf.save({ useObjectStreams: true });
    download(bytes, prefix + '_影像壓縮.pdf');
    const percent = originalSize ? Math.round((1 - bytes.byteLength / originalSize) * 1000) / 10 : 0;
    return '已輸出影像型 PDF：原檔 ' + formatSize(originalSize) + ' → ' + formatSize(bytes.byteLength)
      + '（' + (percent >= 0 ? '縮小 ' + percent + '%' : '變大 ' + Math.abs(percent) + '%') + '）。注意：可選取文字與超連結不再保留。';
  }
  async function process() {
    if (state.busy || els.run.disabled || !ready()) return;
    setBusy(true);
    message('正在準備輸出檔案…', 'busy');
    try {
      let result = '';
      if (state.tool === 'split') result = await outputSplit();
      else if (state.tool === 'pdf-images') { await imagesExport(state.pages.filter(function (p) { return p.selected; }), filename(state.sources[0].file)); result = '完成！圖片已下載。'; }
      else if (state.tool === 'images-pdf') result = await outputImagesPdf();
      else if (state.tool === 'rotate') result = await outputRotate();
      else if (state.tool === 'number') result = await outputPageNumber();
      else if (state.tool === 'watermark') result = await outputWatermark();
      else if (state.tool === 'extract') result = await outputExtract();
      else if (state.tool === 'compress') result = await outputCompress();
      else {
        const pages = state.pages.filter(function (p) { return p.selected; });
        const pdf = await assemble(pages); download(await pdf.save(), state.tool === 'merge' ? '合併文件.pdf' : '整理後文件.pdf');
        result = '完成！已輸出 ' + pages.length + ' 頁 PDF。';
      }
      message(result, '');
    } catch (err) {
      console.error('檔案處理失敗：', err);
      let problem = err && err.message ? err.message : '未知錯誤';
      if (/encrypt|password/i.test(problem)) problem = '此 PDF 可能有密碼或加密保護，請先解除保護。';
      message('處理失敗：' + problem, 'error');
    } finally { setBusy(false); }
  }

  els.nav.addEventListener('click', function (ev) {
    const button = ev.target.closest('[data-tool]');
    if (button) chooseTool(button.dataset.tool);
  });
  els.upload.addEventListener('click', function (ev) { if (ev.target !== els.browse && !state.busy) els.input.click(); });
  els.upload.addEventListener('keydown', function (ev) {
    if (ev.target === els.upload && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); if (!state.busy) els.input.click(); }
  });
  els.browse.addEventListener('click', function (ev) { ev.stopPropagation(); if (!state.busy) els.input.click(); });
  els.add.addEventListener('click', function () { if (!state.busy) els.input.click(); });
  els.input.addEventListener('change', function () { uploadFiles(els.input.files); });
  // 圖片轉 PDF 也接受「複製圖片」後直接貼上，無須先下載。
  document.addEventListener('paste', function (event) {
    if (state.tool !== 'images-pdf' || state.busy) return;
    const target = event.target;
    if (target && (target.isContentEditable || target.closest?.('input,textarea,[contenteditable="true"]'))) return;
    const items = Array.from(event.clipboardData?.items || []);
    const imageItem = items.find(function (item) { return item.kind === 'file' && /^image\/(png|jpeg|webp)$/i.test(item.type); });
    const blob = imageItem?.getAsFile() || Array.from(event.clipboardData?.files || []).find(function (file) { return /^image\/(png|jpeg|webp)$/i.test(file.type); });
    if (!blob) return;
    event.preventDefault();
    const extension = blob.type === 'image/jpeg' ? 'jpg' : blob.type === 'image/webp' ? 'webp' : 'png';
    const pastedFile = new File([blob], '貼上圖片-' + Date.now() + '.' + extension, { type: blob.type });
    uploadFiles([pastedFile]);
  });
  els.clear.addEventListener('click', function () { if (!state.busy) { dispose(); render(); } });
  els.reset.addEventListener('click', function () { if (!state.busy) { dispose(); render(); } });
  els.all.addEventListener('click', function () { state.pages.forEach(function (p) { p.selected = true; }); renderPages(); updateAction(); });
  els.none.addEventListener('click', function () { state.pages.forEach(function (p) { p.selected = false; }); renderPages(); updateAction(); });
  els.rotateSelected.addEventListener('click', function () {
    if (state.busy || state.tool !== 'rotate') return;
    const selected = state.pages.filter(function (p) { return p.selected; });
    if (!selected.length) return;
    selected.forEach(function (p) { p.turn = (p.turn + 270) % 360; });
    renderPages(); updateAction(); clearMessage();
  });
  els.thumbSize.addEventListener('change', function () { els.grid.className = 'page-grid size-' + els.thumbSize.value; });
  els.run.addEventListener('click', process);
  ['dragenter','dragover'].forEach(function (evt) { els.upload.addEventListener(evt, function (ev) { ev.preventDefault(); els.upload.classList.add('dragover'); }); });
  ['dragleave','drop'].forEach(function (evt) { els.upload.addEventListener(evt, function (ev) { ev.preventDefault(); els.upload.classList.remove('dragover'); }); });
  els.upload.addEventListener('drop', function (ev) { if (!state.busy) uploadFiles(ev.dataTransfer.files); });
  if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const initialTool = new URLSearchParams(window.location.search).get('tool');
  chooseTool(TOOLS[initialTool] ? initialTool : 'merge');
}());