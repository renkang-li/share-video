import Player from 'xgplayer'
import 'xgplayer/dist/index.min.css'
import './styles.css'

const queryParams = new URLSearchParams(window.location.search)
const isDevelopmentMode = queryParams.get('mode') === 'development'
const requestedVideoId = queryParams.get('video') || ''
const app = document.querySelector('#app')

const state = {
  videos: [],
  selectedVideoId: '',
  searchQuery: '',
  player: null,
  uploadRequest: null,
  isUploading: false
}

app.innerHTML = `
  <main class="page-shell">
    <section class="directory-panel">
      <header class="directory-header">
        <div class="brand">
          <div class="brand-mark" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
          </div>
          <div class="brand-copy">
            <span class="eyebrow">私人视频空间</span>
            <h1>视频库</h1>
            <p>选一部视频，马上开始高清在线观看与分享。</p>
          </div>
        </div>

        <div class="header-actions">
          <span id="modeBadge" class="mode-badge hidden">
            <span class="mode-dot" aria-hidden="true"></span>开发者模式
          </span>
          <button id="uploadButton" class="primary-button hidden" type="button">
            <svg class="btn-svg-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            <span class="upload-btn-text">上传视频</span>
          </button>
          <input id="uploadInput" type="file" accept="video/*" hidden />
        </div>
      </header>

      <div class="status-bar" aria-live="polite">
        <span class="status-dot" aria-hidden="true"></span>
        <p id="statusText" class="status-text">正在读取视频目录…</p>
      </div>

      <div class="directory-layout">
        <section class="player-panel" aria-label="视频播放器">
          <div class="player-wrap">
            <div id="player" aria-label="视频播放器"></div>
            <div id="playerPlaceholder" class="player-placeholder">
              <div class="placeholder-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
              </div>
              <strong>选一部视频开始播放</strong>
              <span>支持在线播放，提供全屏体验与快捷键控制（← / → 切换，Space 暂停/播放）</span>
            </div>
          </div>

          <div class="player-info">
            <div class="now-playing">
              <span class="eyebrow">当前播放</span>
              <div class="player-heading-row">
                <h2 id="videoTitle">尚未选择视频</h2>
              </div>
              <p id="videoMeta">选择视频后，这里会显示文件信息</p>
            </div>
            <div class="player-actions">
              <div class="navigation-row" aria-label="切换视频">
                <button id="previousButton" class="secondary-button navigation-button" type="button" disabled title="快捷键: ←">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="15 18 9 12 15 6"></polyline>
                  </svg>
                  <span>上一部</span>
                </button>
                <span id="currentPosition" class="selection-position" aria-live="polite">00 / 00</span>
                <button id="nextButton" class="secondary-button navigation-button" type="button" disabled title="快捷键: →">
                  <span>下一部</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="9 18 15 12 9 6"></polyline>
                  </svg>
                </button>
              </div>
              <div class="share-row">
                <input id="shareLink" type="text" readonly placeholder="选择视频后生成分享链接" aria-label="视频分享链接" />
                <button id="copyButton" class="secondary-button copy-btn" type="button" disabled>
                  <svg class="btn-svg-icon copy-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                  <span class="copy-text">复制链接</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        <aside class="playlist-panel" aria-label="视频列表">
          <div class="playlist-header">
            <div class="playlist-title-area">
              <div>
                <span class="eyebrow">媒体库</span>
                <h2>视频目录</h2>
              </div>
              <span id="videoCount" class="video-count">0 部</span>
            </div>
            <div class="search-box">
              <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input id="searchInput" type="text" placeholder="搜索视频名称..." aria-label="搜索视频" />
              <button id="clearSearchButton" class="clear-search-btn hidden" type="button" aria-label="清空搜索">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          </div>
          <div id="videoList" class="video-list"></div>
        </aside>
      </div>
    </section>
  </main>
`

const refs = {
  modeBadge: document.querySelector('#modeBadge'),
  uploadButton: document.querySelector('#uploadButton'),
  uploadInput: document.querySelector('#uploadInput'),
  statusText: document.querySelector('#statusText'),
  player: document.querySelector('#player'),
  playerPlaceholder: document.querySelector('#playerPlaceholder'),
  videoTitle: document.querySelector('#videoTitle'),
  videoMeta: document.querySelector('#videoMeta'),
  previousButton: document.querySelector('#previousButton'),
  nextButton: document.querySelector('#nextButton'),
  currentPosition: document.querySelector('#currentPosition'),
  shareLink: document.querySelector('#shareLink'),
  copyButton: document.querySelector('#copyButton'),
  videoCount: document.querySelector('#videoCount'),
  videoList: document.querySelector('#videoList'),
  searchInput: document.querySelector('#searchInput'),
  clearSearchButton: document.querySelector('#clearSearchButton')
}

