// Full, offline v1 release. Every staging directory is newly created; existing data/releases stay untouched.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),cache=path.resolve(root,'../codex temp/nikke-desktop/release-v1.0');
const stage=path.join(cache,'stage-'+Date.now()),appDir=path.join(stage,'app'),resources=path.join(stage,'automation-app'),buildDir=path.join(stage,'build');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'))),env={...process.env,CSC_IDENTITY_AUTO_DISCOVERY:'false',CSC_LINK:'',WIN_CSC_LINK:'',ELECTRON_BUILDER_CACHE:path.resolve(cache,'../electron-builder'),TEMP:path.join(cache,'temp'),TMP:path.join(cache,'temp')};
const sourcePython=process.env.NIKKE_PYTHON||path.resolve(root,'../codex temp/nikke-desktop/automation-dev-copy/runtime/Scripts/python.exe');
function run(file,args,cwd=root,extra={}){const r=spawnSync(file,args,{cwd,env:{...env,...extra},stdio:'inherit',windowsHide:true});if(r.error)throw r.error;if(r.status!==0)throw Error('Command failed '+file+' ('+r.status+')');}
const node=(script,args=[])=>run(process.execPath,[path.join(root,script),...args]);
function copy(from,to,filter){if(path.basename(from)==='README.md'&&!fs.existsSync(from))return;fs.mkdirSync(path.dirname(to),{recursive:true});fs.cpSync(from,to,{recursive:true,filter});}
function cp(relative,dest=appDir){copy(path.join(root,relative),path.join(dest,relative),cleanFilter);}
function cleanFilter(file){return !/(^|[\\/])(__pycache__|\.git|\.pytest_cache)([\\/]|$)|\.(pyc|pyo)$/i.test(file);}
function sanitize(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){
 const file=path.join(dir,e.name);if(e.isDirectory()){if(e.name!=='runtime')sanitize(file);continue;}if(!/\.(js|mjs|cjs|json|md|txt|html|css|yml|py|ps1)$/i.test(file))continue;
 const before=fs.readFileSync(file,'utf8'),text=before.replace(/[A-Z]:[\\/]+(?:博哥|桌面|Edge Download|codeart工作空间|Users[\\/]+xby)[^\s`"'<>]*/g,'[local-development-path]');
 if(text!==before)fs.writeFileSync(file,text);
}}
async function archiveSource(){
 const source=path.join(stage,'source');fs.mkdirSync(source,{recursive:true});
 for(const name of ['src','electron','automation','scripts','desktop-scripts','tools','public','build'])copy(path.join(root,name),path.join(source,name),file=>{
  const rel=path.relative(root,file).replaceAll('\\','/');return cleanFilter(file)&&!/(^|\/)node_modules(\/|$)/.test(rel)&&!/^public\/(tools|about)(\/|$)/.test(rel)&&!/^tools\/equipment-reroll\/public\/source(\/|$)/.test(rel);
 });
 for(const name of ['package.json','package-lock.json','vite.config.js','index.html','LICENSE','LICENSING.md','README.md'])copy(path.join(root,name),path.join(source,name));
 fs.writeFileSync(path.join(source,'BUILDING.txt'),'NIKKE Photos v1.0 corresponding application source\nNode 24 / npm, Python 3.12 x64.\nInstall lockfile dependencies using npm ci. Run npm run build for the UI.\nAutomation dependencies are pinned in automation/maanikke/requirements.txt.\nThe release builder accepts the existing fixed development Python environment.\nGame artwork and other third-party assets retain their separate rights.\n');
 sanitize(source);
 const file=path.join(appDir,'dist/about/NIKKE-Photos-v1.0-source.zip');
 await new Promise((resolve,reject)=>{const output=fs.createWriteStream(file),a=require('archiver')('zip',{zlib:{level:6}});output.on('close',resolve);output.on('error',reject);a.on('error',reject);a.on('warning',reject);a.pipe(output);a.directory(source,'NIKKE-Photos-v1.0');a.finalize().catch(reject)});
 return file;
}
async function main(){
 for(const d of [appDir,resources,buildDir,env.TEMP,env.ELECTRON_BUILDER_CACHE])fs.mkdirSync(d,{recursive:true});
 node('desktop-scripts/build-tools.cjs');node('node_modules/vite/bin/vite.js',['build','--configLoader','native']);
 cp('dist');for(const name of ['LICENSE','LICENSING.md','README.md'])cp(name);
 const modules=['main.cjs','preload.cjs','storage-paths.cjs','capture-source.cjs','source-picker.cjs','windows-capture.cjs','windows-capture.ps1','windows-capture.cs','resource-income-model.mjs','resource-income-store.mjs','automation-paths.cjs','maanikke.cjs','maanikke-admin.cjs','maanikke-collection.cjs','maanikke-screenshots.cjs'];
 for(const name of modules)cp('electron/'+name);
 fs.writeFileSync(path.join(appDir,'package.json'),JSON.stringify({name:pkg.name,version:pkg.version,description:pkg.description,author:pkg.author,license:pkg.license,main:'electron/main.cjs',dependencies:{}},null,2));
 cp('automation/maanikke',resources);cp('scripts/ocr-equipment.mjs',resources);
 for(const name of ['request-maanikke-admin.ps1','request-maanikke-collection.ps1'])cp('desktop-scripts/'+name,resources);
 cp('src/lib/ocr',resources);for(const name of ['roster.json','cn-roster.json','affixTiers.js'])cp('src/data/'+name,resources);
 cp('public/ocr',resources);cp('public/ui-assets/nikke/character-artwork',resources);
 copy(path.join(root,'node_modules/pngjs'),path.join(resources,'ocr-deps/pngjs'),cleanFilter);
 const ocrCli=path.join(resources,'scripts/ocr-equipment.mjs');
 fs.writeFileSync(ocrCli,fs.readFileSync(ocrCli,'utf8').replace("from 'pngjs'","from '../ocr-deps/pngjs/lib/png.js'"));
 fs.writeFileSync(path.join(resources,'package.json'),JSON.stringify({type:'module',private:true,license:pkg.license}));
 // Copy a real base interpreter, not the venv launcher that depends on an installed developer Python.
 const probe=spawnSync(sourcePython,['-I','-X','utf8','-c','import sys,json;print(json.dumps({"base":sys.base_prefix,"version":list(sys.version_info[:2])}))'],{encoding:'utf8',windowsHide:true});
 if(probe.status!==0)throw Error('Fixed Python runtime not available: '+probe.stderr);
 const python=JSON.parse(probe.stdout);if(python.version.join('.')!=='3.12')throw Error('Expected fixed Python 3.12');
 const runtime=path.join(resources,'runtime');fs.mkdirSync(runtime,{recursive:true});
 for(const e of fs.readdirSync(python.base,{withFileTypes:true}))if(e.isFile()&&(/\.(exe|dll)$/i.test(e.name)||e.name==='LICENSE.txt'))copy(path.join(python.base,e.name),path.join(runtime,e.name));
 for(const name of ['DLLs','Lib'])copy(path.join(python.base,name),path.join(runtime,name),file=>cleanFilter(file)&&!/(^|[\\/])(site-packages|test|tests|idlelib|tkinter|ensurepip)([\\/]|$)/i.test(path.relative(python.base,file)));
 const sites=path.resolve(sourcePython,'../../Lib/site-packages');
 copy(sites,path.join(runtime,'Lib/site-packages'),file=>cleanFilter(file)&&!/(^|[\\/])pip(?:-[^\\/]+\.dist-info)?([\\/]|$)/i.test(path.relative(sites,file)));
 fs.writeFileSync(path.join(runtime,'python312._pth'),'Lib\nDLLs\nLib/site-packages\n.\nimport site\n');
 copy(path.join(runtime,'LICENSE.txt'),path.join(appDir,'dist/about/Python-LICENSE.txt'));
 const pythonNotices=[];
 function collectLicenses(folder){for(const entry of fs.readdirSync(folder,{withFileTypes:true})){
  const file=path.join(folder,entry.name);if(entry.isDirectory())collectLicenses(file);
  else if(/^(licen[sc]e|copying|notice)(\.|$|-)/i.test(entry.name))pythonNotices.push('\n--- '+path.relative(runtime,file)+' ---\n'+fs.readFileSync(file,'utf8'));
 }}
 collectLicenses(path.join(runtime,'Lib/site-packages'));
 fs.writeFileSync(path.join(appDir,'dist/about/Python-dependencies.txt'),pythonNotices.join('\n'));
 sanitize(resources);sanitize(appDir);
 const sourceZip=await archiveSource();
 copy(path.join(root,'build/installer.nsh'),path.join(buildDir,'installer.nsh'));
 copy(path.join(root,'build/icon.ico'),path.join(buildDir,'icon.ico'));
 // Resolve icons inside this release stage, independently of the working directory.
 pkg.build.win={...pkg.build.win,icon:path.join(buildDir,'icon.ico')};
 pkg.build.nsis={...pkg.build.nsis,installerIcon:path.join(buildDir,'icon.ico'),uninstallerIcon:path.join(buildDir,'icon.ico')};
 // Includes only the app and the explicit offline automation resource tree.
 const config={...pkg.build,directories:{app:appDir,buildResources:buildDir,output:path.join(root,'release/v1.0')},files:['dist/**/*','electron/**/*','package.json','LICENSE','LICENSING.md','README.md','!**/node_modules/**/*'],extraResources:[{from:resources,to:'automation-app',filter:['**/*','!**/__pycache__/**','!**/*.pyc']}],afterPack:path.join(root,'desktop-scripts/release-after-pack.cjs'),electronDist:path.join(root,'node_modules/electron/dist'),nsis:{...pkg.build.nsis,artifactName:'NIKKE-Photos-v1.0-Windows-x64-Setup.exe',include:path.join(buildDir,'installer.nsh')}};
 const configFile=path.join(stage,'builder-config.json');fs.writeFileSync(configFile,JSON.stringify(config,null,2));
 const manifest={stage,appDir,resources,runtime,sourceZip,configFile,version:pkg.version};fs.writeFileSync(path.join(cache,'latest-stage.json'),JSON.stringify(manifest,null,2));
 console.log(JSON.stringify(manifest));
 if(!process.argv.includes('--stage-only')){
  node('node_modules/electron-builder/cli.js',['--win','nsis','--x64','--publish','never','--config',configFile]);
  node('desktop-scripts/prepare-distributions.cjs');
 }
}
main().catch(e=>{console.error(e);process.exitCode=1});
