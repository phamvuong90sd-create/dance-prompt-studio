import React, {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Upload, Copy, Download, Sparkles, Image, Video} from 'lucide-react';
import './style.css';

declare global { interface Window { danceAPI: any } }
const api = () => window.danceAPI || { openFile: async()=>[], process: async()=>({ok:false,error:'api_not_ready'}), saveText: async()=>({ok:false}), generateMedia: async()=>[], downloadMedia: async()=>({ok:false}) };
function Field({label, children}:{label:string, children:React.ReactNode}){ return <label className="field"><span>{label}</span>{children}</label>; }

type MediaItem = {type:'image'|'video', url:string, name:string};

function App(){
  const [apiKeys,setApiKeys]=useState('');
  const [video,setVideo]=useState('');
  const [model,setModel]=useState('');
  const [outfit,setOutfit]=useState('');
  const [chunk,setChunk]=useState('8');
  const [platform,setPlatform]=useState('veo');
  const [modelName,setModelName]=useState('gemini-2.5-flash');
  const [extra,setExtra]=useState('');
  const [status,setStatus]=useState('Sẵn sàng');
  const [result,setResult]=useState('');
  const [tab,setTab]=useState<'prompts'|'images'|'videos'>('prompts');
  const [media,setMedia]=useState<MediaItem[]>([]);

  useEffect(()=>{ try{ const saved=JSON.parse(localStorage.getItem('dancePromptStudioConfig')||'{}'); if(saved.apiKeys) setApiKeys(saved.apiKeys); if(saved.chunk) setChunk(saved.chunk); if(saved.platform) setPlatform(saved.platform); if(saved.modelName) setModelName(saved.modelName); if(saved.extra) setExtra(saved.extra); }catch{} },[]);
  useEffect(()=>{ localStorage.setItem('dancePromptStudioConfig', JSON.stringify({apiKeys, chunk, platform, modelName, extra})); },[apiKeys, chunk, platform, modelName, extra]);

  async function pick(setter:any, filters:any){ const r=await api().openFile({properties:['openFile'], filters}); if(r?.[0]) setter(r[0]); }
  async function run(){
    if(!video){ setStatus('Cần chọn video mẫu'); return; }
    if(!model){ setStatus('Cần chọn ảnh model'); return; }
    if(!apiKeys.trim()){ setStatus('Cần Gemini API key'); return; }
    setStatus('Đang phân tích video/model/trang phục và tạo prompt nền...');
    const r=await api().process({apiKeys, video, model, outfit, chunkSeconds:chunk, platform, modelName, extra});
    if(r?.ok){ setResult(r.text); setStatus(`Hoàn tất: ${r.count} prompt`); setTab('prompts'); }
    else setStatus('Lỗi: '+(r?.error||'unknown'));
  }
  async function copy(){ if(result){ await navigator.clipboard.writeText(result); setStatus('Đã copy prompt'); } }
  async function download(){ const r=await api().saveText({defaultPath:`dance-prompts-${Date.now()}.txt`, text:result}); setStatus(r?.ok?'Đã lưu TXT':'Đã huỷ lưu'); }
  async function gen(type:'image'|'video'){
    if(!result){ setStatus('Cần tạo prompt trước'); return; }
    setStatus(type==='image'?'Đang tạo ảnh...':'Đang tạo video...');
    const r=await api().generateMedia({type, apiKeys, prompts:result, modelName});
    if(Array.isArray(r)){ setMedia([...media, ...r]); setTab(type==='image'?'images':'videos'); setStatus(`Đã tạo ${r.length} ${type==='image'?'ảnh':'video'}`); }
    else setStatus('Lỗi tạo media: '+(r?.error||'unknown'));
  }

  const imageItems=media.filter(m=>m.type==='image');
  const videoItems=media.filter(m=>m.type==='video');

  return <div className="app">
    <aside>
      <h1>Dance Generate Studio</h1>
      <p>Tạo ảnh/video model nữ nhảy theo video mẫu</p>
      <Field label="Gemini API keys"><textarea value={apiKeys} onChange={e=>setApiKeys(e.target.value)} placeholder="Mỗi dòng một API key"/><div className="minirow"><button onClick={()=>{localStorage.setItem('dancePromptStudioConfig', JSON.stringify({apiKeys, chunk, platform, modelName, extra})); setStatus('Đã lưu cấu hình API')}}>Lưu cấu hình</button><button onClick={()=>{localStorage.removeItem('dancePromptStudioConfig'); setApiKeys(''); setStatus('Đã xoá API lưu')}}>Xoá API lưu</button></div></Field>
      <Field label="Cắt mỗi"><input value={chunk} onChange={e=>setChunk(e.target.value.replace(/[^0-9]/g,''))}/><small>giây</small></Field>
      {/* Gemini 2.5 forced */}<Field label="Gemini Model" style={{display:"none"}}><select value={modelName} onChange={e=>setModelName(e.target.value)}><option value="gemini-2.5-flash">Gemini 2.5 Flash</option><option value="gemini-3.5-flash">Gemini 3.5 Flash</option></select></Field>
      <Field label="Nền tảng"><select value={platform} onChange={e=>setPlatform(e.target.value)}><option value="veo">Google Flow / Veo</option><option value="kling">Kling</option><option value="runway">Runway</option></select></Field>
      <Field label="Yêu cầu thêm"><textarea value={extra} onChange={e=>setExtra(e.target.value)} placeholder="Ví dụ: cinematic, full body, no text, studio light..."/></Field>
      <button className="primary" onClick={run}><Sparkles size={18}/> Phân tích & tạo prompt nền</button>
    </aside>
    <main>
      <section className="grid">
        <div className="card"><h2><Upload/> Video mẫu</h2><button onClick={()=>pick(setVideo,[{name:'Video',extensions:['mp4','mov','webm','mkv']}])}>Chọn video</button><p>{video||'Chưa chọn video'}</p></div>
        <div className="card"><h2><Upload/> Ảnh model</h2><button onClick={()=>pick(setModel,[{name:'Image',extensions:['jpg','jpeg','png','webp']}])}>Chọn ảnh model</button><p>{model||'Chưa chọn ảnh model'}</p></div>
        <div className="card"><h2><Upload/> Ảnh quần áo</h2><button onClick={()=>pick(setOutfit,[{name:'Image',extensions:['jpg','jpeg','png','webp']}])}>Chọn ảnh quần áo</button><p>{outfit||'Không bắt buộc'}</p></div>
      </section>
      <section className="result">
        <div className="bar"><b>{status}</b><div><button onClick={copy}><Copy size={16}/> Copy</button><button onClick={download}><Download size={16}/> TXT</button><button className="accent" onClick={()=>gen('image')}><Image size={16}/> Tạo ảnh</button><button className="accent" onClick={()=>gen('video')}><Video size={16}/> Tạo video</button></div></div>
        <div className="tab-bar"><button className={tab==='prompts'?'active':''} onClick={()=>setTab('prompts')}>Prompts</button><button className={tab==='images'?'active':''} onClick={()=>setTab('images')}>Images ({imageItems.length})</button><button className={tab==='videos'?'active':''} onClick={()=>setTab('videos')}>Videos ({videoItems.length})</button></div>
        {tab==='prompts' && <pre>{result||'Chưa có kết quả...'}</pre>}
        {tab==='images' && <div className="media-grid">{imageItems.length?imageItems.map((m,i)=><div key={i} className="media-card"><img src={m.url}/><button onClick={()=>api().downloadMedia(m)}>Download</button></div>):<p>Chưa có ảnh.</p>}</div>}
        {tab==='videos' && <div className="media-grid">{videoItems.length?videoItems.map((m,i)=><div key={i} className="media-card"><video controls src={m.url}/><button onClick={()=>api().downloadMedia(m)}>Download</button></div>):<p>Chưa có video. Cần cấu hình provider video có API trả MP4.</p>}</div>}
      </section>
    </main>
  </div>;
}

createRoot(document.getElementById('root')!).render(<App/>);