if (isDevelopmentMode) {
  refs.modeBadge.classList.remove('hidden')
  refs.uploadButton.classList.remove('hidden')
}

refs.uploadButton.addEventListener('click', () => refs.uploadInput.click())
refs.uploadInput.addEventListener('change', (event) => {
  const [file] = event.target.files
  if (file) uploadVideo(file)
})
refs.videoList.addEventListener('click', handleVideoListClick)
refs.previousButton.addEventListener('click', () => selectAdjacentVideo(-1, { autoPlay: true }))
refs.nextButton.addEventListener('click', () => selectAdjacentVideo(1, { autoPlay: true }))
refs.copyButton.addEventListener('click', copyShareLink)

refs.searchInput.addEventListener('input', (e) => {
  state.searchQuery = e.target.value
  if (state.searchQuery) {
    refs.clearSearchButton.classList.remove('hidden')
  } else {
    refs.clearSearchButton.classList.add('hidden')
  }
  renderVideoList()
})

refs.searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    state.searchQuery = ''
    refs.searchInput.value = ''
    refs.clearSearchButton.classList.add('hidden')
    renderVideoList()
    refs.searchInput.blur()
  }
})

refs.clearSearchButton.addEventListener('click', () => {
  state.searchQuery = ''
  refs.searchInput.value = ''
  refs.clearSearchButton.classList.add('hidden')
  renderVideoList()
})

// Keyboard shortcuts for ergonomic control
window.addEventListener('keydown', (event) => {
  if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return

  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    selectAdjacentVideo(-1, { autoPlay: true })
  } else if (event.key === 'ArrowRight') {
    event.preventDefault()
    selectAdjacentVideo(1, { autoPlay: true })
  } else if ((event.key === ' ' || event.key === 'k') && state.player) {
    event.preventDefault()
    if (state.player.paused) {
      state.player.play()
    } else {
      state.player.pause()
    }
  } else if ((event.key === 'f' || event.key === 'F') && state.player) {
    event.preventDefault()
    if (typeof state.player.getFullscreen === 'function' && state.player.getFullscreen()) {
      state.player.exitFullscreen()
    } else if (typeof state.player.requestFullscreen === 'function') {
      state.player.requestFullscreen()
    }
  }
})

loadVideos()

async function loadVideos(preferredId = '') {
  try {
    const response = await fetch('/api/videos')
    if (!response.ok) throw new Error(await readApiError(response))

    state.videos = await response.json()
    renderVideoList()

    const videoToSelect = state.videos.find(({ id }) => id === preferredId)
      || state.videos.find(({ id }) => id === requestedVideoId)

    if (videoToSelect) {
      selectVideo(videoToSelect.id)
    } else {
      updateNavigation()
      refs.statusText.textContent = state.videos.length
        ? '请选择一部视频开始播放'
        : isDevelopmentMode ? '目录为空，点击右上角上传视频' : '目录中还没有视频'
    }
  } catch (error) {
    refs.statusText.textContent = error.message || '视频目录读取失败'
    refs.videoList.innerHTML = '<p class="empty-list">暂时无法读取视频目录</p>'
  }
}

