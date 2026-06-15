const {app, BrowserWindow, ipcMain, dialog}=require('electron');
const path=require('path'); const fs=require('fs');

function createWindow(){
  const w=new BrowserWindow({width:1300, height:850, backgroundColor:'#070b14', webPreferences:{preload:path.join(__dirname,'preload.cjs'), contextIsolation:true, nodeIntegration:false}});
  if (!app.isPackaged) w.loadURL('http://127.0.0.1:5173').catch(()=>w.loadFile(path.join(__dirname,'../dist/index.html')));
  else w.loadFile(path.join(app.getAppPath(), 'dist', 'index.html')).catch(()=>w.loadFile(path.join(__dirname, '..', 'dist', 'index.html')));
}
app.whenReady().then(createWindow);
app.on('window-all-closed',()=>{ if(process.platform!=='darwin') app.quit(); });

ipcMain.handle('dialog:openFile', async(_,opts)=> { const r=await dialog.showOpenDialog(opts); return r.canceled?[]:r.filePaths; });
ipcMain.handle('dialog:saveText', async(_,p)=> { const r=await dialog.showSaveDialog({defaultPath:p.defaultPath||'dance-prompts.txt'}); if(r.canceled||!r.filePath) return {ok:false}; fs.writeFileSync(r.filePath, p.text||'','utf8'); return {ok:true}; });

function parseKeys(input){ return String(input||'').split(/[\n,;]+/).map(x=>x.trim()).filter(Boolean); }
function mimeOf(f){ const e=String(f).toLowerCase().split('.').pop(); if(['jpg','jpeg'].includes(e)) return 'image/jpeg'; if(e==='png') return 'image/png'; if(e==='webp') return 'image/webp'; return 'video/mp4'; }
async function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

async function uploadFile(apiKey, filePath){
  const data=fs.readFileSync(filePath); const mime=mimeOf(filePath); const name=path.basename(filePath).replace(/[^a-zA-Z0-9_.-]/g,'_');
  const start=await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,{method:'POST',headers:{'X-Goog-Upload-Protocol':'resumable','X-Goog-Upload-Command':'start','X-Goog-Upload-Header-Content-Length':String(data.length),'X-Goog-Upload-Header-Content-Type':mime,'Content-Type':'application/json'},body:JSON.stringify({file:{display_name:name}})});
  const uploadUrl=start.headers.get('x-goog-upload-url');
  const up=await fetch(uploadUrl,{method:'POST',headers:{'Content-Length':String(data.length),'X-Goog-Upload-Offset':'0','X-Goog-Upload-Command':'upload, finalize'},body:data});
  return (await up.json()).file;
}

async function waitReady(apiKey, file){
  for(let i=0;i<30;i++){
    const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/${file.name}?key=${apiKey}`);
    const o=await r.json(); if(o.state==='ACTIVE') return o; await sleep(2000);
  }
  return file;
}

ipcMain.handle('process:run', async(_,p)=> {
  try {
    const keys=parseKeys(p.apiKeys); const apiKey=keys[0];
    const videoFile=await waitReady(apiKey, await uploadFile(apiKey,p.video));
    const modelFile=await waitReady(apiKey, await uploadFile(apiKey,p.model));
    let outfitFile=null; if(p.outfit) outfitFile=await waitReady(apiKey, await uploadFile(apiKey,p.outfit));
    
    const system=`You are Dance Prompt Studio director. Convert reference dance video into precise prompts. Mimic choreography 100% accuracy. Lock model identity and outfit.`;
    const instruction=`Create sequence of prompts for ${p.platform}. Chunk: ${p.chunkSeconds}s.
    MIMIC DANCE: describe exact arm, leg, torso, and facial movements from video. 
    LOCK IDENTITY: use face/body from model image. 
    LOCK OUTFIT: ${outfitFile?'use outfit from reference image':'consistent outfit'}.
    Output: Prompt 01, Prompt 02...`;

    const parts=[{text:instruction},{fileData:{mimeType:videoFile.mimeType,fileUri:videoFile.uri}},{fileData:{mimeType:modelFile.mimeType,fileUri:modelFile.uri}}];
    if(outfitFile) parts.push({fileData:{mimeType:outfitFile.mimeType,fileUri:outfitFile.uri}});

    const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{role:'user',parts}],systemInstruction:{parts:[{text:system}]},generationConfig:{temperature:0.25}})});
    const o=await r.json();
    const text=o.candidates[0].content.parts.map(p=>p.text).join('\n');
    return {ok:true, count:(text.match(/Prompt/gi)||[]).length, text};
  } catch(e) { return {ok:false,error:String(e.message||e)}; }
});
