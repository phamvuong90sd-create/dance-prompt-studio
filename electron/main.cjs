const {app, BrowserWindow, ipcMain, dialog}=require('electron');
const path=require('path'); const fs=require('fs');

function createWindow(){
  const w=new BrowserWindow({width:1300, height:850, backgroundColor:'#070b14', webPreferences:{preload:path.join(__dirname,'preload.cjs'), contextIsolation:true, nodeIntegration:false}});
  if(app.isPackaged) w.loadFile(path.join(__dirname,'..','dist','index.html')); else w.loadURL('http://127.0.0.1:5173');
}
app.whenReady().then(createWindow);
app.on('window-all-closed',()=>{ if(process.platform!=='darwin') app.quit(); });

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
  if(!start.ok) throw new Error('upload_start_failed_'+start.status+': '+await start.text());
  const uploadUrl=start.headers.get('x-goog-upload-url');
  if(!uploadUrl) throw new Error('missing_upload_url');
  const up=await fetch(uploadUrl,{
    method:'POST',
    headers:{'Content-Length':String(data.length),'X-Goog-Upload-Offset':'0','X-Goog-Upload-Command':'upload, finalize'},
    body:data
  });
  const obj=await up.json().catch(()=>({}));
  if(!up.ok) throw new Error('upload_failed_'+up.status+': '+JSON.stringify(obj));
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

async function geminiGenerate(apiKey, parts, system){
  const models=['gemini-2.5-flash','gemini-2.0-flash','gemini-1.5-flash'];
  let last='';
  for(const m of models){
    try{
      const body={
        contents:[{role:'user',parts}],
        systemInstruction:{parts:[{text:system}]},
        generationConfig:{temperature:0.35}
      };
      const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const o=await r.json().catch(()=>({}));
      if(!r.ok){ last=o.error?.message||`http_${r.status}`; continue; }
      return (o.candidates?.[0]?.content?.parts||[]).map(p=>p.text||'').join('\n').trim();
    }catch(e){ last=String(e.message||e); }
  }
  throw new Error(last||'gemini_failed');
}

function countPromptsFromChunk(chunkSeconds){
  const n=Number(chunkSeconds||8)||8;
  return Math.max(1, Math.ceil(60/n));
}

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
    const promptCount=countPromptsFromChunk(chunk);
    const system=`You are Dance Prompt Studio, a professional AI video prompt director. Create safe, non-explicit dance video prompts only. The user has provided reference media they are allowed to use. Do not create sexualized content. Keep the model identity consistent with the provided model image, but describe this as a reference identity/character, not as biometric verification.`;
    const instruction=`Analyze the dance video and create a sequence of prompts for ${p.platform||'Google Flow / Veo'}.
Video length target: assume 60 seconds unless the video metadata implies otherwise.
Chunk size: ${chunk} seconds.
Create approximately ${promptCount} prompts, one per chunk.

For every prompt include:
- Time range, e.g. 00:00-00:08.
- Exact dance movement from that time range: body pose, arms, legs, rhythm, footwork, direction, transitions.
- Camera/framing: full body when needed so dance is visible.
- Model identity lock: same female model as the reference image, same face, hairstyle, body proportions, skin tone, age range, expression style.
- Outfit lock: ${outfitFile?'wearing the exact outfit from the clothing reference image: same cut, fabric, color, patterns, logos, accessories.':'no outfit reference provided; keep outfit tasteful and consistent.'}
- Visual quality: cinematic, realistic, high detail, stable anatomy, no extra limbs, no face changes.
- Negative constraints: no identity drift, no different face, no body change, no text/watermark, no NSFW.
Extra user requirement: ${p.extra||'none'}.

Output plain text only. Number prompts clearly as Prompt 01, Prompt 02, etc.`;
    const parts=[
      {text:instruction},
      {text:'Reference dance video:'},{fileData:{mimeType:videoFile.mimeType,fileUri:videoFile.uri}},
      {text:'Reference model image:'},{fileData:{mimeType:modelFile.mimeType,fileUri:modelFile.uri}}
    ];
    if(outfitFile) parts.push({text:'Reference outfit/clothing image:'},{fileData:{mimeType:outfitFile.mimeType,fileUri:outfitFile.uri}});
    const text=await geminiGenerate(apiKey,parts,system);
    const count=(text.match(/Prompt\s*\d+/gi)||[]).length || promptCount;
    return {ok:true,count,text};
  } catch(e) { return {ok:false,error:String(e.message||e)}; }
});