function renderVideoList() {
  const searchTerm = state.searchQuery.trim().toLowerCase()
  const filteredVideos = state.videos.filter(video => 
    !searchTerm || video.name.toLowerCase().includes(searchTerm)
  )

  refs.videoCount.textContent = searchTerm 
    ? `${filteredVideos.length} / ${state.videos.length} 部`
    : `${state.videos.length} 部`

  if (!filteredVideos.length) {
    const emptyText = searchTerm 
      ? '没有找到匹配的视频'
      : isDevelopmentMode ? '还没有视频，点击上方上传。' : '暂时还没有可播放的视频。'
    refs.videoList.innerHTML = `<p class="empty-list">${emptyText}</p>`
    return
  }

  refs.videoList.innerHTML = filteredVideos.map((video) => {
    const originalIndex = state.videos.findIndex(v => v.id === video.id)
    const isSelected = video.id === state.selectedVideoId
    return `
      <div class="video-item ${isSelected ? 'is-selected' : ''}" data-video-id="${escapeHtml(video.id)}">
        <button class="video-select" type="button" aria-label="播放 ${escapeHtml(video.name)}" aria-pressed="${isSelected}">
          <span class="video-thumb" aria-hidden="true">
            <span class="video-index">${String(originalIndex + 1).padStart(2, '0')}</span>
            <span class="video-thumb-glyph">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
            </span>
          </span>
          <span class="video-copy">
            <strong title="${escapeHtml(video.name)}">${escapeHtml(video.name)}</strong>
            <small>
              <span>${escapeHtml(formatBytes(video.size))}</span>
              <span>${escapeHtml(formatDate(video.createdAt))}</span>
            </small>
          </span>
          <span class="video-arrow" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </span>
        </button>
        ${isDevelopmentMode ? `
          <button class="delete-button" type="button" data-delete-id="${escapeHtml(video.id)}" aria-label="删除 ${escapeHtml(video.name)}" title="删除视频">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        ` : ''}
      </div>
    `
  }).join('')
}

function handleVideoListClick(event) {
  const deleteButton = event.target.closest('[data-delete-id]')
  if (deleteButton) {
    deleteVideo(deleteButton.dataset.deleteId)
    return
  }

  const item = event.target.closest('[data-video-id]')
  if (item) selectVideo(item.dataset.videoId, { revealInList: true, autoPlay: true })
}

function selectVideo(videoId, { revealInList = false, autoPlay = false } = {}) {
  const video = state.videos.find((item) => item.id === videoId)
  if (!video) return

  const videoIndex = state.videos.findIndex((item) => item.id === videoId)
  state.selectedVideoId = video.id
  refs.player.classList.add('is-visible')
  refs.playerPlaceholder.classList.add('hidden')
  setPlayerSource(video.streamUrl, autoPlay)
  refs.videoTitle.textContent = video.name
  refs.videoMeta.textContent = `${formatBytes(video.size)} · ${formatDate(video.createdAt)}`
  refs.shareLink.value = createShareUrl(video.id)
  refs.copyButton.disabled = false
  refs.statusText.textContent = autoPlay ? `正在播放：${video.name}` : '已准备好，点击播放器开始播放'
  document.title = `${video.name} · 视频库`
  updateNavigation(videoIndex)

  renderVideoList()

  const selectedItem = [...refs.videoList.querySelectorAll('[data-video-id]')]
    .find((item) => item.dataset.videoId === video.id)
  if (revealInList && window.matchMedia('(min-width: 861px)').matches) {
    selectedItem?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }
}

function setPlayerSource(streamUrl, autoPlay = false) {
  destroyPlayer()

  try {
    const player = new Player({
      id: 'player',
      url: streamUrl,
      width: '100%',
      height: '100%',
      videoFillMode: 'contain',
      videoInit: true,
      controls: true,
      autoplay: autoPlay,
      playsinline: true,
      lang: 'zh-cn',
      videoConfig: {
        preload: 'metadata'
      }
    })

    player.on('ended', () => {
      selectAdjacentVideo(1, { autoPlay: true })
    })
    player.on('error', handlePlayerError)
    state.player = player
  } catch {
    handlePlayerError()
  }
}

function destroyPlayer() {
  if (!state.player) return
  state.player.destroy()
  state.player = null
}

function handlePlayerError() {
  refs.statusText.textContent = '视频无法播放，请确认文件格式受浏览器支持'
}

function selectAdjacentVideo(direction, options = {}) {
  const currentIndex = state.videos.findIndex((video) => video.id === state.selectedVideoId)
  const nextIndex = currentIndex + direction
  const nextVideo = state.videos[nextIndex]
  if (nextVideo) selectVideo(nextVideo.id, { revealInList: true, ...options })
}

function updateNavigation(currentIndex = state.videos.findIndex((video) => video.id === state.selectedVideoId)) {
  const hasSelection = currentIndex >= 0 && currentIndex < state.videos.length
  const total = String(state.videos.length).padStart(2, '0')
  const position = hasSelection ? String(currentIndex + 1).padStart(2, '0') : '00'

  refs.currentPosition.textContent = `${position} / ${total}`
  refs.previousButton.disabled = !hasSelection || currentIndex <= 0
  refs.nextButton.disabled = !hasSelection || currentIndex >= state.videos.length - 1
}

function createShareUrl(videoId) {
  const shareUrl = new URL(window.location.href)
  shareUrl.search = ''
  shareUrl.hash = ''
  shareUrl.searchParams.set('video', videoId)
  return shareUrl.toString()
}

