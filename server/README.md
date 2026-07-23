# HoloGrip 反代服务 (Rust + axum)

把真实的 Gemini API Key 锁在服务端的轻量反向代理。前端打包出来的 bundle 不再含 key,所有 AI 请求经由 Nginx 反代到本服务,本服务做鉴权后注入真实 `Authorization` 转发到上游。

## 设计要点

- **透明转发**:`POST /api/gemini/<rest>` → `POST {UPSTREAM_BASE_URL}/<rest>`,不解析 body,跟 Gemini 协议解耦
- **HMAC token 鉴权**:浏览器先调 `/api/auth/issue` 拿短期 token(默认 1h、绑定 IP、配额上限),后续请求带 `Authorization: Bearer <token>`;服务重启后旧 token 立即作废
- **Header 白名单**:入向只透传 `content-type / accept / accept-encoding`,`authorization` 由服务端覆盖
- **流式响应**:`reqwest::Response::bytes_stream()` → `axum::body::Body::from_stream`
- **限流**:`tower_governor` IP 级令牌桶,反代场景下用 `SmartIpKeyExtractor` 优先读 `X-Forwarded-For`
- **大小限制**:`RequestBodyLimitLayer` 拦超大请求体(默认 16MB)
- **超时**:`reqwest::Client` 全局 120s 超时
- **优雅退出**:`with_graceful_shutdown` 平滑结束在飞请求
- **Prometheus 指标**:`/metrics` 端点暴露请求计数/直方图/鉴权失败原因等

## 目录结构

```
server/
├── Cargo.toml
├── .env.example          ← 复制为 .env 填真实 key 和 HMAC 密钥
├── README.md
└── src/
    ├── main.rs           ← 启动 + 装配
    ├── config.rs         ← 环境变量结构
    ├── auth.rs           ← HMAC token 服务(含单元测试)
    ├── proxy.rs          ← 鉴权中间件 + 反代 handler
    └── metrics.rs        ← Prometheus 指标
```

## API

### `GET /healthz`
健康检查,返回 `ok`。systemd 与监控可用。

### `POST /api/auth/issue`
签发 token。无请求体。需带 `Origin` 头(白名单校验)。
返回:
```json
{ "token": "...", "expires_in": 3600, "quota": 100 }
```

### `* /api/gemini/{*path}`
透明转发到 `UPSTREAM_BASE_URL/{path}`。必须带 `Authorization: Bearer <token>`。
返回上游的状态码与流式 body。

### `GET /metrics`(只在内网监听端口)
Prometheus 抓取格式。默认绑 `127.0.0.1:9898`,**不通过 Nginx 暴露给公网**。

---

## 本地开发

```bash
cd server
cp .env.example .env
# 编辑 .env,至少填上 UPSTREAM_API_KEY 和 AUTH_HMAC_SECRET
cargo run --release
```

服务监听 `127.0.0.1:8787`,metrics 监听 `127.0.0.1:9898`。

```bash
# 1) 健康
curl http://127.0.0.1:8787/healthz                              # ok

# 2) 签 token(默认 AUTH_ISSUE_ALLOWED_ORIGINS=*,本地不需要 Origin)
curl -s -X POST http://127.0.0.1:8787/api/auth/issue
# {"token":"...","expires_in":3600,"quota":100}

# 3) 调反代
TOKEN="..."
curl -X POST http://127.0.0.1:8787/api/gemini/v1beta/models/foo:generateContent \
     -H "authorization: Bearer $TOKEN" \
     -H 'content-type: application/json' -d '{}'

# 4) metrics
curl http://127.0.0.1:9898/metrics | head -50
```

## 单元测试

```bash
cargo test --release
```

`auth` 模块 4 个测试,覆盖签发/验证/IP 不匹配/篡改签名/quota 耗尽。

---

## 部署到阿里云 + 宝塔

### 概览

```
本地           ──[git push]──>  GitHub/Gitee
                                    │
服务器(宝塔终端) ──[git pull / 上传 server/]──> /opt/hologrip-proxy
                                    │
                          cargo build --release
                                    │
                          systemctl enable --now hologrip-proxy
                                    │
              Nginx 反代 /api/* → 127.0.0.1:8787
              静态站点 / → /www/wwwroot/你的域名/
```

