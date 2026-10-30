// Validate staging and a temporary ASAR only. Never runs electron-builder or creates an EXE.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),asar=require('@electron/asar');
const root=path.resolve(__dirname,'..'),cache=path.resolve(root,'../codex temp/nikke-desktop'),out=path.join(cache,'disabled-module-check');fs.mkdirSync(out,{recursive:true});
const audit=require('./distribution-audit.cjs');
(async()=>{
 for(const name of ['experiments/maa/package.json','electron/maa-lab.cjs','node_modules/@maaxyz/maa-node/package.json','resources/MaaFramework.dll','MaaNode.node'])assert.throws(()=>audit.assertPaths([name]),name);
 assert.throws(()=>audit.assertText('bundle.js','import AutomationLabPage from "./pages/AutomationLabPage.jsx"'));
 assert.throws(()=>audit.assertText('preload.cjs','ipcRenderer.invoke("maa-live:click")'));
 // Archived experiment entry points fail before loading native Maa or doing any input.
 assert.throws(()=>require('../experiments/maa/lab-availability.cjs').assertLabEnabled(),/已屏蔽/);
 assert.throws(()=>require('../experiments/maa/matcher.cjs').createMatcher(out),/已屏蔽/);
 assert.throws(()=>require('../experiments/maa/live.cjs').createLive({}),/已屏蔽/);
 assert.throws(()=>require('../experiments/maa/request-admin.cjs').createAdminRequest({}),/已屏蔽/);
 assert.equal(Object.keys(require.cache).some(file=>/[\\/]@maaxyz[\\/]/.test(file)),false);
 const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json')));for(const exclusion of ['!experiments/**/*','!electron/maa-lab.cjs','!**/@maaxyz/**/*'])assert.ok(pkg.build.files.includes(exclusion));
 const {stage}=JSON.parse(fs.readFileSync(path.join(cache,'latest-stage-only.json')));
 const staged=audit.auditDirectory(stage),archive=path.join(out,'verified-app.asar');await asar.createPackage(stage,archive);const archived=audit.auditAsar(archive);
 const result={status:'passed',noExeBuilt:true,negativeContaminationGuards:true,archiveLaunchersDisabled:true,stage,staged,archive,archived};
 fs.writeFileSync(path.join(out,'distribution-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
