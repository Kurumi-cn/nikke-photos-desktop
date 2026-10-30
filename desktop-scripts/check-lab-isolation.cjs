// Smoke-only helper, outside both production runtime file sets.
module.exports=async({window,ipcMain})=>{
 const report=await window.webContents.executeJavaScript(`(async()=>{const bridgeAbsent=!('maaLab' in window.nikkeDesktop);location.hash='/equipment-collection';for(let i=0;i<50&&!document.querySelector('[aria-label="角色装备采集"]');i++)await new Promise(r=>setTimeout(r,100));return {navPresent:!!document.querySelector('a[href*="equipment-collection"]'),bridgeAbsent,maanikkeMode:!!document.querySelector('[aria-label="角色装备采集"]'),restrictedBridge:!!window.nikkeDesktop.maanikke&&!window.nikkeDesktop.maanikke.click};})()`);
 report.ipcAbsent=![...ipcMain._invokeHandlers.keys()].some(name=>/^maa-(lab|live):/.test(name));
 report.modulesNotLoaded=!Object.keys(require.cache).some(file=>/[\\/]experiments[\\/]maa[\\/]|[\\/]@maaxyz[\\/]|[\\/]maa-lab\.cjs$/.test(file));
 if(!Object.values(report).every(Boolean))throw Error('Legacy automation isolation check failed: '+JSON.stringify(report));
 return report;
};