### 0. 本地准备前端产物

```bash
cp .env.production.example .env
npm run build                   # 产物在 dist/
```

### 1. 服务器装 Rust

宝塔面板 → 终端(或 SSH 上去),按 root / sudo 执行:

```bash
# rustup 一行装好(国内访问慢的话用 RsProxy 镜像,见下面注)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable

# 让当前 shell 找到 cargo
source $HOME/.cargo/env

rustc --version    # 应 >= 1.77
cargo --version
```

> **国内服务器加速**:如果上一步卡在下载工具链,先设镜像再装:
> ```bash
> export RUSTUP_DIST_SERVER=https://rsproxy.cn
> export RUSTUP_UPDATE_ROOT=https://rsproxy.cn/rustup
> curl --proto '=https' --tlsv1.2 -sSf https://rsproxy.cn/rustup-init.sh | sh -s -- -y
> source $HOME/.cargo/env
> ```
> crates.io 也可以加速,在 `~/.cargo/config.toml` 写:
> ```toml
> [source.crates-io]
> replace-with = 'rsproxy-sparse'
> [source.rsproxy-sparse]
> registry = "sparse+https://rsproxy.cn/index/"
> ```

### 2. 上传源码

把仓库的 `server/` 整个目录放到服务器 `/opt/hologrip-proxy/`。三种姿势任选:

**(a)git(最方便)**
```bash
sudo mkdir -p /opt
sudo git clone <你的仓库地址> /opt/hologrip-source
sudo ln -s /opt/hologrip-source/server /opt/hologrip-proxy
```

**(b)宝塔文件管理器**:本地把 `server/` 压成 zip,上传到 `/opt/`,在线解压重命名为 `hologrip-proxy`。

**(c)SFTP**:WinSCP / FileZilla 同步 `server/` 到 `/opt/hologrip-proxy/`。

> ⚠️ **不要**把 `target/` 上传,它是几百 MB 的本机产物,服务器上要用自己编出来的版本。

### 3. 编译

```bash
cd /opt/hologrip-proxy
cargo build --release
# 二进制在 target/release/hologrip-proxy
```

第一次会编 ~150 个依赖,大约 5-10 分钟。

#### 小内存服务器避免 OOM

如果服务器是 1G 或更小的实例,默认 `cargo build` 会并发编译多个 crate,容易撑爆内存触发 OOM Killer。两条解决路径任选:

**路径 A:加 swap(一次性,永久生效)**
```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h    # 确认 Swap 已挂载
```

**路径 B:限制 cargo 并发**
```bash
cargo build --release -j 1            # 单线程编,慢但不 OOM
# 或者
CARGO_BUILD_JOBS=2 cargo build --release
```

如果还是 OOM,看 `dmesg | tail` 找 OOM 记录,确认是哪一步炸的(通常是 `rustc` 链接 `hologrip-proxy` 自身那一步)。

### 4. 配置 .env

```bash
cd /opt/hologrip-proxy
cp .env.example .env
nano .env
```

至少改这几项:

```dotenv
UPSTREAM_API_KEY=sk-真实key

# 服务器上跑一次 `openssl rand -hex 32` 把结果填进来
AUTH_HMAC_SECRET=粘贴-openssl-rand-hex-32-的输出

# 改成你的真实域名
CORS_ALLOWED_ORIGINS=https://你的域名
AUTH_ISSUE_ALLOWED_ORIGINS=https://你的域名
```

`openssl rand -hex 32` 生成 64 字符十六进制串,正好满足 32 字节最低要求。

### 5. 注册 systemd 服务

新建 `/etc/systemd/system/hologrip-proxy.service`:

