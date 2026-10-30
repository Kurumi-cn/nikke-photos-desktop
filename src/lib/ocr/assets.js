// 浏览器侧 OCR 资源与输入：模板加载（含缓存）、图片解码、屏幕抓帧
// 识别核心在 src/lib/ocr/equipment/（v2 链路）与 src/lib/ocr/equipment.js（旧实现）；
// 本文件只做浏览器 I/O —— 两边的调用方都通过 `recognizeEquipment(image, { engine, ...loadOcrAssets() })`。
import { FUNCTION_LABELS } from '../../data/affixTiers.js'
import { createValueTemplateLoader } from './equipment/valueTemplateLoader.js'
import { charOfTemplateFile, nameTemplateFromImage, valueTemplateFromImage } from './equipment.js'

const OCR_ROOT = `${import.meta.env.BASE_URL}ocr`

/** ImageBitmap → RGBA 像素（getImageData 返回未预乘 RGBA，模板 alpha 语义完整保留） */
const imageDataFromBitmap = (bitmap) => {
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  context.drawImage(bitmap, 0, 0)
  return context.getImageData(0, 0, bitmap.width, bitmap.height)
}

const loadImageData = async (url) => {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`加载 OCR 资源失败：${url}`)
  const bitmap = await createImageBitmap(await response.blob())
  try {
    return imageDataFromBitmap(bitmap)
  } finally {
    bitmap.close()
  }
}

/**
 * v2 的按需模板加载器（规格 §6）
 *
 * 加载器要的是"相对 OCR 根目录的路径"，base 必须在这里补 —— 写死 `/ocr/...` 在
 * GitHub Pages 子路径部署下会 404（本项目的 `base: './'` 就是为此）。
 * 单字符字模按需加载，实测一次识别只解码 35 张左右（另有 4715 次命中缓存）。
 */
const createBrowserTemplateLoader = () => createValueTemplateLoader({
  loadImage: (relative) => loadImageData(`${OCR_ROOT}/${relative}`),
})

let assetsPromise = null

/** 加载 OCR 模板（值字模 + 名称模板）并缓存；重复调用返回同一个 Promise */
export const loadOcrAssets = () => {
  if (!assetsPromise) {
    assetsPromise = buildAssets().catch((error) => {
      assetsPromise = null // 失败后允许重试
      throw error
    })
  }
  return assetsPromise
}

const buildAssets = async () => {
  // 字模清单由 scripts/extract-equipment-glyphs.mjs 生成（浏览器无法列目录）
  const response = await fetch(`${OCR_ROOT}/font-templates/Azonix-game/manifest.json`)
  if (!response.ok) throw new Error('缺少字模清单 manifest.json（请先运行 npm run ocr:equip-glyphs）')
  const manifest = await response.json()
  // 并发加载（约 150 个小文件，串行逐个等待会慢好几倍）
  const valueFiles = manifest.valueFiles || []
  const valueImages = await Promise.all(valueFiles.map((file) => loadImageData(`${OCR_ROOT}/font-templates/Azonix-game/${file}`)))
  const valueTemplates = []
  valueFiles.forEach((file, index) => {
    const template = valueTemplateFromImage(valueImages[index], charOfTemplateFile(file))
    if (template) valueTemplates.push(template)
  })
  const nameJobs = []
  for (const family of ['light', 'dark']) {
    for (const functionType of Object.keys(FUNCTION_LABELS)) {
      nameJobs.push({ functionType, family, url: `${OCR_ROOT}/affix-labels/${family}/${functionType}.png` })
    }
  }
  const nameImages = await Promise.all(nameJobs.map((job) => loadImageData(job.url)))
  const nameTemplates = []
  nameJobs.forEach((job, index) => {
    const template = nameTemplateFromImage(nameImages[index], job)
    if (template) nameTemplates.push(template)
  })
  // v2 的模板是**按需**取的，这里只把加载器挂上去，不预解码
  const templateLoader = createBrowserTemplateLoader()
  return {
    valueTemplates,
    nameTemplates,
    loadFullTemplate: templateLoader.loadFullTemplate,
    loadGlyph: templateLoader.loadGlyph,
    templateLoader,
  }
}

/** 拖拽 / 粘贴 / 选择文件得到的 Blob → RGBA 像素 */
export const imageDataFromBlob = async (blob) => {
  const bitmap = await createImageBitmap(blob)
  try {
    return imageDataFromBitmap(bitmap)
  } finally {
    bitmap.close()
  }
}

/** 浏览器是否支持屏幕抓帧 */
export const isScreenCaptureSupported = () => Boolean(window.nikkeDesktop?.captureFrame || navigator.mediaDevices?.getDisplayMedia)

/**
 * 抓一帧“用户选中的屏幕/窗口”（getDisplayMedia），抓完立即停止共享
 * 用户在系统弹窗里取消选择时抛 NotAllowedError（上层按“已取消”处理）
 * 诊断：一并返回实际捕获源信息（displaySurface 等）与整帧 PNG dataUrl，用于核对“抓到的到底是什么画面”
 */
