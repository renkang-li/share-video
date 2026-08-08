import { createReadStream, existsSync, statSync } from 'node:fs'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { basename, extname, join, resolve } from 'node:path'
import express from 'express'
import multer from 'multer'
import { optimizeForStreaming } from './video-processing.js'

const PORT = Number(process.env.PORT || 8078)
const HOST = process.env.HOST || '0.0.0.0'
const DIST_DIR = resolve('dist')
const VIDEO_DIR = resolve(process.env.VIDEO_DIR || 'shared-videos')
const VIDEO_INDEX_PATH = join(VIDEO_DIR, 'index.json')
const VIDEO_FASTSTART_ENABLED = process.env.VIDEO_FASTSTART !== 'false'
const VIDEO_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const videos = new Map()
let indexWrite = Promise.resolve()

const VIDEO_EXTENSIONS = new Set([
  '.avi',
  '.m4v',
  '.mkv',
  '.mov',
  '.mp4',
  '.mpeg',
  '.mpg',
  '.ogv',
  '.webm',
  '.wmv'
])

const VIDEO_MIME_TYPES = {
  '.avi': 'video/x-msvideo',
  '.m4v': 'video/x-m4v',
  '.mkv': 'video/x-matroska',
  '.mov': 'video/quicktime',
  '.mp4': 'video/mp4',
  '.mpeg': 'video/mpeg',
  '.mpg': 'video/mpeg',
  '.ogv': 'video/ogg',
  '.webm': 'video/webm',
  '.wmv': 'video/x-ms-wmv'
}

const STATIC_MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
}

const app = express()
app.disable('x-powered-by')

const storage = multer.diskStorage({
  destination(request, file, callback) {
    callback(null, VIDEO_DIR)
  },
  filename(request, file, callback) {
    const id = randomUUID()
    const extension = getVideoExtension(file.originalname, file.mimetype)
    const filename = `${id}${extension}`
    request.uploadInfo = { id, filename }
    request.uploadTempPaths = [...(request.uploadTempPaths || []), join(VIDEO_DIR, filename)]
    callback(null, filename)
  }
})

const upload = multer({
  storage,
  limits: {
    files: 1
  }
})

await mkdir(VIDEO_DIR, { recursive: true })
await loadVideoIndex()

app.use((request, response, next) => {
  response.setHeader('X-Content-Type-Options', 'nosniff')
  next()
})

app.get('/api/videos', (request, response) => {
  response.setHeader('Cache-Control', 'no-store')
  response.json([...videos.values()].sort(sortVideos).map(publicVideo))
})

app.post('/api/videos', (request, response, next) => {
  if (request.query.mode !== 'development') {
    response.status(403).json({ error: '上传功能仅在开发者模式开启' })
    return
  }

  upload.single('video')(request, response, async (error) => {
    if (error) {
      next(error)
      return
    }

    const file = request.file
    if (!file) {
      response.status(400).json({ error: '请选择视频文件' })
      return
    }

    if (!isVideoFile(file)) {
      await cleanupFiles(file.path)
      response.status(400).json({ error: '只支持视频文件' })
      return
    }

    let video
    const optimizationAbort = new AbortController()
    const abortOptimization = () => optimizationAbort.abort()
    request.once('aborted', abortOptimization)

    try {
      if (VIDEO_FASTSTART_ENABLED) {
        const optimization = await optimizeForStreaming(file.path, {
          force: true,
          signal: optimizationAbort.signal,
          onTemporaryPath(temporaryPath) {
            request.uploadTempPaths = [...(request.uploadTempPaths || []), temporaryPath]
          }
        })

        if (optimization.optimized) {
          console.log(`[videos] streaming normalization completed: ${file.originalname}`)
        }
      }

      const uploadInfo = request.uploadInfo || {
        id: randomUUID(),
        filename: basename(file.path)
      }
      const fileStat = await stat(file.path)
      video = {
        id: uploadInfo.id,
        name: getSafeVideoName(file.originalname),
        filename: uploadInfo.filename,
        mimeType: getVideoMimeType(file.originalname, file.mimetype),
        size: fileStat.size,
        createdAt: new Date().toISOString()
      }

      videos.set(video.id, video)
      await persistVideoIndex()
      response.status(201).json(publicVideo(video))
    } catch (error) {
      if (video) videos.delete(video.id)
      await cleanupFiles(...(request.uploadTempPaths || []))
      next(error)
    } finally {
      request.off('aborted', abortOptimization)
    }
  })
})