```bash
sudo tee /etc/systemd/system/hologrip-proxy.service > /dev/null <<'EOF'
[Unit]
Description=HoloGrip Gemini reverse proxy
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/hologrip-proxy
EnvironmentFile=/opt/hologrip-proxy/.env
ExecStart=/opt/hologrip-proxy/target/release/hologrip-proxy
Restart=on-failure
RestartSec=3

# 沙箱
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/hologrip-proxy

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now hologrip-proxy
sudo systemctl status hologrip-proxy            # 应 active (running)
sudo journalctl -u hologrip-proxy -f            # 看启动日志
```

启动日志正常应包含:
```
启动反代服务 bind=127.0.0.1:8787 upstream=https://api.gemai.cc
metrics 端点已启动 bind=127.0.0.1:9898
```

服务器自测:
```bash
curl http://127.0.0.1:8787/healthz                # ok
curl -X POST http://127.0.0.1:8787/api/auth/issue # 拿到 token
```

### 6. 上传前端 dist

把本地 `dist/*` 同步到 `/www/wwwroot/你的域名/`(SFTP 或宝塔文件管理器)。

### 7. 配置 Nginx

宝塔 → 网站 → 你的站点 → 设置 → 配置文件,替换为:

```nginx
server {
    listen 80;
    server_name 你的域名;
    root /www/wwwroot/你的域名;
    index index.html;

    # ── 静态资源 ─────────────────────────────────
    location = / {
        try_files /index.html =404;
    }

    # 多页入口（无尾斜杠 → 对应 *.html）
    # 注意：public/pool/ 资源目录与 pool 入口同名时，/pool/ 依赖 dist/pool/index.html
    # （vite 构建插件会自动从 pool.html 复制），不要删掉该 index。
    location = /physics { try_files /physics.html =404; }
    location = /rocket  { try_files /rocket.html =404; }
    location = /pool    { try_files /pool.html =404; }
    location = /holomath { try_files /holomath.html =404; }
    location = /portfolio { try_files /portfolio.html =404; }
    location = /profile { try_files /profile.html =404; }
    location = /about { try_files /about.html =404; }
    location = /login { try_files /login.html =404; }
    location = /dashboard { try_files /dashboard.html =404; }
    location = /admin { try_files /admin.html =404; }

    location /assets/ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    location ~* \.html$ {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        expires 0;
    }

    add_header Permissions-Policy "camera=(self), microphone=(self)";

    # ── 反代到 Rust 服务 ──────────────────────────
    location /api/ {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # 流式响应必备
        proxy_buffering off;
        proxy_request_buffering off;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;

        client_max_body_size 20m;
    }

    # $uri/ 会命中 public 拷贝出的目录（如 /pool/）；目录内需有 index.html
    location / {
        try_files $uri $uri/ $uri.html /index.html;
    }

    access_log /www/wwwlogs/你的域名.log;
    error_log /www/wwwlogs/你的域名.error.log;
}
```

### 8. HTTPS(必做)

宝塔 → SSL → Let's Encrypt → 申请 → 强制 HTTPS。
没 HTTPS 浏览器拒绝调摄像头,AI 几何识别功能不可用。

### 9. 阿里云安全组

控制台 → ECS → 安全组 → 入方向放行 80、443。
**不要**开放 8787 / 9898,反代和 metrics 只在 127.0.0.1 监听。

### 10. 验收

```bash
# 自测
curl https://你的域名/healthz                                    # ok
curl -s -X POST https://你的域名/api/auth/issue \
     -H "origin: https://你的域名"                                # 拿到 token
```

浏览器访问 `https://你的域名/` → 进 app 页 → F12 看 Network:
- 第一个请求是 `POST /api/auth/issue` → 200 + `{token,expires_in,quota}`
- 后续 `POST /api/gemini/v1beta/...` 带 `Authorization: Bearer ey...`,但 **bundle 里搜不到 sk-* 真实 key**

---

## 配置项(server/.env)

