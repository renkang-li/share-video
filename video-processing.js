import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { open, rename, rm, stat } from 'node:fs/promises'
import { extname } from 'node:path'

const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg'
const MAX_FFMPEG_ERROR_LENGTH = 4_000

export const FASTSTART_EXTENSIONS = new Set(['.m4v', '.mov', '.mp4'])

export async function optimizeForStreaming(filePath, options = {}) {
  const extension = extname(filePath).toLowerCase()
  if (!FASTSTART_EXTENSIONS.has(extension)) {
    return { optimized: false, reason: 'unsupported-format' }
  }

  if (!options.force && await isFastStart(filePath)) {
    return { optimized: false, reason: 'already-faststart' }
  }

  const temporaryPath = `${filePath}.${randomUUID()}.faststart${extension}`
  options.onTemporaryPath?.(temporaryPath)

  try {
    await runFfmpeg(filePath, temporaryPath, options.signal)
    await rename(temporaryPath, filePath)
    const fileStat = await stat(filePath)
    return { optimized: true, size: fileStat.size }
  } catch (error) {
    await rm(temporaryPath, { force: true })
    throw error
  }
}

export async function isFastStart(filePath) {
  const fileHandle = await open(filePath, 'r')

  try {
    const fileSize = (await fileHandle.stat()).size
    const header = Buffer.alloc(16)
    let offset = 0

    while (offset + 8 <= fileSize) {
      const { bytesRead } = await fileHandle.read(header, 0, header.length, offset)
      if (bytesRead < 8) return false

      let boxSize = header.readUInt32BE(0)
      const boxType = header.toString('ascii', 4, 8)
      let headerSize = 8

      if (boxSize === 1) {
        if (bytesRead < 16) return false
        boxSize = Number(header.readBigUInt64BE(8))
        headerSize = 16
      } else if (boxSize === 0) {
        boxSize = fileSize - offset
      }

      if (boxSize < headerSize || offset + boxSize > fileSize) return false
      if (boxType === 'moov') return true
      if (boxType === 'mdat') return false

      offset += boxSize
    }

    return false
  } finally {
    await fileHandle.close()
  }
}

function runFfmpeg(inputPath, outputPath, signal) {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG_PATH, [
      '-hide_banner',
      '-loglevel',
      'error',
      '-nostdin',
      '-y',
      '-fflags',
      '+genpts',
      '-i',
      inputPath,
      '-map',
      '0',
      '-c',
      'copy',
      '-avoid_negative_ts',
      'make_zero',
      '-movflags',
      '+faststart',
      outputPath
    ], {
      signal,
      stdio: ['ignore', 'ignore', 'pipe']
    })

    let errorOutput = ''
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk) => {
      errorOutput = `${errorOutput}${chunk}`.slice(-MAX_FFMPEG_ERROR_LENGTH)
    })

    child.once('error', (error) => {
      if (error.code === 'ENOENT') {
        reject(new Error(`未找到 FFmpeg，请安装 FFmpeg 或设置 FFMPEG_PATH（当前值：${FFMPEG_PATH}）`, { cause: error }))
        return
      }

      if (error.name === 'AbortError') {
        reject(error)
        return
      }

      reject(error)
    })

    child.once('close', (code, signalName) => {
      if (code === 0) {
        resolve()
        return
      }

      const reason = signalName ? `被信号 ${signalName} 终止` : `退出码 ${code}`
      const details = errorOutput.trim() ? `：${errorOutput.trim()}` : ''
      reject(new Error(`FFmpeg 处理失败（${reason}）${details}`))
    })
  })
}
