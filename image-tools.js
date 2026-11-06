/* 檔案工具箱：圖片處理完全在瀏覽器本機完成，不會上傳檔案。 */
(() => {
  'use strict';
  const tools = {
    repair: { title: '圖片局部修補', description: '用筆刷或框選指定區域，以周圍畫面補上。可處理自己有權修改的圖片浮水印或污點。', action: '套用修補', tip: '先塗抹要處理的部分。這是免 AI 的周圍像素修補，複雜背景可能留下痕跡。' },
    compress: { title: '壓縮圖片', description: '調整影像品質及最長邊尺寸，壓縮後顯示與原始大小的比較。', action: '開始壓縮', tip: '可先試 WebP 或 JPG，視覺品質和檔案大小取決於圖片內容。' },
    convert: { title: '轉換圖片格式', description: '支援 JPG、PNG、WebP 互轉。PNG 可保留透明背景，JPG 會填成白底。', action: '開始轉換', tip: '轉換格式不代表一定縮小，圖片仍由瀏覽器本機處理。' },
    resize: { title: '調整圖片尺寸', description: '輸入寬度與高度，可鎖定比例，避免把影像拉變形。', action: '調整尺寸', tip: '建議維持比例；放大圖片不會憑空增加真實細節。' },
    crop: { title: '裁切圖片', description: '用滑鼠或手指在圖片上框出想留下的範圍，再按裁切。', action: '套用裁切', tip: '拖曳畫出想保留的區域。可重畫選取範圍，或復原裁切。' }
  };
  const $ = id => document.getElementById(id);
  const ui = {
    nav: $('imageNavigation'), heading: $('imageToolTitle'), description: $('imageToolDescription'),
    input: $('imageInput'), upload: $('imageUpload'), browse: $('imageBrowse'), reset: $('resetImage'),
    workspace: $('imageWorkspace'), newFile: $('newImage'), filename: $('imageFilename'),
    dimensions: $('imageDimensions'), canvas: $('imageCanvas'), maskCanvas: $('selectionCanvas'),
    canvases: $('imageCanvases'), stage: $('imageStage'), repairControls: $('repairControls'),
    tip: $('imageTip'), brush: $('brushSize'), brushLabel: $('brushSizeLabel'),
    undoSelect: $('undoSelection'), clearSelect: $('clearSelection'), undoEdit: $('undoEdit'),
    original: $('showOriginal'), settings: $('imageSettings'), fields: $('imageSettingsFields'),
    feedback: $('imageFeedback'), actions: $('imageActionBar'), summary: $('imageActionSummary'),
    hint: $('imageActionHint'), apply: $('imageApply'), download: $('imageDownload')
  };
  const state = {
    tool: 'repair', file: null, original: document.createElement('canvas'),
    working: document.createElement('canvas'), context: null, selecting: false, mode: 'brush',
    rectStart: null, cropRect: null, beforeMask: null, selectionHistory: [],
    edits: [], comparing: false, preview: null, readyBlob: null, readyExtension: null, busy: false,
    lastObjectURL: null, generation: 0
  };

  function canvasContext(canvas) { return canvas.getContext('2d', { willReadFrequently: true }); }
  function filename(file) { return (file?.name || '圖片').replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_').slice(0, 90); }
  function formatBytes(size) { return size >= 1048576 ? (size / 1048576).toFixed(2) + ' MB' : size >= 1024 ? Math.round(size / 1024) + ' KB' : size + ' B'; }
  function feedback(message, kind = '') {
    ui.feedback.hidden = false; ui.feedback.className = 'feedback' + (kind ? ' ' + kind : ''); ui.feedback.textContent = message;
  }
  function clearFeedback() { ui.feedback.hidden = true; ui.feedback.textContent = ''; }
  function setBusy(on) {
    state.busy = on; ui.apply.disabled = on; ui.download.disabled = on || !state.readyBlob;
    ui.reset.disabled = on; ui.newFile.disabled = on;
    ui.apply.textContent = on ? '處理中…' : tools[state.tool].action;
  }
  function resetMask() {
    const canvas = ui.maskCanvas;
    canvas.width = state.working.width; canvas.height = state.working.height;
    canvasContext(canvas).clearRect(0, 0, canvas.width, canvas.height);
    state.selectionHistory = []; state.cropRect = null;
  }
  function maskHasPixels() {
    const canvas = ui.maskCanvas;
    if (!canvas.width || !canvas.height) return false;
    const data = canvasContext(canvas).getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 3; i < data.length; i += 40) if (data[i] > 30) return true;
    return false;
  }
  function drawWorking() {
    const canvas = ui.canvas, src = state.comparing ? state.original : (state.preview || state.working);
    canvas.width = src.width; canvas.height = src.height;
    const context = canvasContext(canvas);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(src, 0, 0);
    ui.canvases.style.width = Math.min(1000, canvas.width) + 'px';
    ui.maskCanvas.style.visibility = state.comparing ? 'hidden' : 'visible';
    ui.dimensions.textContent = src.width + ' × ' + src.height + ' px';
  }
  function invalidateOutput() {
    state.readyBlob = null; state.readyExtension = null; state.preview = null; ui.download.disabled = true;
    clearFeedback();
  }
  function currentFormat() { return $('imgFormat')?.value || (state.file?.type === 'image/png' ? 'png' : 'jpg'); }
  function createSelect(id, options, value) {
    const node = document.createElement('select'); node.id = id;
    options.forEach(([v, label]) => {
      const option = document.createElement('option'); option.value = v; option.textContent = label;
      if (v === value) option.selected = true;
      node.append(option);
    });
    return node;
  }
  function wrapField(label, field, extra = '') {
    const container = document.createElement('div'); container.className = 'setting' + (extra ? ' ' + extra : '');
    const text = document.createElement('label'); text.textContent = label; if (field.id) text.htmlFor = field.id;
    container.append(text, field); return container;
  }
  function numberInput(id, value) {
    const el = document.createElement('input'); el.type = 'number'; el.min = '1'; el.max = '12000'; el.step = '1'; el.id = id; el.value = String(value); return el;
  }
  function addInfo(text) { const p = document.createElement('div'); p.className = 'image-input-note'; p.textContent = text; return p; }
  function configureSettings() {
    const elements = document.createDocumentFragment();
    if (['repair', 'convert', 'resize', 'crop'].includes(state.tool)) {
      elements.append(wrapField('下載格式', createSelect('imgFormat', [['png','PNG（無損）'],['jpg','JPG（較小）'],['webp','WebP（較小）']], state.file?.type === 'image/png' ? 'png' : 'jpg')));
    }
    if (state.tool === 'compress') {
      elements.append(wrapField('壓縮格式', createSelect('imgFormat', [['webp','WebP'],['jpg','JPG']], 'webp')));
      const quality = document.createElement('input'); quality.id = 'imgQuality'; quality.type = 'range'; quality.min = '35'; quality.max = '95'; quality.step = '5'; quality.value = '75';
      const qualityField = wrapField('壓縮品質', quality); qualityField.append(addInfo('75%：一般建議；越低通常越省空間')); elements.append(qualityField);
      elements.append(wrapField('最長邊（像素）', createSelect('maxEdge', [['0','不縮小尺寸'],['2560','2560'],['1920','1920'],['1280','1280'],['960','960']], '0')));
      elements.append(addInfo('透明圖片使用 JPG 會轉成白色背景；WebP 可能保留透明度。'));
    }
    if (state.tool === 'resize') {
      const w = numberInput('outputWidth', state.working.width || 1000), h = numberInput('outputHeight', state.working.height || 1000);
      const locked = document.createElement('label'); locked.className = 'image-setting-checkbox';
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.id = 'lockRatio'; checkbox.checked = true;
      locked.append(checkbox, document.createTextNode('維持原本比例'));
      const ratio = (state.working.width || 1) / (state.working.height || 1);
      w.addEventListener('input', () => { if (checkbox.checked && Number(w.value)>0) h.value = String(Math.max(1,Math.round(Number(w.value)/ratio))); });
      h.addEventListener('input', () => { if (checkbox.checked && Number(h.value)>0) w.value = String(Math.max(1,Math.round(Number(h.value)*ratio))); });
      elements.append(wrapField('寬度（px）', w), wrapField('高度（px）', h), locked);
    }
    if (state.tool === 'repair') elements.append(addInfo('只適合有權編輯的圖片。演算法依據附近像素推估顏色，不會還原被遮住的真實影像。'));
    ui.fields.replaceChildren(elements);
    ui.settings.hidden = !state.file;
  }
  function switchTool(key, updateURL = true) {
    if (!tools[key] || state.busy) return;
    state.tool = key;
    state.comparing = false; state.preview = null; ui.original.setAttribute('aria-pressed', 'false');
    ui.original.textContent = '比較原圖';
    ui.heading.textContent = tools[key].title; ui.description.textContent = tools[key].description;
    ui.tip.textContent = tools[key].tip;
    ui.repairControls.hidden = !['repair','crop'].includes(key);
    ui.repairControls.querySelector('.repair-control-group').hidden = key === 'crop';
    ui.repairControls.querySelector('.brush-label').hidden = key === 'crop';
    ui.brush.hidden = key === 'crop';
    ui.undoSelect.hidden = key === 'crop';
    ui.undoEdit.hidden = false;
    ui.summary.textContent = key === 'repair' ? '手動標記要修補的範圍' : '圖片處理';
    ui.hint.textContent = key === 'repair' ? '免 AI，複雜背景效果有限' : '不會上傳原始圖片';
    ui.apply.textContent = tools[key].action;
    document.querySelectorAll('[data-image-tool]').forEach(el => {
      const selected = el.dataset.imageTool === key;
      el.classList.toggle('active', selected); el.setAttribute('aria-pressed', String(selected));
    });
    if (state.file) {
      resetMask(); drawWorking(); configureSettings();
    }
    state.readyBlob = null; state.readyExtension = null;
    ui.download.disabled = true; ui.apply.disabled = !state.file;
    if (updateURL) history.replaceState({}, '', './image-tools.html?tool=' + encodeURIComponent(key));
    clearFeedback();
  }
  async function pickImage(files) {
    if (state.busy || !files?.length) return;
    const file = files[0]; if (!(/^image\/(jpeg|png|webp)$/i.test(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name))) {
      feedback('請選擇 JPG、PNG 或 WebP 圖片。', 'error'); return;
    }
    if (file.size > 80 * 1048576) { feedback('圖片大於 80 MB。請先縮小檔案再試一次。', 'error'); return; }
    const generation = ++state.generation;
    setBusy(true); feedback('正在讀取圖片…', 'busy');
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      await new Promise((resolve,reject) => { img.onload=resolve;img.onerror=()=>reject(new Error('無法開啟這張圖片。'));img.src=url; });
      if (generation !== state.generation) return;
      const maxSide = 4096, maxPixels = 14000000;
      const ratio = Math.min(1, maxSide / Math.max(img.naturalWidth,img.naturalHeight), Math.sqrt(maxPixels / (img.naturalWidth*img.naturalHeight)));
      const w = Math.max(1,Math.round(img.naturalWidth*ratio)), h = Math.max(1,Math.round(img.naturalHeight*ratio));
      state.file=file; state.working.width=w;state.working.height=h;state.original.width=w;state.original.height=h;
      canvasContext(state.working).drawImage(img,0,0,w,h);
      canvasContext(state.original).drawImage(img,0,0,w,h);
      state.edits=[];state.preview=null;state.readyBlob=null;state.readyExtension=null;
      state.comparing=false;
      resetMask();drawWorking();configureSettings();
      ui.filename.textContent=file.name;
      ui.upload.hidden=true;ui.workspace.hidden=false;ui.settings.hidden=false;ui.actions.hidden=false;ui.reset.hidden=false;
      ui.original.hidden=false;ui.download.disabled=true;ui.apply.disabled=false;
      ui.summary.textContent='目前圖片：'+formatBytes(file.size);
      if (ratio<1) feedback('圖片原始尺寸較大，已縮至 '+w+' × '+h+' 像素處理，以避免瀏覽器記憶體不足。','');
      else clearFeedback();
    }catch(err){feedback('圖片載入失敗：'+err.message,'error');}
    finally{URL.revokeObjectURL(url);ui.input.value='';setBusy(false);}
  }
  function resetAll() {
    if (state.busy) return;
    state.generation++;state.file=null;state.edits=[];state.preview=null;state.readyBlob=null;state.readyExtension=null;
    state.comparing=false;resetMask();ui.input.value='';
    ui.upload.hidden=false;ui.workspace.hidden=true;ui.settings.hidden=true;ui.actions.hidden=true;ui.reset.hidden=true;
    clearFeedback();
  }
  function posFor(event) {
    const rect = ui.maskCanvas.getBoundingClientRect();
    const x = Math.min(ui.maskCanvas.width,Math.max(0,(event.clientX-rect.left)*ui.maskCanvas.width/rect.width));
    const y = Math.min(ui.maskCanvas.height,Math.max(0,(event.clientY-rect.top)*ui.maskCanvas.height/rect.height));
    return {x,y};
  }
  function renderStroke(a,b) {
    const context=canvasContext(ui.maskCanvas);const size=Number(ui.brush.value) * (ui.maskCanvas.width / ui.maskCanvas.getBoundingClientRect().width);
    context.strokeStyle='rgba(224,48,83,0.66)';context.fillStyle='rgba(224,48,83,0.66)';
    context.lineCap='round';context.lineJoin='round';context.lineWidth=Math.max(2,size);
    context.beginPath();context.moveTo(a.x,a.y);context.lineTo(b.x,b.y);context.stroke();
  }
  function renderRectangle(a,b) {
    const context=canvasContext(ui.maskCanvas);
    context.fillStyle='rgba(224,48,83,0.48)';context.strokeStyle='rgba(198,26,60,0.9)';
    const x=Math.min(a.x,b.x),y=Math.min(a.y,b.y),w=Math.abs(a.x-b.x),h=Math.abs(a.y-b.y);
    context.fillRect(x,y,w,h);
    context.lineWidth=Math.max(1,ui.maskCanvas.width/ui.maskCanvas.getBoundingClientRect().width);
    context.strokeRect(x,y,w,h);
    return {x:Math.round(x),y:Math.round(y),width:Math.round(w),height:Math.round(h)};
  }
  function pointerDown(event) {
    if (!state.file || state.busy || state.comparing || !['repair','crop'].includes(state.tool))return;
    event.preventDefault();
    ui.maskCanvas.setPointerCapture?.(event.pointerId);
    const p=posFor(event); state.selecting=true; state.rectStart=p;
    const context=canvasContext(ui.maskCanvas);
    if (state.tool==='crop') context.clearRect(0,0,ui.maskCanvas.width,ui.maskCanvas.height);
    else {
      state.selectionHistory.push(context.getImageData(0,0,ui.maskCanvas.width,ui.maskCanvas.height));
      if(state.selectionHistory.length>6)state.selectionHistory.shift();
      state.beforeMask=context.getImageData(0,0,ui.maskCanvas.width,ui.maskCanvas.height);
    }
    if (state.tool==='repair'&&state.mode==='brush')renderStroke(p,p);
    else if(state.tool==='crop') state.cropRect=null;
    invalidateOutput();
  }
  function pointerMove(event){
    if(!state.selecting)return;
    event.preventDefault();
    const p=posFor(event), context=canvasContext(ui.maskCanvas);
    if(state.tool==='repair'&&state.mode==='brush'){renderStroke(state.rectStart,p);state.rectStart=p;}
    else {context.clearRect(0,0,ui.maskCanvas.width,ui.maskCanvas.height);if(state.tool==='repair'&&state.beforeMask)context.putImageData(state.beforeMask,0,0);const start=state.rectStart;
      const box=renderRectangle(start,p);
      if(state.tool==='crop')state.cropRect=box;
    }
  }
  function pointerUp(event){
    if(!state.selecting)return;
    pointerMove(event);state.selecting=false;state.beforeMask=null;
    ui.apply.disabled=false;
  }
  function saveUndo(){
    const original=state.working;
    const copy=document.createElement('canvas');copy.width=original.width;copy.height=original.height;
    canvasContext(copy).drawImage(original,0,0);
    state.edits.push(copy);if(state.edits.length>3)state.edits.shift();
  }
  function undoEdit(){
    if(state.busy||!state.edits.length)return;
    state.working=state.edits.pop();
    state.preview=null;resetMask();state.comparing=false;drawWorking();configureSettings();invalidateOutput();
    feedback('已還原上一個編輯步驟。');
  }
  async function toBlob(canvas,format,quality){
    const type='image/'+(format==='jpg'?'jpeg':format);
    const working = document.createElement('canvas');
    working.width=canvas.width;working.height=canvas.height;
    const ctx=canvasContext(working);
    if(format==='jpg'){ctx.fillStyle='#fff';ctx.fillRect(0,0,working.width,working.height);}
    ctx.drawImage(canvas,0,0);
    return await new Promise((resolve,reject)=>working.toBlob(blob=>{working.width=0;working.height=0;blob?resolve(blob):reject(new Error('無法建立輸出圖片。'));},type,quality));
  }
  function placeBlob(blob,ext,label){
    state.readyBlob=blob;state.readyExtension=ext;
    ui.download.disabled=false;
    ui.summary.textContent=label||'可以下載結果';
  }
  function repairPixels(img, maskRGBA, width, height) {
    // 使用邊界向內填補；保留不透明原圖的 Alpha，避免修補處出現透明破洞。
    const pixels = width * height;
    const data = img.data;
    const original = new Uint8ClampedArray(data);
    const selectedMask = new Uint8Array(pixels);
    let selected = 0;
    for (let i = 0; i < pixels; i += 1) {
      if (maskRGBA[i * 4 + 3] > 22) {
        selectedMask[i] = 1;
        selected += 1;
      }
    }
    if (!selected) throw new Error('請先用筆刷或框選要修補的區域。');
    if (selected > 350000) throw new Error('選取範圍太大，請縮小筆刷或分次處理。');
    if (selected >= pixels * .5) throw new Error('選取範圍超過圖片一半，附近資料不足，無法可靠修補。');

    // 補上標記邊緣一圈，避免筆刷抗鋸齒留下浮水印的彩色邊。
    const inputMask = selectedMask.slice();
    for (let i = 0; i < pixels; i += 1) {
      if (!inputMask[i]) continue;
      const x = i % width, y = Math.floor(i / width);
      const near = [
        x > 0 ? i - 1 : -1,
        x + 1 < width ? i + 1 : -1,
        y > 0 ? i - width : -1,
        y + 1 < height ? i + width : -1
      ];
      for (const n of near) {
        if (n >= 0 && !selectedMask[n]) { selectedMask[n] = 1; selected += 1; }
      }
    }
    if (selected >= pixels * .5 || selected > 400000) throw new Error('修補區域太大，請分次處理。');

    // 由已知的周圍影像起始。圖片邊界外不是有效的取樣來源。
    const queue = new Int32Array(selected);
    const queued = new Uint8Array(pixels);
    let head = 0, tail = 0, filled = 0;
    const offsets = [
      [-1,0],[1,0],[0,-1],[0,1],
      [-1,-1],[1,-1],[-1,1],[1,1]
    ];
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = y * width + x;
        if (!selectedMask[i]) continue;
        let boundary = false;
        for (const [dx,dy] of offsets) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
          if (!selectedMask[yy * width + xx]) { boundary = true; break; }
        }
        if (boundary) { queue[tail++] = i; queued[i] = 1; }
      }
    }
    if (!tail) throw new Error('選取區域沒有足夠的周圍影像，請縮小選取範圍。');

    const samples = [
      [-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1],
      [-2,0],[2,0],[0,-2],[0,2],[-2,-1],[2,-1],[-2,1],[2,1],
      [-1,-2],[1,-2],[-1,2],[1,2]
    ];
    while (head < tail) {
      const i = queue[head++], x = i % width, y = Math.floor(i / width);
      if (!selectedMask[i]) continue;
      let r = 0, g = 0, b = 0, alpha = 0, weight = 0;
      for (const [dx,dy] of samples) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
        const n = yy * width + xx;
        if (selectedMask[n]) continue;
        const off = n * 4;
        const a = data[off + 3] / 255;
        if (a < .03) continue;
        const w = a / (dx * dx + dy * dy);
        r += data[off] * w;
        g += data[off + 1] * w;
        b += data[off + 2] * w;
        alpha += data[off + 3] * w;
        weight += w;
      }
      if (!weight) continue;
      const off = i * 4;
      data[off] = r / weight;
      data[off + 1] = g / weight;
      data[off + 2] = b / weight;
      // 原圖不透明的區域永遠保持不透明，不可因透明鄰近像素留下洞。
      data[off + 3] = Math.max(original[off + 3], alpha / weight);
      selectedMask[i] = 0;
      filled += 1;
      for (const [dx,dy] of offsets) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
        const n = yy * width + xx;
        if (selectedMask[n] && !queued[n]) {
          queued[n] = 1;
          queue[tail++] = n;
        }
      }
    }
    // 若透明背景等狀況造成修補不完整，禁止輸出破損結果。
    if (filled !== selected) throw new Error('所選區域附近缺少可用的影像像素。沒有修改原圖，請縮小範圍再試一次。');
    return filled;
  }
  async function applyRepair(){
    const w=state.working.width,h=state.working.height;
    const mask=canvasContext(ui.maskCanvas).getImageData(0,0,w,h);
    const img=canvasContext(state.working).getImageData(0,0,w,h);
    const count=repairPixels(img,mask.data,w,h);
    saveUndo();canvasContext(state.working).putImageData(img,0,0);
    resetMask();drawWorking();
    const ext=currentFormat();const blob=await toBlob(state.working,ext,.92);
    placeBlob(blob,ext,'修補完成，可下載');
    return '已修補約 '+count.toLocaleString('zh-TW')+' 個像素。請檢查效果，複雜背景可能不自然。';
  }
  async function applyCrop(){
    const rect=state.cropRect;
    if(!rect||rect.width<4||rect.height<4)throw new Error('請先拖曳框出要保留的範圍。');
    const downloadFormat=currentFormat();
    saveUndo();
    const trimmed=document.createElement('canvas');trimmed.width=rect.width;trimmed.height=rect.height;
    canvasContext(trimmed).drawImage(state.working,rect.x,rect.y,rect.width,rect.height,0,0,rect.width,rect.height);
    state.working=trimmed;
    resetMask();drawWorking();configureSettings();
    const ext=downloadFormat;const blob=await toBlob(state.working,ext,.92);
    placeBlob(blob,ext,'裁切尺寸：'+rect.width+' × '+rect.height);
    return '裁切完成，請檢查圖片預覽。';
  }
  async function applyResize(){
    const w=Number($('outputWidth')?.value),h=Number($('outputHeight')?.value);
    if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||w>12000||h>12000||w*h>20000000)throw new Error('請輸入有效尺寸（最長邊 12000 像素、總像素不超過 2000 萬）。');
    const downloadFormat=currentFormat();
    saveUndo();
    const resized=document.createElement('canvas');resized.width=w;resized.height=h;
    canvasContext(resized).drawImage(state.working,0,0,w,h);state.working=resized;
    resetMask();drawWorking();configureSettings();
    const ext=downloadFormat;const blob=await toBlob(state.working,ext,.92);
    placeBlob(blob,ext,'調整完成：'+w+' × '+h);
    return '尺寸已調整為 '+w+' × '+h+' 像素。';
  }
  async function previewOutput(blob){
    try {
      const image=await createImageBitmap(blob);
      const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
      canvasContext(canvas).drawImage(image,0,0);image.close();
      state.preview=canvas;drawWorking();
    }catch(err){
      console.warn('無法顯示壓縮後預覽，但檔案仍可下載：',err);
    }
  }
  async function applyConvert(){
    const ext=currentFormat();const blob=await toBlob(state.working,ext,.92);
    placeBlob(blob,ext,'轉檔完成：'+formatBytes(blob.size));
    await previewOutput(blob);
    return '已轉為 '+ext.toUpperCase()+'，檔案大小 '+formatBytes(blob.size)+'。';
  }
  async function applyCompress(){
    const format=currentFormat();
    const max=Number($('maxEdge').value), quality=Number($('imgQuality').value)/100;
    const source=state.working;const ratio=max>0?Math.min(1,max/Math.max(source.width,source.height)):1;
    const w=Math.max(1,Math.round(source.width*ratio)),h=Math.max(1,Math.round(source.height*ratio));
    const tmp=document.createElement('canvas');tmp.width=w;tmp.height=h;
    canvasContext(tmp).drawImage(source,0,0,w,h);
    const blob=await toBlob(tmp,format,quality);tmp.width=0;tmp.height=0;
    const difference=state.file.size-blob.size;
    const percent=state.file.size>0?Math.abs(difference/state.file.size*100).toFixed(1):'0.0';
    placeBlob(blob,format,'原檔 '+formatBytes(state.file.size)+' → '+formatBytes(blob.size));
    await previewOutput(blob);
    return difference>=0?'壓縮完成，約減少 '+percent+'%（'+formatBytes(blob.size)+'）。':'輸出 '+formatBytes(blob.size)+'，比原始檔大 '+percent+'%。可降低品質或尺寸再試。';
  }
  async function apply(){
    if(!state.file||state.busy)return;
    setBusy(true);feedback('正在處理圖片…','busy');
    await new Promise(resolve=>requestAnimationFrame(resolve));
    try{
      let result='';
      if(state.tool==='repair')result=await applyRepair();
      if(state.tool==='crop')result=await applyCrop();
      if(state.tool==='resize')result=await applyResize();
      if(state.tool==='compress')result=await applyCompress();
      if(state.tool==='convert')result=await applyConvert();
      feedback(result);
    }catch(err){console.error('圖片處理失敗：',err);feedback('處理失敗：'+err.message,'error');}
    finally{setBusy(false);}
  }
  function download(){
    if(!state.readyBlob||state.busy)return;
    const url=URL.createObjectURL(state.readyBlob);
    const a=document.createElement('a');a.href=url;a.download=filename(state.file)+'_'+state.tool+'.'+state.readyExtension;
    document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  }

  ui.nav.addEventListener('click',event=>{const button=event.target.closest('[data-image-tool]');if(button)switchTool(button.dataset.imageTool);});
  ui.upload.addEventListener('click',event=>{if(event.target!==ui.browse&&!state.busy)ui.input.click();});
  ui.upload.addEventListener('keydown',event=>{if(event.target===ui.upload&&(event.key==='Enter'||event.key===' ')){event.preventDefault();ui.input.click();}});
  ui.browse.addEventListener('click',event=>{event.stopPropagation();ui.input.click();});
  ui.newFile.addEventListener('click',()=>ui.input.click());
  ui.reset.addEventListener('click',resetAll);
  // 直接接收瀏覽器複製的圖片位元資料，不需先下載或傳送至伺服器。
  document.addEventListener('paste', event => {
    if (state.busy) return;
    const target = event.target;
    if (target && (target.isContentEditable || target.closest?.('input,textarea,[contenteditable="true"]'))) return;
    const items = Array.from(event.clipboardData?.items || []);
    const imageItem = items.find(item => item.kind === 'file' && /^image\/(png|jpeg|webp)$/i.test(item.type));
    const pasted = imageItem?.getAsFile() || Array.from(event.clipboardData?.files || []).find(file => /^image\/(png|jpeg|webp)$/i.test(file.type));
    if (!pasted) return;
    event.preventDefault();
    const extension = pasted.type === 'image/jpeg' ? 'jpg' : pasted.type === 'image/webp' ? 'webp' : 'png';
    const file = new File([pasted], '貼上圖片-' + Date.now() + '.' + extension, { type: pasted.type });
    pickImage([file]);
  });
  ui.input.addEventListener('change',()=>pickImage(ui.input.files));
  for(const name of ['dragenter','dragover'])ui.upload.addEventListener(name,event=>{event.preventDefault();ui.upload.classList.add('dragover');});
  for(const name of ['dragleave','drop'])ui.upload.addEventListener(name,event=>{event.preventDefault();ui.upload.classList.remove('dragover');});
  ui.upload.addEventListener('drop',event=>{if(!state.busy)pickImage(event.dataTransfer.files);});
  ui.maskCanvas.addEventListener('pointerdown',pointerDown);
  ui.maskCanvas.addEventListener('pointermove',pointerMove);
  ui.maskCanvas.addEventListener('pointerup',pointerUp);
  ui.maskCanvas.addEventListener('pointercancel',pointerUp);
  document.querySelectorAll('[data-draw-mode]').forEach(btn=>btn.addEventListener('click',()=>{
    state.mode=btn.dataset.drawMode;resetMask();
    document.querySelectorAll('[data-draw-mode]').forEach(b=>{const active=b===btn;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
  }));
  ui.brush.addEventListener('input',()=>ui.brushLabel.textContent=ui.brush.value);
  ui.clearSelect.addEventListener('click',resetMask);
  ui.undoSelect.addEventListener('click',()=>{
    if(!state.selectionHistory.length)return;
    const last=state.selectionHistory.pop();
    canvasContext(ui.maskCanvas).putImageData(last,0,0);
  });
  ui.undoEdit.addEventListener('click',undoEdit);
  ui.original.addEventListener('click',()=>{
    if(!state.file||state.busy)return;
    state.comparing=!state.comparing;drawWorking();
    ui.original.textContent=state.comparing?'返回編輯':'比較原圖';
    ui.original.setAttribute('aria-pressed',String(state.comparing));
  });
  ui.apply.addEventListener('click',apply);
  ui.download.addEventListener('click',download);
  const initial=new URLSearchParams(location.search).get('tool');
  switchTool(tools[initial]?initial:'repair',false);
})();