app.delete('/api/videos/:videoId', async (request, response, next) => {
  if (request.query.mode !== 'development') {
    response.status(403).json({ error: '删除功能仅在开发者模式开启' })
    return
  }

  const video = videos.get(request.params.videoId)
  if (!video) {
    response.status(404).json({ error: '视频不存在' })
    return
  }

  try {
    await cleanupFiles(getVideoPath(video))
    videos.delete(video.id)
    await persistVideoIndex()
    response.status(204).end()
  } catch (error) {
    next(error)
  }
})

app.get('/api/videos/:videoId/stream', async (request, response) => {
  const video = videos.get(request.params.videoId)
  if (!video) {
    response.status(404).json({ error: '视频不存在' })
    return
  }

  const filePath = getVideoPath(video)
  let fileStat
  try {
    fileStat = await stat(filePath)
  } catch {
    response.status(404).json({ error: '视频文件不存在' })
    return
  }

  if (!fileStat.isFile() || fileStat.size < 1) {
    response.status(404).json({ error: '视频文件不存在' })
    return
  }

  const range = parseByteRange(request.headers.range, fileStat.size)
  if (range === 'invalid') {
    response.status(416)
    response.setHeader('Content-Range', `bytes */${fileStat.size}`)
    response.end()
    return
  }

  const start = range?.start || 0
  const end = range?.end ?? fileStat.size - 1
  const contentLength = end - start + 1

  response.status(range ? 206 : 200)
  response.setHeader('Content-Type', video.mimeType)
  response.setHeader('Content-Length', contentLength)
  response.setHeader('Accept-Ranges', 'bytes')
  response.setHeader('Content-Disposition', inlineContentDisposition(video.name))
  response.setHeader('Cache-Control', 'public, max-age=3600')
  response.setHeader('X-Accel-Buffering', 'no')

  if (range) {
    response.setHeader('Content-Range', `bytes ${start}-${end}/${fileStat.size}`)
  }

  if (request.method === 'HEAD') {
    response.end()
    return
  }

  const stream = createReadStream(filePath, { start, end })
  const destroyStream = () => stream.destroy()
  response.once('close', destroyStream)
  request.once('aborted', destroyStream)
  stream.once('close', () => {
    response.off('close', destroyStream)
    request.off('aborted', destroyStream)
  })
  stream.once('error', (error) => {
    if (!response.destroyed) response.destroy(error)
  })
  stream.pipe(response)
})

app.use(express.json({ limit: '1mb' }))

app.use((request, response, next) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    next()
    return
  }

  const filePath = resolveStaticPath(request.path)
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    sendFile(response, join(DIST_DIR, 'index.html'))
    return
  }

  sendFile(response, filePath)
})

app.use((error, request, response, next) => {
  cleanupFiles(...(request.uploadTempPaths || []))

  if (request.aborted || response.destroyed) return
  if (response.headersSent) {
    next(error)
    return
  }

  if (error instanceof multer.MulterError) {
    response.status(400).json({ error: error.message || '上传失败' })
    return
  }

  response.status(500).json({ error: error.message || '服务器错误' })
})

const server = app.listen(PORT, HOST, () => {
  console.log(`Video directory is running at http://${HOST}:${PORT}`)
})
server.requestTimeout = 0
server.timeout = 0

async function loadVideoIndex() {
  let entries
  try {
    entries = JSON.parse(await readFile(VIDEO_INDEX_PATH, 'utf8'))
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn(`[videos] index load failed: ${error.message}`)
    }
    return
  }

  if (!Array.isArray(entries)) return

  await Promise.all(entries.map(async (entry) => {
    const name = getSafeVideoName(entry?.name || entry?.originalName)
    if (!isValidVideoId(entry?.id) || !entry.filename || !name) return

    const video = {
      id: entry.id,
      name,
      filename: basename(entry.filename),
      mimeType: entry.mimeType || entry.mime || getVideoMimeType(name, ''),
      size: Number(entry.size) || 0,
      createdAt: entry.createdAt || new Date(0).toISOString()
    }

    try {
      const fileStat = await stat(getVideoPath(video))
      if (fileStat.isFile() && fileStat.size > 0) {
        video.size = fileStat.size
        videos.set(video.id, video)
      }
    } catch {
      // Do not expose an index entry whose file is missing.
    }
  }))
}

