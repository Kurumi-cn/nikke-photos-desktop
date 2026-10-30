// SPDX-License-Identifier: GPL-3.0-or-later
// Presentation only: navigate inside the expectation document, never the host.
export function installPageNavigation(panel) {
  const nav=document.createElement('nav')
  nav.className='expectation-outline'
  nav.setAttribute('aria-label','期望计算页面导航')
  nav.innerHTML='<span class="outline-title">页面大纲</span><button type="button" data-section="setup-title">装备与目标</button><button type="button" data-section="calc-title">洗练分析</button><button type="button" class="outline-top" aria-label="返回期望计算页面顶部">↑ 返回顶部</button>'
  panel.prepend(nav)
  const top=nav.querySelector('.outline-top')
  const links=[...nav.querySelectorAll('[data-section]')]
  const headings=links.map(button=>document.getElementById(button.dataset.section))
  headings.forEach(heading=>{heading.tabIndex=-1})
  let queued=false,selected=0
  const behavior=()=>matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'
  function update() {
    queued=false
    const root=document.scrollingElement
    const ownHeight=getComputedStyle(nav).position==='sticky'?nav.offsetHeight:0
    nav.hidden=panel.hidden || root.scrollHeight-ownHeight<=root.clientHeight+2
    top.hidden=root.scrollTop<120
    const offset=matchMedia('(max-width: 899px)').matches?140:90
    const positions=headings.map(h=>h.getBoundingClientRect().top)
    // Side-by-side panels can share their vertical position; retain the user's choice.
    if(Math.abs(positions[0]-positions[1])>20)selected=positions[1]<=Math.max(offset+24,innerHeight*.45)?1:0
    links.forEach((button,i)=>{if(i===selected)button.setAttribute('aria-current','location');else button.removeAttribute('aria-current')})
  }
  function schedule(){if(!queued){queued=true;requestAnimationFrame(update)}}
  links.forEach((button,i)=>button.addEventListener('click',()=>{
    selected=i
    headings[i].scrollIntoView({block:'start',behavior:behavior()})
    headings[i].focus({preventScroll:true})
    schedule()
  }))
  top.addEventListener('click',()=>{
    window.scrollTo({top:0,behavior:behavior()})
    document.querySelector('#reroll-calculator-tab').focus({preventScroll:true})
  })
  window.addEventListener('scroll',schedule,{passive:true})
  window.addEventListener('resize',schedule)
  new ResizeObserver(schedule).observe(panel)
  new MutationObserver(schedule).observe(panel,{attributes:true,attributeFilter:['hidden']})
  update()
}
