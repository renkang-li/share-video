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
```

如果前面有 Nginx，大文件上传时需要调大上传限制：

```nginx
client_max_body_size 2048m;

location / {
  proxy_pass http://127.0.0.1:8078;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
}
```
