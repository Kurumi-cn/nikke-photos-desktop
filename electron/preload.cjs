const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('nikkeDesktop', Object.freeze({
  maanikke: Object.freeze({
    request: (command,args) => ipcRenderer.invoke('maanikke:request',command,args),
    logs: () => ipcRenderer.invoke('maanikke:logs'),
    stop: () => ipcRenderer.invoke('maanikke:stop'),
    screenshots: (command,args) => ipcRenderer.invoke('maanikke:screenshots',command,args),
  }),
  getInfo: () => ipcRenderer.invoke('desktop:info'),
  setCaptureManual: manual => ipcRenderer.invoke('desktop:capture-mode',manual),
  captureFrame: options => ipcRenderer.invoke('desktop:capture-frame',{manual:options?.manual===true}),
  sourcePicker: Object.freeze({
    subscribe: callback => {
      const listener=(_event,request)=>callback(request);
      ipcRenderer.on('source-picker:open',listener);
      return ()=>ipcRenderer.removeListener('source-picker:open',listener);
    },
    refresh: id => ipcRenderer.invoke('source-picker:refresh',id),
    finish: (id,key) => ipcRenderer.invoke('source-picker:finish',id,key),
  }),
  resourceIncome: Object.freeze({
    read: () => ipcRenderer.invoke('resource-income:read'),
    save: record => ipcRenderer.invoke('resource-income:save',record),
    remove: date => ipcRenderer.invoke('resource-income:remove',date),
    exportBackup: () => ipcRenderer.invoke('resource-income:export'),
  }),
}));
