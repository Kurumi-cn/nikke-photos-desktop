import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CURRENT_VERSION } from '../data/changelog.js'
import '../styles/about.css'

const local = (file) => `${import.meta.env.BASE_URL}${file}`

function Document({ title, file }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!open || text) return
    const controller = new AbortController()
    setError('')
    fetch(local(file), { signal: controller.signal }).then(response => {
      if (!response.ok) throw new Error('文件暂时无法读取')
      return response.text()
    }).then(setText).catch(problem => {
      if (problem.name !== 'AbortError') setError('未能读取随附说明，请重试或下载原文件。')
    })
    return () => controller.abort()
  }, [open, file, retry, text])
  return <details className="about-document" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{title}</summary>
    <div className="about-document-body">
      <a href={local(file)} download>下载原文件</a>
      {error ? <p role="alert">{error} <button className="btn btn-sm" onClick={() => setRetry(value => value + 1)}>重试</button></p>
        : text ? <pre tabIndex={0} aria-label={title}>{text}</pre> : <p role="status">正在读取本地文件…</p>}
    </div>
  </details>
}

function Source({ children }) { return <p className="about-source">{children}</p> }

export default function AboutPage() {
  const [fullSource, setFullSource] = useState(false)
  useEffect(() => { window.nikkeDesktop?.getInfo?.().then(info => setFullSource(info.capabilities?.applicationSource === true)).catch(() => {}) }, [])
  return <main className="page about-page">
    <Link to="/my" className="back">← 返回更多</Link>
    <div className="page-head"><div><h1>关于</h1><p className="desc">软件信息、第三方来源与许可说明</p></div></div>
    <section className="about-section about-identity" aria-label="软件信息">
      <div><h2>NIKKE Photos</h2><p>妮姬档案、装备记录与本地计算工具</p></div>
      <div><span className="about-version">v{CURRENT_VERSION}</span><p>作者：小云雀来海</p></div>
    </section>

    <section className="about-section" aria-labelledby="about-project-license">
      <h2 id="about-project-license">软件许可</h2>
      <p>本项目原创代码采用 GNU GPL v3（GPL-3.0-only）。第三方组件保留各自的版权及许可，图片等素材不自动包含在代码许可中。</p>
      <Document title="本软件 GPL v3 许可全文" file="about/project-GPL-3.0.txt"/>
      {fullSource ? <a className="about-download" href={local('about/NIKKE-Photos-v1.0-source.zip')} download>下载 v1.0 对应应用源码（含构建说明）</a> : null}
    </section>

    <section className="about-section" aria-labelledby="about-components">
      <h2 id="about-components">第三方项目</h2>
      <p className="about-intro">感谢以下项目与数据贡献者。许可原文可离线阅读，来源地址可选中复制。</p>
      <article className="about-item"><h3>红球计算器 <span>MIT</span></h3>
        <p>基于 zbxzbx98 的 NikkeCalc.vue，保留原始计算与查表算法，调整桌面布局、本地资源与设置存储。Copyright © 2024 zbxzbx98。</p>
        <p>原始关卡与产出数据来源：doro112 / nikkeoutpost。</p>
        <Source>https://github.com/zbxzbx98/zbxzbx98.github.io<br/>https://nikkeoutpost.netlify.app<br/>固定提交：4a2d9a5219919c3b88b7c1f9eff85ad8424e1d6b</Source>
        <Document title="MIT 许可全文" file="about/zbx-MIT.txt"/>
      </article>
      <article className="about-item"><h3>洗词条计算器与装备 OCR <span>GPL-3.0-or-later</span></h3>
        <p>计算器基于 ChrisLu7899 的 NIKKE Workshop 1.0.15；装备 OCR 的部分定位、模板和判定模块也复用了该项目。桌面版适配独立界面、本地存储、角色装备快照与计算策略，保留原作者和源码版权标头。</p>
        <Source>https://github.com/ChrisLu7899/NIKKE-Workshop<br/>固定提交：24b52299b23098cb6f816a5a3308daa8b2058388</Source>
        <Document title="GPL 许可全文" file="about/workshop-GPL.txt"/>
        <Document title="洗词条组件来源与修改记录" file="tools/equipment-reroll/SOURCE-NOTICE.txt"/>
        <Document title="组件源码构建说明" file="tools/equipment-reroll/source/BUILDING.txt"/>
        <a className="about-download" href={local('about/equipment-reroll-source.zip')} download>下载洗词条组件源码（含构建说明）</a>
      </article>
      <article className="about-item"><h3>秘钥策略与装备洗练模拟器 <span>MIT / GPL-3.0-or-later</span></h3>
        <p>复用 zbxzbx98 的秘钥求解器、模拟器、四装备求解器及档位范围。原始组件保留 MIT 许可，桌面集成适配沿用 GPL-3.0-or-later。Copyright © 2024 zbxzbx98。</p>
        <Source>https://github.com/zbxzbx98/zbxzbx98.github.io<br/>固定提交：4a2d9a5219919c3b88b7c1f9eff85ad8424e1d6b</Source>
        <Document title="zbx 原始组件许可全文" file="tools/equipment-reroll/ZBX-LICENSE.txt"/>
      </article>
      <article className="about-item"><h3>自动化开发组件 <span>MaaNikke · GPL-3.0</span></h3>
        <p>装备采集复用 MaaNikke 的部分识别、资源与 Agent，基于 MaaFramework 5.12.2；模型来源为 PaddleOCR PP-OCRv6。其他框架、依赖与模型的条款须分别核对，不统一视作 MaaNikke 的代码许可。</p>
        <Source>https://github.com/Shinarin/MaaNikke<br/>固定提交：eab10c90ba1f3502bf9576a6669d0f83e27bbc1e<br/>https://github.com/MaaXYZ/MaaFramework<br/>https://www.paddleocr.ai</Source>
        <p>上游另有非商业用途及游戏素材声明，具体适用范围与发行要求待核实。完整客户端随附采集所需运行环境与识别资源。</p>
        <Document title="MaaNikke 许可全文" file="about/maanikke-GPL.txt"/>
        <Document title="自动化组件来源与适配记录" file="about/automation-notice.txt"/>
        <Document title="OCR 模型来源说明" file="about/ocr-model-source.txt"/>
      </article>
    </section>

    <section className="about-section" aria-labelledby="about-dependencies">
      <h2 id="about-dependencies">软件依赖与运行环境</h2>
      <p>使用 React、React Router、Vue、Element Plus、ExcelJS、html-to-image、pinyin-pro 等组件；桌面运行环境为 Electron / Chromium。各项适用条款以随附原文为准。</p>
      <Document title="主界面依赖许可" file="about/host-dependencies.txt"/>
      <Document title="计算工具第三方依赖许可" file="tools/equipment-reroll/THIRD_PARTY_LICENSES.txt"/>
      <Document title="Electron 许可全文" file="about/electron-LICENSE.txt"/>
      {fullSource ? <><Document title="Python 许可全文" file="about/Python-LICENSE.txt"/><Document title="采集运行环境依赖许可" file="about/Python-dependencies.txt"/></> : null}
      <a className="about-download" href={local('about/chromium-licenses.html')} download>下载 Chromium 第三方许可集合（HTML）</a>
      <p className="about-muted">计算工具清单保守包含部分仅用于 Node 的依赖，不代表每个列出的包都在页面中运行；未声明条款的项不视为已获授权。</p>
    </section>

    <section className="about-section" aria-labelledby="about-assets">
      <h2 id="about-assets">注意事项</h2>
      <p>游戏头像、立绘、图标、名称与商标属于 SHIFT UP、PROXIMA BETA 及相关权利人。代码的开源许可不自动覆盖这些素材；公开可访问或用户提供的文件不等于取得公开再分发许可。</p>
    </section>
  </main>
}
