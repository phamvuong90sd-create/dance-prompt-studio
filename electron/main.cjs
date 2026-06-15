const {app, BrowserWindow, ipcMain, dialog}=require('electron');
const path=require('path'); const fs=require('fs');

function createWindow(){
  const w=new BrowserWindow({
    width:1300, height:850, 
    backgroundColor:'#070b14',
    webPreferences:{
      preload:path.join(__dirname,'preload.cjs'),
      contextIsolation:true,
      nodeIntegration:false
    }
  });

  if (!app.isPackaged) {
    w.loadURL('http://127.0.0.1:5173').catch(() => {
      w.loadFile(path.join(__dirname, '../dist/index.html'));
    });
  } else {
    // Packaged mode: use relative path from app root
    const indexPath = path.join(app.getAppPath(), 'dist', 'index.html');
    if (fs.existsSync(indexPath)) {
      w.loadFile(indexPath);
    } else {
      // Fallback for different build structures
      const fallbackPath = path.join(__dirname, '..', 'dist', 'index.html');
      w.loadFile(fallbackPath);
    }
  }
}

app.whenReady().then(createWindow);
app.on('window-all-closed',()=>{ if(process.platform!=='darwin') app.quit(); });

// IPC Handlers
ipcMain.handle('dialog:openFile', async(_,opts)=> { const r=await dialog.showOpenDialog(opts); return r.canceled?[]:r.filePaths; });
ipcMain.handle('dialog:saveText', async(_,p)=> { const r=await dialog.showSaveDialog({defaultPath:p.defaultPath||'dance-prompts.txt', filters:[{name:'Text',extensions:['txt']}]}); if(r.canceled||!r.filePath) return {ok:false}; fs.writeFileSync(r.filePath, p.text||'','utf8'); return {ok:true,filePath:r.filePath}; });

function parseKeys(input){ return String(input||'').split(/[\n,;]+/).map(x=>x.trim()).filter(Boolean); }
function mimeOf(file){
  const e=String(file).toLowerCase().split('.').pop();
  if(['jpg','jpeg'].includes(e)) return 'image/jpeg';
  if(e==='png') return 'image/png';
  if(e==='webp') return 'image/webp';
  if(e==='mov') return 'video/quicktime';
  if(e==='webm') return 'video/webm';
  if(e==='mkv') return 'video/x-matroska';
  return 'video/mp4';
}
async function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

async function uploadGeminiFile(apiKey, filePath){
  const data=fs.readFileSync(filePath);
  const mime=mimeOf(filePath);
  const name=path.basename(filePath).replace(/[^a-zA-Z0-9_.-]/g,'_');
  const start=await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,{
    method:'POST',
    headers:{
      'X-Goog-Upload-Protocol':'resumable',
      'X-Goog-Upload-Command':'start',
      'X-Goog-Upload-Header-Content-Length':String(data.length),
      'X-Goog-Upload-Header-Content-Type':mime,
      'Content-Type':'application/json'
    },
    body:JSON.stringify({file:{display_name:name}})
  });
  if(!start.ok) throw new Error('upload_start_failed_'+start.status);
  const uploadUrl=start.headers.get('x-goog-upload-url');
  if(!uploadUrl) throw new Error('missing_upload_url');
  const up=await fetch(uploadUrl,{
    method:'POST',
    headers:{'Content-Length':String(data.length),'X-Goog-Upload-Offset':'0','X-Goog-Upload-Command':'upload, finalize'},
    body:data
  });
  const obj=await up.json().catch(()=>({}));
  if(!up.ok) throw new Error('upload_failed_'+up.status);
  return obj.file;
}

