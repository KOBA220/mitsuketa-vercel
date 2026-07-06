import './style.css';
import './fix.css';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth/mammoth.browser';

const app = document.querySelector('#app');
const state = { oldFile: null, newFile: null, result: null, sensitivity: 28, minArea: 10 };

app.innerHTML = `
  <header class="topbar">
    <a class="brand" href="#"><span class="brand-mark">✓</span><span>みつけた！</span></a>
    <span class="tagline">ファイル差分チェッカー</span>
    <button class="help" id="helpBtn" aria-label="使い方">?</button>
  </header>
  <main>
    <section class="hero">
      <div><p class="eyebrow">COMPARE WITH CONFIDENCE</p><h1>去年と今年、<br><em>変わったところ</em>だけ。</h1></div>
      <p class="intro">画像・Word・Excelを2つ選ぶだけ。変更点を赤丸やマーカーで、誰にでも伝わる形にします。</p>
    </section>

    <section class="workspace" aria-label="比較ファイル選択">
      <div class="dropzone old" data-side="old" tabindex="0">
        <input id="oldInput" type="file" accept="image/*,.docx,.xlsx,.xls,.csv" hidden>
        <div class="step">01</div><div class="drop-icon">↙</div>
        <div><span class="role">OLD / 旧</span><h2>比較元ファイル</h2><p>ここにドロップ、またはクリック</p><span class="filename">未選択</span></div>
      </div>
      <div class="swap">VS</div>
      <div class="dropzone new" data-side="new" tabindex="0">
        <input id="newInput" type="file" accept="image/*,.docx,.xlsx,.xls,.csv" hidden>
        <div class="step">02</div><div class="drop-icon">↘</div>
        <div><span class="role">NEW / 新</span><h2>比較先ファイル</h2><p>ここにドロップ、またはクリック</p><span class="filename">未選択</span></div>
      </div>
      <div class="actions">
        <p class="support">対応形式 <b>PNG / JPG / DOCX / XLSX / CSV</b></p>
        <button id="compareBtn" class="compare" disabled><span>差分をプレビュー</span><b>→</b></button>
      </div>
    </section>

    <section id="result" class="result" hidden></section>
  </main>
  <dialog id="helpDialog"><button class="close" aria-label="閉じる">×</button><h2>使い方</h2><ol><li>左に昨年度などの「旧」ファイルを選びます。</li><li>右に今年度などの「新」ファイルを選びます。</li><li>「差分をプレビュー」を押します。</li></ol><p>画像は変化を赤丸で、Wordは変更行を、Excelは変更セルを色分けします。ファイルは外部へ送信されず、この端末内だけで処理されます。</p></dialog>
`;

const resultEl = document.querySelector('#result');
const compareBtn = document.querySelector('#compareBtn');

document.querySelectorAll('.dropzone').forEach(zone => {
  const side = zone.dataset.side;
  const input = document.querySelector(`#${side}Input`);
  zone.addEventListener('click', () => input.click());
  zone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') input.click(); });
  input.addEventListener('change', () => setFile(side, input.files[0]));
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragging'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragging'));
  zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('dragging'); setFile(side, e.dataTransfer.files[0]); });
});

function setFile(side, file) {
  if (!file) return;
  state[`${side}File`] = file;
  const zone = document.querySelector(`.dropzone.${side}`);
  zone.classList.add('filled');
  zone.querySelector('.filename').textContent = `${file.name} · ${formatBytes(file.size)}`;
  compareBtn.disabled = !(state.oldFile && state.newFile);
}

compareBtn.addEventListener('click', async () => {
  compareBtn.classList.add('loading'); compareBtn.querySelector('span').textContent = '比較しています…'; compareBtn.disabled = true;
  try {
    if (!sameKind(state.oldFile, state.newFile)) throw new Error('同じ種類のファイルを2つ選んでください。');
    if (state.oldFile.type.startsWith('image/')) await compareImages();
    else if (/\.docx$/i.test(state.oldFile.name)) await compareDocuments();
    else await compareSheets();
    wireAi(); resultEl.hidden = false; resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) { showError(err.message); }
  finally { compareBtn.classList.remove('loading'); compareBtn.querySelector('span').textContent = 'もう一度比較する'; compareBtn.disabled = false; }
});

