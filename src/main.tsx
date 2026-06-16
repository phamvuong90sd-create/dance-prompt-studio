import React, {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Upload, Copy, Download, Sparkles} from 'lucide-react';
import './style.css';

declare global { interface Window { danceAPI: any } }
const api = () => window.danceAPI || { openFile: async()=>[], process: async()=>({ok:false,error:'api_not_ready'}), saveText: async()=>({ok:false}) };
function Field({label, children}:{label:string, children:React.ReactNode}){ return <label className="field"><span>{label}</span>{children}</label>; }

function App(){
  const [apiKeys,setApiKeys]=useState('');
  const [video,setVideo]=useState('');
  const [model,setModel]=useState('');
  const [outfit,setOutfit]=useState('');
  const [background,setBackground]=useState('');
  const [chunk,setChunk]=useState('8');
  const [platform,setPlatform]=useState('veo');
  const [extra,setExtra]=useState('');
  const [status,setStatus]=useState('Sẵn sàng');
  const [result,setResult]=useState('');

  useEffect(()=>{ try{ const saved=JSON.parse(localStorage.getItem('dancePromptStudioConfig')||'{}'); if(saved.apiKeys) setApiKeys(saved.apiKeys); if(saved.chunk) setChunk(saved.chunk); if(saved.platform) setPlatform(saved.platform); if(saved.extra) setExtra(saved.extra); }catch{} },[]);
  useEffect(()=>{ localStorage.setItem('dancePromptStudioConfig', JSON.stringify({apiKeys, chunk, platform, extra})); },[apiKeys, chunk, platform, extra]);

  async function pick(setter:any, filters:any){ const r=await api().openFile({properties:['openFile'], filters}); if(r?.[0]) setter(r[0]); }
  async function run(){
    if(!video){ setStatus('Cần chọn video mẫu'); return; }
    if(!model){ setStatus('Cần chọn ảnh model'); return; }
    if(!apiKeys.trim()){ setStatus('Cần Gemini API key'); return; }
    setStatus('Đang phân tích video/model và tạo chuỗi prompt nhảy...');
    const r=await api().process({apiKeys, video, model, outfit, background, chunkSeconds:chunk, platform, extra});
    if(r?.ok){ setResult(r.text); setStatus(`Hoàn tất: ${r.count} prompt`); }
    else setStatus('Lỗi: '+(r?.error||'unknown'));
  }
  async function copy(){ if(result){ await navigator.clipboard.writeText(result); setStatus('Đã copy prompt'); } }
  async function download(){ const r=await api().saveText({defaultPath:`dance-prompts-${Date.now()}.txt`, text:result}); setStatus(r?.ok?'Đã lưu TXT':'Đã huỷ lưu'); }

  return <div className="app">
    <aside>
      <h1>Dance Prompt Studio</h1>
      <p>Tạo chuỗi prompt nhảy mô phỏng video mẫu</p>
      <Field label="Gemini API keys"><textarea value={apiKeys} onChange={e=>setApiKeys(e.target.value)} placeholder="Mỗi dòng một API key"/><div className="minirow"><button onClick={()=>{localStorage.setItem('dancePromptStudioConfig', JSON.stringify({apiKeys, chunk, platform, extra})); setStatus('Đã lưu cấu hình API')}}>Lưu cấu hình</button><button onClick={()=>{localStorage.removeItem('dancePromptStudioConfig'); setApiKeys(''); setStatus('Đã xoá API lưu')}}>Xoá API lưu</button></div></Field>
      <Field label="Cắt mỗi"><input value={chunk} onChange={e=>setChunk(e.target.value.replace(/[^0-9]/g,''))}/><small>giây</small></Field>
      <Field label="Nền tảng"><select value={platform} onChange={e=>setPlatform(e.target.value)}><option value="veo">Google Flow / Veo 3.1</option><option value="banana">Banana / Imagen 3</option><option value="kling">Kling</option><option value="runway">Runway</option></select></Field>
      <Field label="Yêu cầu thêm"><textarea value={extra} onChange={e=>setExtra(e.target.value)} placeholder="Ví dụ: cinematic, full body, studio light..."/></Field>
      <button className="primary" onClick={run}><Sparkles size={18}/> Tạo prompt</button>
    </aside>
    <main>
      <section className="grid">
        <div className="card"><h2><Upload/> Video mẫu</h2><button onClick={()=>pick(setVideo,[{name:'Video',extensions:['mp4','mov','webm','mkv']}])}>Chọn video</button><p>{video||'Chưa chọn video'}</p></div>
        <div className="card"><h2><Upload/> Ảnh model</h2><button onClick={()=>pick(setModel,[{name:'Image',extensions:['jpg','jpeg','png','webp']}])}>Chọn ảnh model</button><p>{model||'Chưa chọn ảnh model'}</p></div>
        <div className="card"><h2><Upload/> Ảnh Background</h2><button onClick={()=>pick(setBackground,[{name:'Image',extensions:['jpg','jpeg','png','webp']}])}>Chọn background</button><p>{background||'Chưa chọn background'}</p></div>
        <div className="card"><h2><Upload/> Ảnh quần áo</h2><button onClick={()=>pick(setOutfit,[{name:'Image',extensions:['jpg','jpeg','png','webp']}])}>Chọn ảnh quần áo</button><p>{outfit||'Không bắt buộc'}</p></div>
      </section>
      <section className="result">
        <div className="bar"><b>{status}</b><div><button onClick={copy}><Copy size={16}/> Copy</button><button onClick={download}><Download size={16}/> TXT</button></div></div>
        <pre>{result||'Chưa có kết quả...'}</pre>
      </section>
    </main>
  </div>;
}

createRoot(document.getElementById('root')!).render(<App/>);