| 变量 | 必填 | 默认 | 说明 |
|---|---|---|---|
| `PROXY_BIND` |  | `127.0.0.1:8787` | 主服务监听,**保持 127.0.0.1** |
| `UPSTREAM_BASE_URL` | ✓ | — | Gemini 网关,例如 `https://api.gemai.cc` |
| `UPSTREAM_API_KEY` | ✓ | — | 真实 API key |
| `AUTH_HMAC_SECRET` | ✓ | — | token 签名密钥,**至少 32 字节**(`openssl rand -hex 32`) |
| `AUTH_TOKEN_QUOTA` |  | `100` | 单 token 总调用次数 |
| `AUTH_TOKEN_TTL_SECS` |  | `3600` | token 有效期(秒) |
| `AUTH_ISSUE_ALLOWED_ORIGINS` |  | `*` | 允许签发 token 的 Origin 白名单 |
| `CORS_ALLOWED_ORIGINS` |  | `*` | 浏览器 CORS 白名单 |
| `RATE_LIMIT_PER_SECOND` |  | `2` | 每 IP 每秒令牌补充 |
| `RATE_LIMIT_BURST` |  | `10` | 每 IP 突发桶容量 |
| `MAX_BODY_BYTES` |  | `16777216` | 单次请求体上限(16MB) |
| `UPSTREAM_TIMEOUT_SECS` |  | `120` | 上游请求超时 |
| `METRICS_BIND` |  | `127.0.0.1:9898` | metrics 端点,空字符串关闭 |
| `RUST_LOG` |  | `info` | 日志级别 |

---

## Prometheus 监控

`/metrics` 暴露的指标:

| 指标 | 类型 | 标签 | 说明 |
|---|---|---|---|
| `proxy_requests_total` | counter | `path`, `status` | 反代请求数 |
| `proxy_upstream_duration_seconds` | histogram | `path` | 上游往返耗时(秒) |
| `proxy_in_flight_requests` | gauge | — | 当前在飞请求数 |
| `proxy_rate_limited_total` | counter | — | 被 governor 拦截的请求数 |
| `auth_token_issued_total` | counter | — | 签发的 token 数 |
| `auth_token_rejected_total` | counter | `reason` | 鉴权失败 |

接入 Prometheus(同机部署):
```yaml
scrape_configs:
  - job_name: 'hologrip-proxy'
    static_configs:
      - targets: ['127.0.0.1:9898']
```

跨机抓取请用 SSH 隧道:
```bash
ssh -L 9898:127.0.0.1:9898 root@your-server
# 浏览器访问 http://localhost:9898/metrics
```

---

## 重新部署

更新前端:本地 `npm run build` → SFTP 同步 `dist/*` → 浏览器 Ctrl-F5。HTML 不缓存,部署立即生效。

更新 Rust 服务(假设用了 git):

```bash
ssh root@your-server
cd /opt/hologrip-source
git pull
cd server
cargo build --release
sudo systemctl restart hologrip-proxy
```

服务重启时旧 token 全部作废,前端会自动重新签发,用户无感。

---

## 调试 / FAQ

**Q:启动报 `AUTH_HMAC_SECRET 长度不足 32 字节`**
A:`openssl rand -hex 32` 重新生成。

**Q:浏览器调用返回 401 `token 与请求 IP 不匹配`**
A:Nginx 没透传 `X-Forwarded-For`。检查 Nginx 配置里有 `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`(第 7 步那段已包含)。

**Q:返回 429**
A:可能是限流(`tower_governor`)或 token quota 耗尽。看 metrics 里 `auth_token_rejected_total{reason="quota_exhausted"}`,前端会自动重签;如果是 governor 拦的,看日志或调高 `RATE_LIMIT_*`。

**Q:返回 502**
A:上游 `api.gemai.cc` 网络不通或超时。`journalctl -u hologrip-proxy` 找 `上游请求失败` 错误明细。

**Q:`cargo build` 在服务器上 OOM 被 kill**
A:看上面 "小内存服务器避免 OOM" 一节,加 swap 或 `-j 1`。

**Q:`cargo build` 卡在下载依赖**
A:换国内 crates 镜像,看上面 "国内服务器加速" 一节。

**Q:为什么不放在 src-tauri 里**
A:`src-tauri` 是桌面端 Rust 壳,跟用户电脑的 WebView 绑定,不监听网络端口。本反代是独立服务进程,跑在服务器上,职责完全不同。