export const captureScreenFrame = async ({ manual = false } = {}) => {
  if (window.nikkeDesktop?.captureFrame) {
    const frame = await window.nikkeDesktop.captureFrame({ manual })
    if (frame.canceled) throw new DOMException('已取消截图', 'AbortError')
    const imageData = await imageDataFromBlob(await (await fetch(frame.dataUrl)).blob())
    if (imageData.width !== frame.width || imageData.height !== frame.height) throw new Error('原生截图尺寸校验失败')
    const meta = {
      displaySurface: 'window', backend: frame.backend, cursor: frame.cursor, cursorRequested: 'never', cursorSuppressed: frame.cursor === 'never',
      width: frame.width, height: frame.height, frameWidth: frame.width, frameHeight: frame.height,
      contentWidth: frame.contentWidth, contentHeight: frame.contentHeight,
      outputWidth: imageData.width, outputHeight: imageData.height, ocrWidth: imageData.width, ocrHeight: imageData.height,
      format: 'image/png', scaleX: 1, scaleY: 1, resizeMode: 'none',
    }
    return { imageData, meta, dataUrl: frame.dataUrl }
  }
  if (window.nikkeDesktop?.setCaptureManual) await window.nikkeDesktop.setCaptureManual(manual)
  // ideal is a preference, never an upscaling instruction. resizeMode:none retains source pixels.
  // Do not use min/exact here: display-capture selection must remain under browser control.
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { width: { ideal: 7680 }, height: { ideal: 4320 }, resizeMode: 'none', cursor: 'never' }, audio: false,
  })
  let stoppedByUs = false
  const video = document.createElement('video')
  try {
    const track = stream.getVideoTracks()[0]
    // Only browsers advertising this constraint should receive an exact follow-up.
    // Chromium may silently ignore even exact unknown constraints; settings below
    // remain the source of truth and the UI must not claim success on resolve alone.
    if (navigator.mediaDevices.getSupportedConstraints?.().cursor === true && track?.applyConstraints) {
      try { await track.applyConstraints({ cursor: { exact: 'never' } }) }
      catch (error) { console.info('[OCR 抓帧] 浏览器未接受关闭指针约束:', error?.name || String(error)) }
    }
    track?.addEventListener('ended', () => {
      if (!stoppedByUs) console.info('[OCR 抓帧] 捕获轨道被外部结束')
    })

    video.srcObject = stream
    video.muted = true
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('截图来源未开始输出画面，请确认游戏未最小化后重试')), 8000)
      video.play().then(() => { clearTimeout(timer); resolve() }, error => { clearTimeout(timer); reject(error) })
    })
    await new Promise((resolve, reject) => {
      let callbackId
      const timer = setTimeout(() => {
        if (callbackId !== undefined) video.cancelVideoFrameCallback(callbackId)
        reject(new Error('未取得最新游戏画面，请确认窗口仍然打开且未最小化后重试'))
      }, 8000)
      const ready = () => { clearTimeout(timer); resolve() }
      if (typeof video.requestVideoFrameCallback === 'function') {
        callbackId = video.requestVideoFrameCallback(ready)
      } else {
        setTimeout(ready, 250)
      }
    })
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    if (!canvas.width || !canvas.height || track.readyState === 'ended') throw new Error('截图来源已结束，请重新选择游戏窗口')
    const context = canvas.getContext('2d', { willReadFrequently: true })
    context.drawImage(video, 0, 0)
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
    // Settings before the first frame can still report the requested ideal (e.g. 7680),
    // not the negotiated source dimensions. Read them only once a real frame arrived.
    const settings = track.getSettings()
    const meta = {
      displaySurface: settings.displaySurface || 'unknown',
      logicalSurface: settings.logicalSurface ?? null,
      width: settings.width ?? null, height: settings.height ?? null,
      frameRate: settings.frameRate ?? null,
      frameWidth: video.videoWidth, frameHeight: video.videoHeight,
      outputWidth: canvas.width, outputHeight: canvas.height,
      ocrWidth: imageData.width, ocrHeight: imageData.height,
      format: 'image/png', scaleX: canvas.width / video.videoWidth, scaleY: canvas.height / video.videoHeight,
      resizeMode: settings.resizeMode || 'unknown', screenPixelRatio: settings.screenPixelRatio ?? null,
      backend: 'getDisplayMedia', cursorRequested: 'never', cursor: settings.cursor || 'unknown',
      cursorConstraintSupported: navigator.mediaDevices.getSupportedConstraints?.().cursor === true,
      cursorSuppressed: settings.cursor === 'never',
    }
    console.info('[OCR 抓帧] 无损输出 / OCR 输入:', meta)
    return { imageData, meta, dataUrl: canvas.toDataURL('image/png') }
  } finally {
    stoppedByUs = true
    for (const track of stream.getTracks()) track.stop()
    video.pause()
    video.srcObject = null
  }
}