let copyTimeout = null
async function copyShareLink() {
  if (!refs.shareLink.value) return

  try {
    await navigator.clipboard.writeText(refs.shareLink.value)
  } catch {
    refs.shareLink.select()
    document.execCommand('copy')
  }

  refs.statusText.textContent = '分享链接已复制'

  refs.copyButton.classList.add('is-copied')
  const copyText = refs.copyButton.querySelector('.copy-text')
  const originalText = copyText ? copyText.textContent : '复制链接'
  if (copyText) copyText.textContent = '已复制！'

  if (copyTimeout) clearTimeout(copyTimeout)
  copyTimeout = setTimeout(() => {
    refs.copyButton.classList.remove('is-copied')
    if (copyText) copyText.textContent = originalText
  }, 2000)
}

function uploadVideo(file) {
  if (!isDevelopmentMode || state.isUploading) return

  state.isUploading = true
  refs.uploadButton.disabled = true
  const uploadText = refs.uploadButton.querySelector('.upload-btn-text')
  if (uploadText) uploadText.textContent = '上传中 0%'
  refs.statusText.textContent = `正在上传 ${file.name}`

  const formData = new FormData()
  formData.append('video', file, file.name)

  const request = new XMLHttpRequest()
  state.uploadRequest = request
  request.open('POST', '/api/videos?mode=development')

  request.upload.onprogress = (event) => {
    if (!event.lengthComputable) return
    const percent = Math.round((event.loaded / event.total) * 100)
    if (percent >= 100) {
      if (uploadText) uploadText.textContent = '整理视频中...'
      refs.statusText.textContent = '上传完成，正在整理视频，请稍候…'
      return
    }

    if (uploadText) uploadText.textContent = `上传中 ${percent}%`
    refs.statusText.textContent = `正在上传 ${formatBytes(event.loaded)} / ${formatBytes(event.total)}`
  }

  request.onload = async () => {
    state.uploadRequest = null
    if (request.status < 200 || request.status >= 300) {
      refs.statusText.textContent = readRequestError(request)
      finishUpload()
      return
    }

    let uploadedVideo
    try {
      uploadedVideo = JSON.parse(request.responseText)
    } catch {
      refs.statusText.textContent = '上传成功，但服务器返回数据无效'
      finishUpload()
      return
    }

    await loadVideos(uploadedVideo.id)
    refs.statusText.textContent = '上传完成，视频已加入播放目录'
    finishUpload()
  }

  request.onerror = () => {
    state.uploadRequest = null
    refs.statusText.textContent = '网络错误，视频上传失败'
    finishUpload()
  }

  request.onabort = () => {
    state.uploadRequest = null
    refs.statusText.textContent = '上传已取消'
    finishUpload()
  }

  request.send(formData)
}

async function deleteVideo(videoId) {
  if (!isDevelopmentMode) return
  const video = state.videos.find((item) => item.id === videoId)
  if (!video || !window.confirm(`确定删除“${video.name}”吗？`)) return

  const response = await fetch(`/api/videos/${videoId}?mode=development`, { method: 'DELETE' })
  if (!response.ok) {
    refs.statusText.textContent = await readApiError(response)
    return
  }

  if (state.selectedVideoId === videoId) {
    destroyPlayer()
    refs.player.classList.remove('is-visible')
    refs.playerPlaceholder.classList.remove('hidden')
    refs.videoTitle.textContent = '尚未选择视频'
    refs.videoMeta.textContent = '选择视频后，这里会显示文件信息'
    refs.shareLink.value = ''
    refs.copyButton.disabled = true
    state.selectedVideoId = ''
  }

  await loadVideos()
  refs.statusText.textContent = '视频已删除'
}

function finishUpload() {
  state.isUploading = false
  refs.uploadButton.disabled = false
  const uploadText = refs.uploadButton.querySelector('.upload-btn-text')
  if (uploadText) uploadText.textContent = '上传视频'
  refs.uploadInput.value = ''
}

async function readApiError(response) {
  try {
    const data = await response.json()
    return data.error || '请求失败'
  } catch {
    return '请求失败'
  }
}

function readRequestError(request) {
  try {
    const data = JSON.parse(request.responseText)
    return data.error || '上传失败'
  } catch {
    return '上传失败'
  }
}

function formatBytes(bytes) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`
}

function formatDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '刚刚'
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(date)
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}