function persistVideoIndex() {
  indexWrite = indexWrite.catch(() => {}).then(async () => {
    const temporaryPath = `${VIDEO_INDEX_PATH}.${randomUUID()}.tmp`
    const entries = [...videos.values()].sort(sortVideos)
    await writeFile(temporaryPath, `${JSON.stringify(entries, null, 2)}\n`, 'utf8')
    await rename(temporaryPath, VIDEO_INDEX_PATH)
  })

  return indexWrite
}

function publicVideo(video) {
  return {
    id: video.id,
    name: video.name,
    size: video.size,
    mimeType: video.mimeType,
    createdAt: video.createdAt,
    streamUrl: `/api/videos/${video.id}/stream`
  }
}

function sortVideos(first, second) {
  return String(second.createdAt).localeCompare(String(first.createdAt))
}

function getVideoPath(video) {
  return join(VIDEO_DIR, basename(video.filename))
}

function getSafeVideoName(value) {
  const rawName = String(value || 'video')
  const repairedName = Buffer.from(rawName, 'latin1').toString('utf8')
  const decodedName = repairedName.includes('\uFFFD') ? rawName : repairedName
  const normalized = decodedName.replaceAll('\\', '/')
  const name = basename(normalized).trim().slice(0, 240)
  return name || 'video'
}

function getVideoExtension(originalName, mimeType = '') {
  const extension = extname(getSafeVideoName(originalName)).toLowerCase()
  if (VIDEO_EXTENSIONS.has(extension)) return extension

  const normalizedMimeType = String(mimeType).toLowerCase()
  return Object.entries(VIDEO_MIME_TYPES)
    .find(([, mime]) => mime === normalizedMimeType)?.[0] || '.mp4'
}

function getVideoMimeType(originalName, mimeType = '') {
  const normalizedMimeType = String(mimeType).toLowerCase()
  if (normalizedMimeType.startsWith('video/')) return normalizedMimeType
  return VIDEO_MIME_TYPES[getVideoExtension(originalName, normalizedMimeType)] || 'video/mp4'
}

function isVideoFile(file) {
  const mimeType = String(file.mimetype || '').toLowerCase()
  const extension = extname(getSafeVideoName(file.originalname)).toLowerCase()
  return mimeType.startsWith('video/') || VIDEO_EXTENSIONS.has(extension)
}

function parseByteRange(value, size) {
  if (!value) return null

  const match = /^bytes=(\d*)-(\d*)$/.exec(String(value).trim())
  if (!match || (!match[1] && !match[2])) return 'invalid'

  let start
  let end
  if (match[1]) {
    start = Number(match[1])
    end = match[2] ? Number(match[2]) : size - 1
  } else {
    const suffixLength = Number(match[2])
    if (!Number.isSafeInteger(suffixLength) || suffixLength < 1) return 'invalid'
    start = Math.max(size - suffixLength, 0)
    end = size - 1
  }

  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= size) {
    return 'invalid'
  }

  return { start, end: Math.min(end, size - 1) }
}

function inlineContentDisposition(filename) {
  const fallback = filename.replace(/[^\x20-\x7e]/g, '_')
  return `inline; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

function isValidVideoId(value) {
  return typeof value === 'string' && VIDEO_ID_PATTERN.test(value)
}

function resolveStaticPath(pathname) {
  let decodedPath
  try {
    decodedPath = decodeURIComponent(pathname)
  } catch {
    return join(DIST_DIR, 'index.html')
  }

  const filePath = resolve(DIST_DIR, `.${decodedPath}`)
  const distPrefix = `${DIST_DIR}${process.platform === 'win32' ? '\\' : '/'}`
  if (filePath !== DIST_DIR && !filePath.startsWith(distPrefix)) {
    return join(DIST_DIR, 'index.html')
  }

  if (decodedPath.endsWith('/')) return join(filePath, 'index.html')
  return filePath
}

function sendFile(response, filePath) {
  const extension = extname(filePath).toLowerCase()
  response.setHeader('Content-Type', STATIC_MIME_TYPES[extension] || 'application/octet-stream')
  response.setHeader('Cache-Control', filePath.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache')

  if (response.req.method === 'HEAD') {
    response.end()
    return
  }

  createReadStream(filePath).pipe(response)
}

async function cleanupFiles(...paths) {
  await Promise.allSettled(paths.map((path) => {
    if (!path) return Promise.resolve()
    return rm(path, { force: true, recursive: true })
  }))
}
