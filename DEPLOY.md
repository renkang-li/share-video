# 部署说明

这是一个简单的视频播放目录：开发者上传多个视频，其他人通过网页选择视频在线播放。

## 访问方式

开发者上传视频：

```text
http://服务器IP:8078/?mode=development
```

朋友在线播放：

```text
http://服务器IP:8078/
```

选中视频后点击“复制链接”，即可把带有 `?video=...` 的页面发给朋友。

视频文件和目录索引保存在 `shared-videos/`，重启服务后仍然保留。

应用本身不设置视频大小上限，实际限制取决于服务器磁盘和网络。如果使用 Cloudflare 橙色代理，大文件会受 Cloudflare 套餐的上传限制；此子域名应保持“仅 DNS/灰云”。

`mode=development` 是界面和接口开关，不是密码。如果服务暴露在公网，建议使用 Nginx、VPN 或其他访问认证保护开发者地址。

## 直接部署

```bash
npm ci
npm run build
PORT=8078 npm start
```

## Docker 部署

```bash
docker build -t share-video .
docker run -d --name share-video --restart unless-stopped \
  -p 127.0.0.1:8078:8078 \
  -v "$(pwd)/shared-videos:/app/shared-videos" \
  share-video
```

可选环境变量：

```bash
PORT=8078
HOST=0.0.0.0
VIDEO_DIR=shared-videos
# 默认开启 MP4/MOV 的无损 faststart；设为 false 可关闭
VIDEO_FASTSTART=true
# 如果 ffmpeg 不在 PATH 中，可指定完整路径
FFMPEG_PATH=/usr/bin/ffmpeg
```

上传 MP4/MOV 后，服务会使用 FFmpeg 进行无损重封装，把 `moov` 元数据移到文件开头；不会降低画质，也不会降低码率。首次处理大文件需要等待一段时间，并需要额外临时磁盘空间。

处理已有视频：

```bash
npm run optimize-videos
```

如果需要强制重新处理已经是 faststart 的文件：

```bash
npm run optimize-videos -- --force
```

Docker 部署可使用同一个镜像执行批处理：

```bash
docker run --rm \
  -v "$(pwd)/shared-videos:/app/shared-videos" \
  -e VIDEO_DIR=/app/shared-videos \
  share-video:latest npm run optimize-videos
```

直接部署时需要先安装 FFmpeg；Docker 镜像会自动安装。视频处理失败时不会把未完成的临时文件加入目录。

如果前面有 Nginx，大文件上传时需要调大上传限制：

```nginx
client_max_body_size 2048m;

location / {
  proxy_pass http://127.0.0.1:8078;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
}
```
