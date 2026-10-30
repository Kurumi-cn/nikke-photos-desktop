const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
module.exports=async({window:win,frame,cacheRoot})=>{
 const web=win.webContents,js=s=>frame.executeJavaScript(s),report={};
 win.show();win.focus();web.focus();await delay(100);
 const until=async fn=>{for(let i=0;i<100;i++){if(await fn())return;await delay(40)}throw Error('navigation did not finish scrolling')};
 await js("document.querySelector('#collection-select').value='manual-four-equipment';document.querySelector('#collection-select').dispatchEvent(new Event('change',{bubbles:true}));scrollTo(0,0)");await delay(100);
 assert.equal(await js("document.querySelector('.expectation-outline').hidden"),false);
 assert.equal(await js("document.querySelector('.outline-top').hidden"),true);
 const stateBefore=await js('JSON.stringify({...localStorage})');
 for(const width of [null,390]) {
  if(width)await web.executeJavaScript("document.querySelector('#panel-equipment-reroll iframe').style.width='390px'");
  await delay(100);
  await js("document.querySelector('[data-section=\"calc-title\"]').click()");
  await until(()=>js("document.scrollingElement.scrollTop>200 && !document.querySelector('.outline-top').hidden"));await delay(700);
  assert.equal(await js("document.activeElement.id"),'calc-title');
  assert.equal(await js("document.querySelector('[data-section=\"calc-title\"]').getAttribute('aria-current')"),'location');
  assert.equal(await js("document.documentElement.scrollWidth>innerWidth"),false);
  const layout=await js("(()=>{const n=document.querySelector('.expectation-outline').getBoundingClientRect(),p=document.querySelector('#app').getBoundingClientRect(),h=document.querySelector('#calc-title').getBoundingClientRect();return {position:getComputedStyle(document.querySelector('.expectation-outline')).position,right:n.right,left:p.left,bottom:n.bottom,heading:h.top}})()");
  if(!width){assert.equal(layout.position,'fixed');assert.ok(layout.right<=layout.left)}else {assert.equal(layout.position,'sticky');assert.ok(layout.heading>=layout.bottom-2)}
  fs.writeFileSync(path.join(cacheRoot,width?'navigation-narrow.png':'navigation-wide.png'),(await web.capturePage()).toPNG());
  await js("document.querySelector('[data-section=\"setup-title\"]').click()");await delay(500);assert.equal(await js('document.activeElement.id'),'setup-title');
  await js("document.querySelector('.outline-top').click()");await until(()=>js('document.scrollingElement.scrollTop<2'));assert.equal(await js("document.querySelector('.outline-top').hidden"),true);
 }
 await web.executeJavaScript("document.querySelector('#panel-equipment-reroll iframe').style.width='100%'");
 await web.executeJavaScript("document.querySelector('#panel-equipment-reroll iframe').style.height='20000px'");
 await until(()=>js("document.querySelector('.expectation-outline').hidden"));report.hiddenWithoutScrollbar=true;
 await web.executeJavaScript("document.querySelector('#panel-equipment-reroll iframe').style.height=''");
 await until(()=>js("!document.querySelector('.expectation-outline').hidden"));
 assert.equal(await js('JSON.stringify({...localStorage})'),stateBefore);report.navigationDoesNotWriteState=true;
 await js("document.querySelector('#reroll-simulator-tab').click()");await delay(80);assert.equal(await js("document.querySelector('.expectation-outline').hidden"),true);
 await js("document.querySelector('#reroll-calculator-tab').click()");await until(()=>js("!document.querySelector('.expectation-outline').hidden"));
 return {...report,sectionLinks:true,returnTop:true,currentSection:true,wideGutter:true,narrowStickyNoCover:true,noHorizontalOverflow:true,simulatorHidden:true};
};
