import { randomUUID } from 'node:crypto'
import { readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'
import { FASTSTART_EXTENSIONS, isFastStart, optimizeForStreaming } from '../video-processing.js'

const videoDirectory = resolve(process.env.VIDEO_DIR || 'shared-videos')
const force = process.argv.includes('--force')

const entries = await readdir(videoDirectory, { withFileTypes: true })
const videoFiles = entries
  .filter((entry) => entry.isFile() && FASTSTART_EXTENSIONS.has(extname(entry.name).toLowerCase()))
  .map((entry) => entry.name)
  .sort()

if (!videoFiles.length) {
  console.log(`没有找到可处理的视频：${videoDirectory}`)
  process.exit(0)
}

for (const filename of videoFiles) {
  const filePath = join(videoDirectory, filename)

  if (!force && await isFastStart(filePath)) {
    console.log(`[skip] ${filename}（已经是 faststart）`)
    continue
  }

  console.log(`[process] ${filename}`)
  const result = await optimizeForStreaming(filePath, { force })
  console.log(result.optimized ? `[done] ${filename}` : `[skip] ${filename}（${result.reason}）`)
}

await refreshIndexSizes()
console.log('视频处理完成')

async function refreshIndexSizes() {
  const indexPath = join(videoDirectory, 'index.json')
  let entries

  try {
    entries = JSON.parse(await readFile(indexPath, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return
    throw error
  }

  if (!Array.isArray(entries)) return

  let changed = false
  for (const entry of entries) {
    if (!entry?.filename) continue

    try {
      const fileStat = await stat(join(videoDirectory, entry.filename))
      if (entry.size !== fileStat.size) {
        entry.size = fileStat.size
        changed = true
      }
    } catch {
      // Leave missing files for the server's normal index cleanup behavior.
    }
  }

  if (!changed) return

  const temporaryPath = `${indexPath}.${randomUUID()}.tmp`
  try {
    await writeFile(temporaryPath, `${JSON.stringify(entries, null, 2)}\n`, 'utf8')
    await rename(temporaryPath, indexPath)
  } catch (error) {
    await rm(temporaryPath, { force: true })
    throw error
  }

  console.log('[index] 已同步视频文件大小')
}