function sameKind(a, b) {
  const kind = f => f.type.startsWith('image/') ? 'image' : /\.docx$/i.test(f.name) ? 'docx' : /\.(xlsx?|csv)$/i.test(f.name) ? 'sheet' : 'other';
  return kind(a) === kind(b) && kind(a) !== 'other';
}

async function compareImages() {
  const [oldImg, newImg] = await Promise.all([loadImage(state.oldFile), loadImage(state.newFile)]);
  state.aiPayload = { kind:'image', old:await fileAsImage(state.oldFile), new:await fileAsImage(state.newFile) };
  const w = Math.max(oldImg.width, newImg.width), h = Math.max(oldImg.height, newImg.height);
  const a = imageData(oldImg, w, h), b = imageData(newImg, w, h);
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < mask.length; i++) {
    const p = i * 4;
    const d = (Math.abs(a.data[p]-b.data[p]) + Math.abs(a.data[p+1]-b.data[p+1]) + Math.abs(a.data[p+2]-b.data[p+2])) / 3;
    if (d > state.sensitivity) mask[i] = 1;
  }
  const expanded = dilate(mask, w, h, 2);
  const boxes = components(expanded, w, h).filter(x => x.area >= state.minArea).map(x => ({...x, pad: 9}));
  const url = URL.createObjectURL(state.newFile);
  resultEl.innerHTML = resultHeader(boxes.length, '画像上の変更候補') + `
    <div class="image-result">
      <div class="preview-card"><div class="preview-label">NEW / 変更箇所</div><div class="image-wrap"><img id="resultImage" src="${url}" alt="新しい画像"><canvas id="markCanvas"></canvas></div></div>
      <aside class="summary"><h3>検出結果</h3><div class="big-number">${boxes.length}<small>箇所</small></div><p>赤丸は画素の変化をまとめた領域です。細かな印刷差や圧縮ノイズも候補に含まれる場合があります。</p><label>検出感度<input id="sensitivity" type="range" min="8" max="70" value="${state.sensitivity}"></label><button id="downloadBtn" class="secondary">赤丸画像を保存</button></aside>
    </div>`;
  const img = document.querySelector('#resultImage');
  await img.decode(); drawMarks(img, boxes, w, h);
  document.querySelector('#sensitivity').addEventListener('change', e => { state.sensitivity = +e.target.value; compareImages(); });
  document.querySelector('#downloadBtn').addEventListener('click', () => downloadMarked(img, boxes, w, h));
}

function drawMarks(img, boxes, w, h) {
  const c = document.querySelector('#markCanvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d'); ctx.clearRect(0,0,w,h); ctx.strokeStyle='#ef3d31'; ctx.lineWidth=Math.max(3,w/180); ctx.setLineDash([12,5]);
  boxes.forEach((b,i) => { const p=b.pad; ctx.beginPath(); ctx.ellipse((b.minX+b.maxX)/2,(b.minY+b.maxY)/2,(b.maxX-b.minX)/2+p,(b.maxY-b.minY)/2+p,0,0,Math.PI*2); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle='#ef3d31'; ctx.beginPath(); ctx.arc(b.minX-p,b.minY-p,12,0,Math.PI*2); ctx.fill(); ctx.fillStyle='white'; ctx.font='bold 13px sans-serif'; ctx.textAlign='center'; ctx.fillText(i+1,b.minX-p,b.minY-p+4); ctx.setLineDash([12,5]); });
}

async function compareDocuments() {
  const [a,b] = await Promise.all([state.oldFile.arrayBuffer(), state.newFile.arrayBuffer()]);
  const [oldDoc,newDoc] = await Promise.all([mammoth.extractRawText({arrayBuffer:a}), mammoth.extractRawText({arrayBuffer:b})]);
  state.aiPayload = { kind:'text', old:oldDoc.value, new:newDoc.value };
  renderLineDiff(oldDoc.value, newDoc.value, 'Word文書の変更');
}