async function waitFileReady(apiKey, file){
  if(!file?.name) return file;
  for(let i=0;i<30;i++){
    const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/${file.name}?key=${apiKey}`);
    const o=await r.json().catch(()=>({}));
    if(o.state==='ACTIVE') return o;
    if(o.state==='FAILED') throw new Error('gemini_file_failed');
    await sleep(2000);
  }
  return file;
}

async function geminiGenerate(apiKey, parts, system, preferredModel){
  const models=[preferredModel, 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'].filter((v,i,a)=>v && a.indexOf(v)===i);
  let last='';
  for(const m of models){
    try{
      const body={
        contents:[{role:'user',parts}],
        systemInstruction:{parts:[{text:system}]},
        generationConfig:{temperature:0.3}
      };
      const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const o=await r.json().catch(()=>({}));
      if(!r.ok){ last=o.error?.message||`http_${r.status}`; continue; }
      return (o.candidates?.[0]?.content?.parts||[]).map(p=>p.text||'').join('\n').trim();
    }catch(e){ last=String(e.message||e); }
  }
  throw new Error(last||'gemini_failed');
}

ipcMain.handle('media:download', async(_,m)=>{ const r=await fetch(m.url); const b=Buffer.from(await r.arrayBuffer()); const s=await dialog.showSaveDialog({defaultPath:m.name}); if(!s.canceled) fs.writeFileSync(s.filePath, b); return {ok:!s.canceled}; });
ipcMain.handle('media:generate', async(_,p)=>{ /* Mock gen logic: Thuc te se goi Imagen API */ return [{type:'image', url:'https://picsum.photos/800/600', name:'gen-1.png'}]; });
ipcMain.handle('process:run', async(_,p)=> {
  try {
    const keys=parseKeys(p.apiKeys);
    if(!keys.length) throw new Error('missing_api_keys');
    if(!p.video) throw new Error('missing_video');
    if(!p.model) throw new Error('missing_model_image');
    const apiKey=keys[0];
    const videoFile=await waitFileReady(apiKey, await uploadGeminiFile(apiKey,p.video));
    const modelFile=await waitFileReady(apiKey, await uploadGeminiFile(apiKey,p.model));
    let outfitFile=null;
    if(p.outfit) outfitFile=await waitFileReady(apiKey, await uploadGeminiFile(apiKey,p.outfit));
    const chunk=Number(p.chunkSeconds||8)||8;
    const system=`You are Dance Prompt Studio director. Your job is to convert a reference dance video into extremely precise, safe video-generation prompts. Do not invent new choreography. Do not simplify. Do not change timing. Output plain text only.`;
    const instruction=`Create prompts for ${p.platform}. Chunk size: ${chunk}s.

CRITICAL CHOREOGRAPHY LOCK:
- The generated prompts MUST mimic the reference dance video as closely as possible.
- For each time range, describe the exact dance movement from the source video: arm path, hand gesture, shoulder angle, hip movement, torso lean, head turn, foot placement, step direction, jump/spin/transition, rhythm, speed, pauses, and weight shifts.
- Describe facial expression changes from the video: smile, eye direction, mouth shape, eyebrow movement, confidence, intensity, and timing.
- Describe camera angle/framing from the video if visible. Keep full body visible whenever legs/feet matter.
- No improvisation, no new choreography, no missing gestures, no replacing movements with generic dancing.
- Use phrases such as: “frame-accurate choreography match”, “same timing as reference”, “same body rhythm”, “same facial expression sequence”.

MODEL IDENTITY LOCK:
- The female model must match the uploaded model image: same face, hairstyle, body proportions, skin tone, expression style, and overall identity.
- Do not change face, age, body shape, or hairstyle.

OUTFIT LOCK:
- If an outfit image is provided, the model wears the exact outfit: same cut, fabric, color, logo/pattern, fit, and accessories.

NEGATIVE CONSTRAINTS:
- no different choreography, no extra limbs, no distorted hands, no face drift, no identity drift, no text, no watermark, no NSFW.

Output numbered prompts: Prompt 01, Prompt 02, etc. Each prompt must include a time range and detailed choreography notes.`;
    const parts=[
      {text:instruction},
      {text:'Ref video:'},{fileData:{mimeType:videoFile.mimeType,fileUri:videoFile.uri}},
      {text:'Ref model:'},{fileData:{mimeType:modelFile.mimeType,fileUri:modelFile.uri}}
    ];
    if(outfitFile) parts.push({text:'Ref outfit:'},{fileData:{mimeType:outfitFile.mimeType,fileUri:outfitFile.uri}});
    const text=await geminiGenerate(apiKey,parts,system,p.modelName);
    return {ok:true,count:(text.match(/Prompt/gi)||[]).length,text};
  } catch(e) { return {ok:false,error:String(e.message||e)}; }
});
