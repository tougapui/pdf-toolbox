/* PDF 小事務所：所有檔案均在使用者的瀏覽器中處理，不會上傳至伺服器。 */
(function () {
  'use strict';

  const definitions = {
    merge: { title: '合併 PDF', description: '上傳兩份以上的 PDF，依照你想要的順序合成一份。', button: '開始合併', hint: '支援 PDF 格式，可一次選取多個檔案', upload: '拖曳 PDF 到這裡', footer: '合併後的檔案會直接下載到你的裝置。', multiple: true, pdf: true, options: '' },
    split: { title: '拆分 PDF', description: '挑選需要的頁面，合成新 PDF，或把每一頁各自存檔。', button: '開始拆分', hint: '一次選擇一份 PDF', upload: '拖曳 PDF 到這裡', footer: '指定頁面可合併輸出，或打包下載個別頁面。', multiple: false, pdf: true,
      options: '<div class="option-grid"><div class="form-field full"><label for="pageRange">要保留的頁面</label><input id="pageRange" type="text" placeholder="例如：1-3, 5, 8（不填 = 全部）" autocomplete="off"><span class="field-help">使用半形逗號分隔，範圍用連字號，例如 1-3, 5。留白代表全部頁面。</span></div><div class="form-field full"><label for="splitMode">輸出方式</label><select id="splitMode"><option value="one">將選取頁面合成一份 PDF</option><option value="separate">每一頁各自成為 PDF（ZIP 壓縮檔）</option></select></div></div>' },
    rotate: { title: '旋轉 PDF', description: '把放歪的頁面轉正，保留原本的 PDF 內容。', button: '開始旋轉', hint: '一次選擇一份 PDF', upload: '拖曳 PDF 到這裡', footer: '只會旋轉選取的頁面，其他頁面不會變動。', multiple: false, pdf: true,
      options: '<div class="option-grid"><div class="form-field full"><label for="pageRange">要旋轉的頁面</label><input id="pageRange" type="text" placeholder="例如：2, 4-7（不填 = 全部）" autocomplete="off"><span class="field-help">留白代表整份 PDF 的全部頁面。</span></div><div class="form-field"><label for="degrees">順時針旋轉角度</label><select id="degrees"><option value="90">90°</option><option value="180">180°</option><option value="270">270°</option></select></div></div>' },
    'pdf-images': { title: 'PDF 轉圖片', description: '將 PDF 頁面轉成 JPG 或 PNG，所有圖片一次打包。', button: '轉成圖片', hint: '一次選擇一份 PDF，輸出為 ZIP 圖片檔', upload: '拖曳 PDF 到這裡', footer: '每頁會變成一張圖片，並以 ZIP 檔下載。', multiple: false, pdf: true,
      options: '<div class="option-grid"><div class="form-field full"><label for="pageRange">要轉換的頁面</label><input id="pageRange" type="text" placeholder="例如：1-5（不填 = 全部）" autocomplete="off"><span class="field-help">留白代表全部頁面。</span></div><div class="form-field"><label for="imageFormat">圖片格式</label><select id="imageFormat"><option value="jpeg">JPG（檔案通常較小）</option><option value="png">PNG（字體及線條較清晰）</option></select></div><div class="form-field"><label for="imageScale">輸出解析度</label><select id="imageScale"><option value="1">一般（1 倍）</option><option value="1.5" selected>清晰（1.5 倍）</option><option value="2">高畫質（2 倍）</option></select></div></div>' },
    'images-pdf': { title: '圖片轉 PDF', description: '把 JPG、PNG 或 WebP 圖片，依序放進同一份 PDF。', button: '製作 PDF', hint: '支援 JPG、PNG、WebP，可一次上傳多張圖片', upload: '拖曳圖片到這裡', footer: '每張圖片各占一頁，可調整排序和紙張尺寸。', multiple: true, pdf: false,
      options: '<div class="option-grid"><div class="form-field full"><label for="paperSize">PDF 紙張大小</label><select id="paperSize"><option value="auto">依圖片比例自動調整（保留原比例）</option><option value="a4">A4（自動判斷直式、橫式）</option></select></div></div>' },
    extract: { title: 'PDF 擷取文字', description: '把可選取的 PDF 文字整理成 TXT，方便複製或做筆記。', button: '擷取文字', hint: '一次選擇一份 PDF（不支援掃描影像 OCR）', upload: '拖曳 PDF 到這裡', footer: '掃描影像沒有文字圖層時，無法直接擷取。', multiple: false, pdf: true,
      options: '<div class="option-grid"><div class="form-field full"><label for="pageRange">要擷取的頁面</label><input id="pageRange" type="text" placeholder="例如：1-8（不填 = 全部）" autocomplete="off"><span class="field-help">僅擷取 PDF 內的可選取文字，不會辨識圖片文字。</span></div></div>' }
  };

  const state = { tool: 'merge', files: [], busy: false, generation: 0 };
  const $ = (id) => document.getElementById(id);
  const els = {
    toolList: $('toolList'), toolTitle: $('toolTitle'), toolDescription: $('toolDescription'),
    toolNumber: $('toolNumber'), dropzone: $('dropzone'), fileInput: $('fileInput'),
    pickFiles: $('pickFiles'), dropTitle: $('dropTitle'), fileHint: $('fileHint'),
    selectedSection: $('selectedSection'), fileList: $('fileList'), fileCount: $('fileCount'),
    clearFiles: $('clearFiles'), sortHint: $('sortHint'), optionsSection: $('optionsSection'),
    optionsContent: $('optionsContent'), notice: $('notice'), footerTip: $('footerTip'),
    runButton: $('runButton'), runText: $('runText')
  };

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }
  function stem(file) {
    return file.name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_').slice(0, 90) || 'document';
  }
  function validFile(file, isPdf) {
    const name = file.name.toLowerCase();
    return isPdf ? /\.pdf$/.test(name) : /\.(jpe?g|png|webp)$/.test(name);
  }
  function showNotice(message, kind) {
    els.notice.hidden = false;
    els.notice.className = 'notice' + (kind ? ' ' + kind : '');
    els.notice.textContent = message;
  }
  function hideNotice() {
    els.notice.hidden = true;
    els.notice.textContent = '';
    els.notice.className = 'notice';
  }
  function currentTool() { return definitions[state.tool]; }
  function updateRunButton() {
    const canRun = state.files.length >= (state.tool === 'merge' ? 2 : 1);
    els.runButton.disabled = state.busy || !canRun;
    els.runText.textContent = state.busy ? '處理中…' : currentTool().button;
  }
  function selectTool(id) {
    if (state.busy || !definitions[id]) return;
    state.tool = id;
    state.files = [];
    state.generation += 1;
    const tool = currentTool();
    els.toolTitle.textContent = tool.title;
    els.toolDescription.textContent = tool.description;
    els.toolNumber.textContent = String(Object.keys(definitions).indexOf(id) + 1).padStart(2, '0');
    els.dropTitle.textContent = tool.upload;
    els.fileHint.textContent = tool.hint;
    els.footerTip.textContent = tool.footer;
    els.fileInput.accept = tool.pdf ? '.pdf,application/pdf' : '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp';
    els.fileInput.multiple = tool.multiple;
    els.fileInput.value = '';
    els.optionsContent.innerHTML = tool.options;
    els.optionsSection.hidden = !tool.options;
    document.querySelectorAll('.tool-btn').forEach(function (btn) {
      const active = btn.dataset.tool === id;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
    hideNotice();
    renderFiles();
  }

  async function readPageCount(file, generation) {
    if (!window.PDFLib) return;
    try {
      const doc = await PDFLib.PDFDocument.load(new Uint8Array(await file.arrayBuffer()), { updateMetadata: false });
      if (generation !== state.generation) return;
      file._pdfPages = doc.getPageCount();
      renderFiles();
    } catch (err) {
      if (generation !== state.generation) return;
      file._pdfError = '無法讀取，可能已加密或損壞';
      renderFiles();
    }
  }

  function acceptFiles(items) {
    if (state.busy) return;
    const tool = currentTool();
    const incoming = Array.from(items).filter(function (file) { return validFile(file, tool.pdf); });
    if (!incoming.length) {
      showNotice(tool.pdf ? '請選擇 PDF 檔案。' : '請選擇 JPG、PNG 或 WebP 圖片。', 'error');
      return;
    }
    const rejected = items.length - incoming.length;
    if (tool.multiple) {
      state.files = state.files.concat(incoming);
    } else {
      state.files = [incoming[0]];
    }
    state.generation += 1;
    const generation = state.generation;
    hideNotice();
    if (rejected) showNotice('已略過 ' + rejected + ' 個不支援的檔案。', 'error');
    if (tool.pdf) {
      incoming.forEach(function (file) { readPageCount(file, generation); });
    }
    renderFiles();
    els.fileInput.value = '';
  }

  function iconButton(symbol, label, index, action, disabled) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'icon-button' + (action === 'remove' ? ' remove' : '');
    btn.textContent = symbol;
    btn.title = label;
    btn.setAttribute('aria-label', label);
    btn.disabled = disabled || state.busy;
    btn.addEventListener('click', function () {
      if (state.busy) return;
      if (action === 'up' && index > 0) {
        const tmp = state.files[index - 1]; state.files[index - 1] = state.files[index]; state.files[index] = tmp;
      } else if (action === 'down' && index < state.files.length - 1) {
        const tmp = state.files[index + 1]; state.files[index + 1] = state.files[index]; state.files[index] = tmp;
      } else if (action === 'remove') {
        state.files.splice(index, 1);
        state.generation += 1;
      }
      hideNotice();
      renderFiles();
    });
    return btn;
  }

  function renderFiles() {
    els.fileCount.textContent = String(state.files.length);
    els.selectedSection.hidden = state.files.length === 0;
    els.sortHint.hidden = !currentTool().multiple || state.files.length < 2;
    els.fileList.replaceChildren();
    state.files.forEach(function (file, index) {
      const item = document.createElement('li');
      item.className = 'file-item' + (currentTool().pdf ? '' : ' image-file');
      const badge = document.createElement('span');
      badge.className = 'file-badge';
      badge.textContent = currentTool().pdf ? 'PDF' : 'IMG';
      const detail = document.createElement('div');
      detail.className = 'file-details';
      const name = document.createElement('div');
      name.className = 'file-name';
      name.textContent = file.name;
      name.title = file.name;
      const meta = document.createElement('div');
      meta.className = 'file-meta';
      meta.textContent = formatBytes(file.size) + (file._pdfPages ? ' · ' + file._pdfPages + ' 頁' : '') + (file._pdfError ? ' · ' + file._pdfError : '');
      detail.append(name, meta);
      const actions = document.createElement('div');
      actions.className = 'file-actions';
      if (currentTool().multiple) {
        actions.append(
          iconButton('↑', '向上移動 ' + file.name, index, 'up', index === 0),
          iconButton('↓', '向下移動 ' + file.name, index, 'down', index === state.files.length - 1)
        );
      }
      actions.append(iconButton('×', '移除 ' + file.name, index, 'remove', false));
      item.append(badge, detail, actions);
      els.fileList.append(item);
    });
    updateRunButton();
  }

  function parsePages(raw, total) {
    if (!raw || !raw.trim()) return Array.from({ length: total }, function (_, i) { return i; });
    const result = [];
    const seen = new Set();
    raw.replace(/，/g, ',').split(',').forEach(function (part) {
      const term = part.trim();
      if (!/^\d+(?:\s*-\s*\d+)?$/.test(term)) throw new Error('頁碼格式不正確。請使用 1-3, 5, 8 這樣的格式。');
      const halves = term.split('-').map(function (x) { return Number(x.trim()); });
      const start = halves[0];
      const end = halves.length === 2 ? halves[1] : start;
      if (start < 1 || end < start || end > total) {
        throw new Error('頁碼超出範圍或順序不正確。這份檔案只有 ' + total + ' 頁。');
      }
      for (let i = start; i <= end; i += 1) {
        if (!seen.has(i)) { result.push(i - 1); seen.add(i); }
      }
    });
    if (!result.length) throw new Error('請至少選擇一頁。');
    return result;
  }
  function rangeFor(total) { return parsePages(($('pageRange') || {}).value || '', total); }
  async function readPdf(file) {
    return PDFLib.PDFDocument.load(new Uint8Array(await file.arrayBuffer()), { updateMetadata: false });
  }
  function progress(message) { showNotice(message, 'busy'); }
  function saveFile(data, filename, mime) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 120000);
  }
  async function zipDownload(zip, filename) {
    progress('正在整理 ZIP 壓縮檔…');
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 3 } });
    saveFile(blob, filename, 'application/zip');
  }
  function pageName(n, total) {
    return String(n).padStart(Math.max(2, String(total).length), '0');
  }

  async function mergePdfs() {
    const output = await PDFLib.PDFDocument.create();
    for (let i = 0; i < state.files.length; i += 1) {
      progress('正在合併第 ' + (i + 1) + ' / ' + state.files.length + ' 份 PDF…');
      const src = await readPdf(state.files[i]);
      const pages = await output.copyPages(src, src.getPageIndices());
      pages.forEach(function (page) { output.addPage(page); });
    }
    const bytes = await output.save();
    saveFile(bytes, '合併文件.pdf');
    return '完成！已合併 ' + state.files.length + ' 份 PDF，檔案已下載。';
  }

  async function splitPdf() {
    const file = state.files[0], src = await readPdf(file);
    const pages = rangeFor(src.getPageCount());
    const separate = $('splitMode').value === 'separate';
    if (separate) {
      const zip = new JSZip();
      for (let i = 0; i < pages.length; i += 1) {
        progress('正在拆分第 ' + (i + 1) + ' / ' + pages.length + ' 頁…');
        const out = await PDFLib.PDFDocument.create();
        const selected = await out.copyPages(src, [pages[i]]);
        out.addPage(selected[0]);
        zip.file(stem(file) + '_第' + pageName(pages[i] + 1, src.getPageCount()) + '頁.pdf', await out.save());
      }
      await zipDownload(zip, stem(file) + '_拆分頁面.zip');
    } else {
      progress('正在擷取 ' + pages.length + ' 頁…');
      const out = await PDFLib.PDFDocument.create();
      const selected = await out.copyPages(src, pages);
      selected.forEach(function (page) { out.addPage(page); });
      saveFile(await out.save(), stem(file) + '_擷取頁面.pdf');
    }
    return '完成！已處理 ' + pages.length + ' 頁，檔案已下載。';
  }

  async function rotatePdf() {
    const file = state.files[0], pdf = await readPdf(file);
    const indices = rangeFor(pdf.getPageCount());
    const degrees = Number($('degrees').value);
    indices.forEach(function (i) {
      const page = pdf.getPage(i);
      const previous = page.getRotation().angle || 0;
      page.setRotation(PDFLib.degrees((previous + degrees) % 360));
    });
    progress('正在儲存旋轉後的 PDF…');
    saveFile(await pdf.save(), stem(file) + '_旋轉.pdf');
    return '完成！已旋轉 ' + indices.length + ' 頁，檔案已下載。';
  }

  function canvasBlob(canvas, format) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (blob) resolve(blob);
        else reject(new Error('圖片轉換失敗，請降低解析度再試一次。'));
      }, format === 'jpeg' ? 'image/jpeg' : 'image/png', format === 'jpeg' ? .9 : undefined);
    });
  }

  async function pdfToImages() {
    const file = state.files[0];
    const bytes = new Uint8Array(await file.arrayBuffer());
    const task = pdfjsLib.getDocument({ data: bytes });
    const pdf = await task.promise;
    try {
      const pages = rangeFor(pdf.numPages);
      if (pages.length > 250) throw new Error('為避免瀏覽器記憶體不足，一次最多轉換 250 頁。請拆成幾批處理。');
      const format = $('imageFormat').value;
      const scale = Number($('imageScale').value);
      const zip = new JSZip();
      for (let i = 0; i < pages.length; i += 1) {
        progress('正在將第 ' + (i + 1) + ' / ' + pages.length + ' 頁轉成圖片…');
        const page = await pdf.getPage(pages[i] + 1);
        const viewport = page.getViewport({ scale: scale });
        if (viewport.width * viewport.height > 22000000) throw new Error('頁面太大。請把圖片解析度調低再試一次。');
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext('2d', { alpha: format !== 'jpeg' });
        if (!context) throw new Error('無法啟用瀏覽器的圖片處理功能。');
        if (format === 'jpeg') {
          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, canvas.width, canvas.height);
        }
        await page.render({ canvasContext: context, viewport: viewport }).promise;
        zip.file(stem(file) + '_第' + pageName(pages[i] + 1, pdf.numPages) + '頁.' + (format === 'jpeg' ? 'jpg' : 'png'), await canvasBlob(canvas, format));
        canvas.width = 0;
        canvas.height = 0;
        page.cleanup();
      }
      await zipDownload(zip, stem(file) + '_圖片.zip');
      return '完成！已將 ' + pages.length + ' 頁轉成圖片，ZIP 檔已下載。';
    } finally {
      await pdf.destroy();
    }
  }

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('無法開啟圖片：' + file.name)); };
      img.src = url;
    });
  }

  async function imageToPdf() {
    const pdf = await PDFLib.PDFDocument.create();
    for (let i = 0; i < state.files.length; i += 1) {
      const file = state.files[i];
      progress('正在加入第 ' + (i + 1) + ' / ' + state.files.length + ' 張圖片…');
      const image = await loadImage(file);
      if (!image.naturalWidth || !image.naturalHeight) throw new Error('圖片尺寸異常：' + file.name);
      let embedded;
      const type = file.name.toLowerCase();
      if (/\.jpe?g$/.test(type)) {
        embedded = await pdf.embedJpg(new Uint8Array(await file.arrayBuffer()));
      } else if (/\.png$/.test(type)) {
        embedded = await pdf.embedPng(new Uint8Array(await file.arrayBuffer()));
      } else {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('無法處理這張 WebP 圖片。');
        ctx.drawImage(image, 0, 0);
        embedded = await pdf.embedPng(new Uint8Array(await (await canvasBlob(canvas, 'png')).arrayBuffer()));
        canvas.width = 0;
        canvas.height = 0;
      }
      let width, height, margin;
      if ($('paperSize').value === 'a4') {
        const landscape = embedded.width > embedded.height;
        width = landscape ? 841.89 : 595.28;
        height = landscape ? 595.28 : 841.89;
        margin = 24;
      } else {
        const factor = Math.min(.75, 1440 / Math.max(embedded.width, embedded.height));
        width = embedded.width * factor;
        height = embedded.height * factor;
        margin = 0;
      }
      const page = pdf.addPage([width, height]);
      const fit = Math.min((width - margin * 2) / embedded.width, (height - margin * 2) / embedded.height);
      const drawWidth = embedded.width * fit, drawHeight = embedded.height * fit;
      page.drawImage(embedded, {
        x: (width - drawWidth) / 2, y: (height - drawHeight) / 2,
        width: drawWidth, height: drawHeight
      });
    }
    progress('正在儲存 PDF…');
    saveFile(await pdf.save(), '圖片合併文件.pdf');
    return '完成！已將 ' + state.files.length + ' 張圖片製作成 PDF。';
  }

  async function extractText() {
    const file = state.files[0];
    const task = pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
    const pdf = await task.promise;
    try {
      const pages = rangeFor(pdf.numPages);
      const texts = [];
      for (let i = 0; i < pages.length; i += 1) {
        progress('正在擷取第 ' + (i + 1) + ' / ' + pages.length + ' 頁文字…');
        const page = await pdf.getPage(pages[i] + 1);
        const result = await page.getTextContent();
        const text = result.items.map(function (item) {
          return (item.str || '') + (item.hasEOL ? '\n' : ' ');
        }).join('').trim();
        texts.push('──── 第 ' + (pages[i] + 1) + ' 頁 ────\n' + text);
        page.cleanup();
      }
      const joined = texts.join('\n\n') + '\n';
      if (!joined.replace(/──── 第 \d+ 頁 ────/g, '').trim()) {
        throw new Error('這份 PDF 沒有可擷取的文字。若是掃描文件，需要先使用 OCR 文字辨識工具。');
      }
      saveFile(new Blob(['\ufeff', joined], { type: 'text/plain;charset=utf-8' }), stem(file) + '_文字.txt', 'text/plain;charset=utf-8');
      return '完成！已擷取 ' + pages.length + ' 頁的文字，TXT 檔已下載。';
    } finally {
      await pdf.destroy();
    }
  }

  async function run() {
    if (state.busy || els.runButton.disabled) return;
    if (!window.PDFLib || !window.pdfjsLib || !window.JSZip) {
      showNotice('PDF 處理套件載入失敗，請確認網路連線後重新整理頁面。', 'error');
      return;
    }
    state.busy = true;
    updateRunButton();
    progress('正在準備檔案，請勿關閉網頁…');
    await new Promise(function (resolve) { window.requestAnimationFrame(resolve); });
    try {
      let message;
      if (state.tool === 'merge') message = await mergePdfs();
      else if (state.tool === 'split') message = await splitPdf();
      else if (state.tool === 'rotate') message = await rotatePdf();
      else if (state.tool === 'pdf-images') message = await pdfToImages();
      else if (state.tool === 'images-pdf') message = await imageToPdf();
      else if (state.tool === 'extract') message = await extractText();
      showNotice(message, '');
    } catch (error) {
      const message = error && error.message ? error.message : '請確認檔案格式正確後再試一次。';
      if (/encrypt|password/i.test(message)) {
        showNotice('這份 PDF 有密碼或加密保護，請先解除保護後再處理。', 'error');
      } else {
        showNotice('處理失敗：' + message, 'error');
      }
      console.error('PDF toolbox failed:', error);
    } finally {
      state.busy = false;
      updateRunButton();
    }
  }

  els.toolList.addEventListener('click', function (event) {
    const button = event.target.closest('[data-tool]');
    if (button) selectTool(button.dataset.tool);
  });
  els.dropzone.addEventListener('click', function (event) {
    if (event.target === els.fileInput || event.target === els.pickFiles) return;
    if (!state.busy) els.fileInput.click();
  });
  els.dropzone.addEventListener('keydown', function (event) {
    if ((event.key === 'Enter' || event.key === ' ') && event.target === els.dropzone) {
      event.preventDefault();
      if (!state.busy) els.fileInput.click();
    }
  });
  els.pickFiles.addEventListener('click', function (event) {
    event.stopPropagation();
    if (!state.busy) els.fileInput.click();
  });
  els.fileInput.addEventListener('change', function () { acceptFiles(els.fileInput.files); });
  ['dragenter', 'dragover'].forEach(function (name) {
    els.dropzone.addEventListener(name, function (event) {
      event.preventDefault();
      if (!state.busy) els.dropzone.classList.add('dragover');
    });
  });
  ['dragleave', 'drop'].forEach(function (name) {
    els.dropzone.addEventListener(name, function (event) {
      event.preventDefault();
      els.dropzone.classList.remove('dragover');
    });
  });
  els.dropzone.addEventListener('drop', function (event) {
    if (!state.busy && event.dataTransfer) acceptFiles(event.dataTransfer.files);
  });
  els.clearFiles.addEventListener('click', function () {
    if (state.busy) return;
    state.files = [];
    state.generation += 1;
    els.fileInput.value = '';
    hideNotice();
    renderFiles();
  });
  els.runButton.addEventListener('click', run);

  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  selectTool('merge');
}());