const {contextBridge, ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('danceAPI', {
  openFile: (o)=>ipcRenderer.invoke('dialog:openFile',o),
  saveText: (p)=>ipcRenderer.invoke('dialog:saveText',p),
  process: (p)=>ipcRenderer.invoke('process:run',p)
});
