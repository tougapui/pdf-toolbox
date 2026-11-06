# PDF 小事務所

一個免費、免登入的瀏覽器 PDF 工具網頁，介面使用台灣繁體中文，支援桌面及手機。

## 功能

- **合併 PDF**：可上傳多份 PDF，調整順序後合併。
- **拆分 PDF**：選取頁碼或頁面區間，合成一份 PDF，或把各頁分別存成 PDF 並壓成 ZIP。
- **旋轉 PDF**：支援指定頁面與 90°、180°、270° 旋轉。
- **PDF 轉圖片**：支援 PNG / JPG、指定頁面、三種解析度，ZIP 下載。
- **圖片轉 PDF**：支援 JPG、PNG、WebP，可調整排序及 A4 紙張。
- **PDF 擷取文字**：擷取既有文字圖層並匯出 UTF-8 TXT。

> 這個工具**不包含 OCR（掃描影像文字辨識）**，不支援 PDF 轉成可編輯 Word／PowerPoint，也不會解開受密碼保護的文件。

## 隱私與技術

整個網站是純前端靜態網頁，檔案透過瀏覽器 File API 讀取，以 PDF-Lib、PDF.js、JSZip 在瀏覽器內進行處理，**原始檔案不會經由程式碼上傳到任何伺服器**。網站需要網路連線載入 CDN 上的第三方 JavaScript 程式庫；若對機密文件有更嚴格的安全需求，建議下載程式碼並將依賴套件改為自行託管及離線使用。

核心套件版本：
- pdf-lib 1.17.1
- PDF.js 3.11.174
- JSZip 3.10.1

較大的 PDF 或圖片會使用較多裝置記憶體，請分批處理。

## 本機使用

下載此儲存庫，直接用瀏覽器開啟 index.html 即可（但需網路連線載入 CDN）；若瀏覽器限制跨來源腳本或 Worker，可在此資料夾開啟本機靜態伺服器：

~~~bash
python3 -m http.server 8000
~~~

然後開啟 http://localhost:8000/ 。

## 部署

支援 GitHub Pages 或 Vercel 等靜態網頁服務。

GitHub Pages：GitHub 儲存庫 → Settings → Pages → Source 設為 Deploy from a branch → Branch 選 main、/(root) → Save。網站的預期網址為：

https://tougapui.github.io/pdf-toolbox/

本程式採 MIT License。