async function compareSheets() {
  const [a,b] = await Promise.all([state.oldFile.arrayBuffer(), state.newFile.arrayBuffer()]);
  const oldWb=XLSX.read(a), newWb=XLSX.read(b); const names=[...new Set([...oldWb.SheetNames,...newWb.SheetNames])];
  let changed=0, html='', oldAi='', newAi='';
  names.forEach(name => {
    const oldRows=oldWb.Sheets[name]?XLSX.utils.sheet_to_json(oldWb.Sheets[name],{header:1,defval:''}):[];
    const newRows=newWb.Sheets[name]?XLSX.utils.sheet_to_json(newWb.Sheets[name],{header:1,defval:''}):[];
    oldAi += `\n【${name}】\n` + oldRows.map(r=>r.join('\t')).join('\n'); newAi += `\n【${name}】\n` + newRows.map(r=>r.join('\t')).join('\n');
    const rows=Math.max(oldRows.length,newRows.length), cols=Math.max(0,...oldRows.map(r=>r.length),...newRows.map(r=>r.length));
    let body='';
    for(let r=0;r<rows;r++){ body+='<tr><th>'+ (r+1) +'</th>'; for(let c=0;c<cols;c++){const ov=oldRows[r]?.[c]??'',nv=newRows[r]?.[c]??'',diff=String(ov)!==String(nv); if(diff)changed++; body+=`<td class="${diff?'changed':''}" title="${diff?'旧: '+esc(ov):''}">${esc(nv)}${diff?`<span class="old-value">旧: ${esc(ov)||'（空白）'}</span>`:''}</td>`;} body+='</tr>'; }
    html+=`<section class="sheet"><h3>${esc(name)}</h3><div class="table-scroll"><table><thead><tr><th></th>${Array.from({length:cols},(_,i)=>`<th>${columnName(i)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div></section>`;
  });
  resultEl.innerHTML=resultHeader(changed,'変更セル')+html;
  state.aiPayload = { kind:'text', old:oldAi, new:newAi };
}

function renderLineDiff(oldText,newText,label){
  const oldLines=oldText.split(/\r?\n/),newLines=newText.split(/\r?\n/), ops=diffLines(oldLines,newLines); let changed=0;
  const rows=ops.map(op=>{if(op.type!=='same')changed++; return `<div class="diff-row ${op.type}"><span>${op.oldNo||''}</span><span>${op.newNo||''}</span><i>${op.type==='add'?'+':op.type==='del'?'−':' '}</i><p>${esc(op.text)||'&nbsp;'}</p></div>`}).join('');
  resultEl.innerHTML=resultHeader(changed,label)+`<div class="legend"><b class="add">追加</b><b class="del">削除</b></div><div class="document-diff">${rows}</div>`;
}

function diffLines(a,b){ const n=a.length,m=b.length,dp=Array.from({length:n+1},()=>new Uint16Array(m+1)); for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)dp[i][j]=a[i]===b[j]?dp[i+1][j+1]+1:Math.max(dp[i+1][j],dp[i][j+1]); let i=0,j=0,out=[]; while(i<n&&j<m){if(a[i]===b[j])out.push({type:'same',text:a[i],oldNo:++i,newNo:++j});else if(dp[i+1][j]>=dp[i][j+1])out.push({type:'del',text:a[i],oldNo:++i});else out.push({type:'add',text:b[j],newNo:++j});} while(i<n)out.push({type:'del',text:a[i],oldNo:++i});while(j<m)out.push({type:'add',text:b[j],newNo:++j});return out; }
function imageData(img,w,h){const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d',{willReadFrequently:true});x.fillStyle='white';x.fillRect(0,0,w,h);x.drawImage(img,0,0,w,h);return x.getImageData(0,0,w,h)}
function loadImage(file){return new Promise((res,rej)=>{const i=new Image();i.onload=()=>{URL.revokeObjectURL(i.src);res(i)};i.onerror=rej;i.src=URL.createObjectURL(file)})}
function dilate(src,w,h,r){const dst=new Uint8Array(src.length);for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(src[y*w+x])for(let yy=Math.max(0,y-r);yy<=Math.min(h-1,y+r);yy++)for(let xx=Math.max(0,x-r);xx<=Math.min(w-1,x+r);xx++)dst[yy*w+xx]=1;return dst}
function components(mask,w,h){const seen=new Uint8Array(mask.length),out=[];for(let s=0;s<mask.length;s++){if(!mask[s]||seen[s])continue;let q=[s],head=0,area=0,minX=w,minY=h,maxX=0,maxY=0;seen[s]=1;while(head<q.length){const p=q[head++],x=p%w,y=(p/w)|0;area++;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);for(let yy=Math.max(0,y-1);yy<=Math.min(h-1,y+1);yy++)for(let xx=Math.max(0,x-1);xx<=Math.min(w-1,x+1);xx++){const z=yy*w+xx;if(mask[z]&&!seen[z]){seen[z]=1;q.push(z)}}}out.push({area,minX,minY,maxX,maxY})}return mergeBoxes(out,16)}
function mergeBoxes(boxes,gap){let changed=true;while(changed){changed=false;outer:for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j];if(a.minX<=b.maxX+gap&&a.maxX+gap>=b.minX&&a.minY<=b.maxY+gap&&a.maxY+gap>=b.minY){boxes[i]={area:a.area+b.area,minX:Math.min(a.minX,b.minX),minY:Math.min(a.minY,b.minY),maxX:Math.max(a.maxX,b.maxX),maxY:Math.max(a.maxY,b.maxY)};boxes.splice(j,1);changed=true;break outer}}}return boxes}
function downloadMarked(img,boxes,w,h){const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.drawImage(img,0,0,w,h);x.strokeStyle='#ef3d31';x.lineWidth=Math.max(3,w/180);boxes.forEach(b=>{x.beginPath();x.ellipse((b.minX+b.maxX)/2,(b.minY+b.maxY)/2,(b.maxX-b.minX)/2+9,(b.maxY-b.minY)/2+9,0,0,Math.PI*2);x.stroke()});const a=document.createElement('a');a.download='差分チェック結果.png';a.href=c.toDataURL('image/png');a.click()}
function resultHeader(n,label){return `<div class="result-head"><div><p class="eyebrow">COMPARISON RESULT</p><h2>比較結果</h2></div><div class="result-count"><b>${n}</b><span>${label}</span></div></div><section class="ai-box"><div><span>CLAUDE AI</span><h3>変更の意味をAIで読み解く</h3><p>重要な変更、業務への影響、確認事項を文章で整理します。</p></div><button id="aiBtn" class="ai-button">AI分析を実行</button><div id="aiOutput" class="ai-output" hidden></div></section>`}
function wireAi(){const btn=document.querySelector('#aiBtn');if(!btn)return;btn.onclick=async()=>{const out=document.querySelector('#aiOutput');btn.disabled=true;btn.textContent='AIが分析しています…';out.hidden=true;try{const response=await fetch('/api/analyze',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(state.aiPayload)});const data=await response.json();if(!response.ok)throw new Error(data.error||'AI分析に失敗しました。');out.textContent=data.analysis;out.hidden=false;btn.textContent='もう一度AI分析';}catch(e){out.textContent=e.message;out.hidden=false;out.classList.add('failed');btn.textContent='再試行';}finally{btn.disabled=false}}}
function fileAsImage(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve({mediaType:file.type==='image/jpg'?'image/jpeg':file.type,data:String(reader.result).split(',')[1]});reader.onerror=reject;reader.readAsDataURL(file)})}
function showError(msg){resultEl.hidden=false;resultEl.innerHTML=`<div class="error"><b>比較できませんでした</b><p>${esc(msg)}</p></div>`;resultEl.scrollIntoView({behavior:'smooth'})}
function formatBytes(n){return n<1024?`${n} B`:n<1048576?`${(n/1024).toFixed(1)} KB`:`${(n/1048576).toFixed(1)} MB`}
function columnName(n){let s='';do{s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26)-1}while(n>=0);return s}
function esc(v){return String(v??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]))}

const dialog=document.querySelector('#helpDialog');document.querySelector('#helpBtn').onclick=()=>dialog.showModal();dialog.querySelector('.close').onclick=()=>dialog.close();
