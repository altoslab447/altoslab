# 龍蝦（OpenClaw）微信小程序整合規格

> **目標**：付費用戶在官網完成訂閱後，掃一次 QR 碼即可將自己的微信帳號綁定到平台，之後每次打開小程序就能直接與自己專屬 VPS 上的龍蝦互動。工程師照此文件可獨立完成全端實作。

---

## 目錄

1. [WeChat 帳號申請需求](#1-wechat-帳號申請需求)
2. [核心架構總覽](#2-核心架構總覽)
3. [用戶綁定流程（最關鍵）](#3-用戶綁定流程最關鍵)
4. [資料庫 Schema](#4-資料庫-schema)
5. [後端 API 規格](#5-後端-api-規格)
6. [VPS 路由層](#6-vps-路由層)
7. [小程序頁面結構](#7-小程序頁面結構)
8. [存取控制狀態機](#8-存取控制狀態機)
9. [串流與長任務處理](#9-串流與長任務處理)
10. [Tech Stack 建議](#10-tech-stack-建議)
11. [安全設計](#11-安全設計)
12. [實作順序](#12-實作順序)

---

## 1. WeChat 帳號申請需求

### 1.1 需要哪些帳號

| 平台 | 網址 | 用途 | 必要性 |
|------|------|------|--------|
| 微信公眾平台 | mp.weixin.qq.com | 小程序主帳號，取得 AppID/AppSecret | **必要** |
| 微信開放平台 | open.weixin.qq.com | 綁定小程序取得 UnionID（跨渠道同一用戶識別） | 建議（若官網也有微信登入則必要）|

**AppID** 格式：`wx` + 16 個十六進制字符，例如 `wx1234567890abcdef`。
**AppSecret**：32 字符，等同主密碼，**只存後端，絕不放入小程序包**。

### 1.2 access_token 管理

所有微信 API 呼叫都需要 `access_token`：

```
GET https://api.weixin.qq.com/cgi-bin/token
  ?grant_type=client_credential
  &appid=APPID
  &secret=APPSECRET
```

返回：`{ "access_token": "...", "expires_in": 7200 }`

**規則**：
- 有效期 7200 秒（2 小時）。
- 微信每日呼叫此 API 有配額上限（約 2000 次）。**必須快取**，不能每次請求都重新拿。
- 用 Redis 存：`SET wx:access_token <token> EX 7100`（提前 100 秒過期，留重新取得的緩衝）。

### 1.3 域名白名單

在公眾平台 → 開發 → 開發設置 → 服務器域名 中設定。生產環境**強制 HTTPS/WSS**，不接受 IP，不接受 HTTP。

| 類型 | 填入值 | 用途 |
|------|--------|------|
| request 域名 | `https://api.openclaw.io` | 所有 `wx.request()` HTTP 呼叫 |
| socket 域名 | `wss://ws.openclaw.io` | `wx.connectSocket()` 串流 |
| uploadFile 域名 | `https://api.openclaw.io` | 未來附件上傳 |

**ICP 備案**：所有域名必須完成工信部備案才能在正式版使用。開發/體驗版可勾選「不校驗合法域名」跳過此限制（僅限測試）。

### 1.4 測試版 vs 正式版

| 差異點 | 開發/體驗版 | 正式版 |
|--------|------------|--------|
| 域名白名單 | 可關閉校驗 | 強制 |
| ICP 備案 | 不需要 | 必要 |
| `getUnlimitedQRCode` API | 需小程序至少是「體驗版」 | 正常 |
| 用戶人數 | 體驗版最多 15 人 | 無限制 |
| 審核 | 不需要 | 每次發布都需要審核（1-7 工作天）|

---

## 2. 核心架構總覽

```
用戶（微信手機）
     │
     │  WSS: wss://ws.openclaw.io/ws/chat
     │  HTTPS: https://api.openclaw.io/api/*
     ▼
┌─────────────────────────────────────────┐
│          Nginx（TLS 終止）               │
│  api.openclaw.io → :8080                │
│  ws.openclaw.io/ws/* → :8080/ws/*       │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│     控制平面 API Server（Go）            │
│  - 用戶身份驗證（wechat_session_token） │
│  - openid ↔ user_id ↔ VPS 路由查表     │
│  - WebSocket 雙向代理到用戶 VPS         │
│  - 綁定流程 API                         │
└──────┬──────────────────────────────────┘
       │           │
       │     ┌─────▼──────┐
       │     │ PostgreSQL │
       │     │ Redis      │
       │     └────────────┘
       │
       │  ws://<private-ip>:<port>/ws/agent
       │  Header: X-VPS-Token: <per-vps-token>
       │
┌──────▼──────────────────────────────────┐
│  用戶專屬 VPS（每位付費用戶獨立一台）    │
│  - OpenClaw Gateway（接受來自控制平面）  │
│  - LLM API（用戶自己的 key 或平台 key） │
│  IP 永不暴露給用戶端                     │
└─────────────────────────────────────────┘
```

---

## 3. 用戶綁定流程（最關鍵）

付費用戶從「官網已登入狀態」到「小程序可以使用」只需要兩個步驟：**在官網生成 QR → 用微信掃碼**。

### 3.1 完整流程（含後端細節）

```
官網（已登入）           控制平面後端             微信 API             小程序
    │                       │                        │                   │
    │ 點「綁定微信小程序」   │                        │                   │
    │──POST /generate-bind-qr►                        │                   │
    │                       │ 生成 29 字元隨機 token  │                   │
    │                       │ 存入 bind_tokens 表     │                   │
    │                       │ (TTL 5 分鐘)            │                   │
    │                       │                         │                   │
    │                       │ POST wxacode.getunlimit │                   │
    │                       │ scene="bt=<token>"      │                   │
    │                       │──────────────────────►  │                   │
    │                       │◄──────────────────────  │                   │
    │                       │      PNG 圖片 bytes      │                   │
    │◄──────────────────────│                         │                   │
    │  { qr_image_base64,   │                         │                   │
    │    bind_token,        │                         │                   │
    │    expires_in: 300 }  │                         │                   │
    │                       │                         │                   │
    │ 顯示 QR Modal         │                         │                   │
    │ 開始 polling bind-status                        │                   │
    │                       │                         │                   │
    │                       │                         │ 用戶掃碼           │
    │                       │                         │ 小程序在 bind page 開啟
    │                       │                         │                   │
    │                       │                         │ wx.login() → code │
    │                       │                         │◄──────────────────│
    │                       │                         │──────────────────►│
    │                       │                         │                   │
    │                       │◄──POST /wechat/bind──────────────────────────│
    │                       │  { code, bind_token }   │                   │
    │                       │                         │                   │
    │                       │ jscode2session(code)    │                   │
    │                       │──────────────────────►  │                   │
    │                       │◄──────────────────────  │                   │
    │                       │   { openid }            │                   │
    │                       │                         │                   │
    │                       │ DB: INSERT wechat_bindings
    │                       │     openid → user_id    │                   │
    │                       │ DB: mark bind_token used│                   │
    │                       │ DB: issue wechat_session│                   │
    │                       │──────────────────────────────────────────►  │
    │                       │          { session_token, user }            │
    │                       │                         │                   │
    │ GET /bind-status?token │                         │ 儲存 session_token│
    │──────────────────────►│                         │ 導向 pages/chat   │
    │◄──────────────────────│                         │                   │
    │  { status: completed } │                         │                   │
    │                       │                         │                   │
    │ 顯示「綁定成功！」    │                         │                   │
    │ 關閉 Modal            │                         │                   │
```

### 3.2 scene 參數格式

`wxacode.getunlimited` 的 `scene` 最大 **32 字符**。

格式：`bt=` (3 chars) + 29 位英數字隨機 token = 32 chars。

小程序 `onLoad` 接收時：
```typescript
onLoad(options: { scene?: string }) {
  const scene = decodeURIComponent(options.scene || '');
  // scene = "bt=A3k9mP2xQ..."
  const bindToken = scene.startsWith('bt=') ? scene.slice(3) : null;
}
```

### 3.3 Edge Cases

| 情境 | 處理方式 |
|------|----------|
| 同一個 QR 被掃兩次 | 第二次：token status = 'used' → 返回 `{ error: "already_bound" }`，小程序顯示「已完成綁定，請直接使用」|
| 用戶重新生成 QR | 先將該 user_id 所有 pending 的 bind_tokens 標記為 expired，再生成新的 |
| 用戶想換微信帳號綁定 | 允許 re-bind：更新 wechat_bindings row，記錄 rebind_count++ |
| 不同用戶掃了別人的 QR | bind_token 綁定 user_id，scan 的人的 openid 會被連結到 QR 擁有者的帳號 → **綁定頁應顯示帳號姓名讓用戶確認** |
| token 5 分鐘過期 | 小程序顯示「QR 碼已過期，請返回官網重新生成」，附官網連結 |

### 3.4 官網 polling 綁定狀態

官網每 3 秒呼叫一次：

```
GET /api/wechat/bind-status?token=<bind_token>
Authorization: Bearer <website_session>

Response:
{ "status": "pending" | "completed" | "expired" }
```

收到 `completed` 後重新讀取用戶資料，顯示綁定成功。5 分鐘後停止 polling（顯示逾時提示）。

---

## 4. 資料庫 Schema

PostgreSQL 16，全部使用 UUID 主鍵。

```sql
-- 付費用戶（由官網驗證系統管理）
CREATE TABLE users (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email                   TEXT NOT NULL UNIQUE,
    password_hash           TEXT NOT NULL,
    display_name            TEXT,
    subscription_status     TEXT NOT NULL DEFAULT 'none'
                            CHECK (subscription_status IN ('none', 'active', 'expired', 'cancelled')),
    subscription_plan       TEXT,                    -- 'monthly', 'annual'
    subscription_expires_at TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 微信身份與用戶帳號的綁定關係
-- 一個 user_id 只能有一個 openid（UNIQUE），一個 openid 只能綁一個帳號（UNIQUE）
CREATE TABLE wechat_bindings (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    openid        TEXT NOT NULL UNIQUE,
    unionid       TEXT,                              -- 若啟用開放平台則有值
    -- session_key 不長期儲存，僅在解密用戶資料時短暫使用後捨棄
    bound_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ,
    rebind_count  INT NOT NULL DEFAULT 0
);
CREATE INDEX idx_wechat_bindings_openid ON wechat_bindings(openid);

-- 每位用戶的專屬 VPS 實例
CREATE TABLE vps_instances (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id              UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    host                 TEXT NOT NULL,              -- 內網 hostname/IP，絕不回傳給客戶端
    port                 INT NOT NULL DEFAULT 8080,
    api_token            TEXT NOT NULL,              -- per-VPS bearer token，定期 rotate
    status               TEXT NOT NULL DEFAULT 'provisioning'
                         CHECK (status IN ('provisioning', 'ready', 'degraded', 'stopped', 'error')),
    last_health_check_at TIMESTAMPTZ,
    last_healthy_at      TIMESTAMPTZ,
    openclaw_version     TEXT,
    provisioned_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 官網→小程序綁定的臨時 token（5 分鐘 TTL）
CREATE TABLE bind_tokens (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token      TEXT NOT NULL UNIQUE,                 -- 29 位英數字
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status     TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'used', 'expired')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '5 minutes',
    used_at    TIMESTAMPTZ
);
CREATE INDEX idx_bind_tokens_token ON bind_tokens(token);
CREATE INDEX idx_bind_tokens_user_id ON bind_tokens(user_id);

-- 小程序登入後持有的 session（opaque bearer token）
CREATE TABLE wechat_sessions (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    openid         TEXT NOT NULL,
    session_token  TEXT NOT NULL UNIQUE,             -- 存入 wx.setStorageSync
    expires_at     TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at   TIMESTAMPTZ
);
CREATE INDEX idx_wechat_sessions_token ON wechat_sessions(session_token);

-- 聊天會話容器
CREATE TABLE chat_sessions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title       TEXT,                                -- 由第一則消息自動生成
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_archived BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX idx_chat_sessions_user_id ON chat_sessions(user_id);

-- 每一則消息
CREATE TABLE messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id),
    role            TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content         TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'complete'
                    CHECK (status IN ('streaming', 'complete', 'error')),
    tokens_used     INT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_messages_chat_session_id ON messages(chat_session_id);
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);
```

**注意**：
- `vps_instances.host` 存內網私有 IP 或 hostname，任何 API response struct 都必須用 `json:"-"` 隱藏此欄位。
- `session_key`（來自 `jscode2session`）**不儲存**。需解密手機號時用完即棄。
- 需要一支 background job 每分鐘將 `expires_at < NOW()` 的 bind_tokens 標記為 `expired`。

---

## 5. 後端 API 規格

### `POST /api/wechat/generate-bind-qr`

官網（已登入用戶）呼叫，生成綁定 QR。

```
Headers:
  Authorization: Bearer <website_session_token>

Response 200:
{
  "qr_image_base64": "data:image/png;base64,iVBORw0KGgo...",
  "bind_token": "a7f3k2p9mXY...",   // 29 字元，供官網 polling 用
  "expires_in": 300
}

Response 402: { "error": "subscription_required" }
Response 429: { "error": "rate_limited", "retry_after": 60 }
```

**後端邏輯**：
1. 驗證 website session → 取得 user_id。
2. 確認 `users.subscription_status = 'active'`，否則返回 402。
3. 將該 user_id 所有 `pending` 的 bind_tokens 標為 `expired`。
4. 生成 29 位隨機 token，插入 `bind_tokens`。
5. 從 Redis 取得（或刷新）微信 `access_token`。
6. 呼叫 `POST https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=...`：
   ```json
   {
     "scene": "bt=<29-char-token>",
     "page": "pages/bind/index",
     "width": 280,
     "is_hyaline": true
   }
   ```
7. 接收 PNG bytes → base64 → 返回給官網。

---

### `POST /api/wechat/login`

小程序每次啟動時呼叫，用 wx.login() 的 code 換取 session。

```
Request:
{ "code": "wx_login_code" }

Response 200（已綁定且訂閱有效）:
{
  "session_token": "opaque_token_abc123",
  "user": {
    "id": "uuid",
    "display_name": "王小明",
    "subscription_status": "active",
    "subscription_expires_at": "2026-12-31T00:00:00Z",
    "vps_status": "ready"   // "provisioning" | "ready" | "degraded" | "error"
  }
}

Response 200（openid 未綁定）:
{
  "session_token": null,
  "auth_state": "unbound"
}

Response 200（訂閱過期）:
{
  "session_token": "...",
  "auth_state": "subscription_expired",
  "user": { ... }
}
```

**後端邏輯**：
1. 呼叫 `GET https://api.weixin.qq.com/sns/jscode2session?appid=...&secret=...&js_code=<code>&grant_type=authorization_code`
2. 取得 `openid`（穩定識別符）與 `session_key`（不儲存）。
3. 查 `wechat_bindings` by openid → 找到 user_id → 查 subscription。
4. 發行 `wechat_sessions` record（或刷新已存在的）。
5. 不返回 openid 或 session_key 給客戶端。

---

### `POST /api/wechat/bind`

小程序 bind page 呼叫，完成 openid ↔ user_id 綁定。

```
Request:
{
  "code": "wx_login_code",
  "bind_token": "a7f3k2p9mXY..."
}

Response 200:
{
  "session_token": "opaque_token_abc123",
  "user": { ... }
}

Response 400: { "error": "invalid_bind_token" }
Response 410: { "error": "bind_token_expired" }
Response 409: { "error": "openid_already_bound", "message": "此微信已綁定其他帳號" }
```

**後端邏輯**（需 DB transaction）：
1. 原子性查詢：`SELECT * FROM bind_tokens WHERE token = $1 AND status = 'pending' AND expires_at > NOW() FOR UPDATE`。找不到則 400/410。
2. jscode2session(code) → openid。
3. 檢查 openid 是否已綁定到不同 user_id → 409。
4. Upsert `wechat_bindings`。
5. `UPDATE bind_tokens SET status='used', used_at=NOW()`。
6. 發行 `wechat_sessions`，返回 session_token。

---

### `GET /api/user/me`

```
Headers: Authorization: Bearer <wechat_session_token>

Response 200:
{
  "user_id": "uuid",
  "display_name": "王小明",
  "subscription_status": "active",
  "subscription_expires_at": "2026-12-31T00:00:00Z",
  "vps": {
    "status": "ready",
    "openclaw_version": "1.2.3",
    "last_healthy_at": "2026-03-10T10:00:00Z"
    // host/port 永不出現在 response
  }
}
```

---

### `WebSocket: wss://ws.openclaw.io/ws/chat`

主要即時通道。驗證方式：query string `?token=<wechat_session_token>`（wx.connectSocket 不支援可靠的自訂 header）。

**Client → Server 訊息**：
```json
// 發送聊天訊息
{ "type": "chat_message", "chat_session_id": "uuid-or-null", "content": "..." }

// 取消進行中的任務
{ "type": "cancel", "task_id": "uuid" }

// Keepalive
{ "type": "ping" }
```

**Server → Client 訊息**：
```json
// 新 session 建立
{ "type": "session_created", "chat_session_id": "uuid", "task_id": "uuid" }

// 串流 token
{ "type": "token", "task_id": "uuid", "delta": "好的" }

// 完成
{ "type": "done", "task_id": "uuid", "message_id": "uuid", "tokens_used": 142 }

// 錯誤（來自 VPS 或控制平面）
{ "type": "error", "code": "vps_unavailable" | "rate_limited" | "session_expired", "message": "..." }

// Pong
{ "type": "pong" }
```

---

### `GET /api/chat/sessions`

```
Headers: Authorization: Bearer <wechat_session_token>
Query: limit=20&offset=0

Response 200:
{
  "sessions": [
    { "id": "uuid", "title": "幫我寫行銷計劃", "updated_at": "...", "last_message_preview": "好的..." }
  ],
  "total": 42
}
```

---

### `GET /api/chat/sessions/:id/messages`

```
Headers: Authorization: Bearer <wechat_session_token>
Query: limit=50&before_id=<message_uuid>  // cursor pagination

Response 200:
{
  "messages": [
    { "id": "uuid", "role": "user", "content": "...", "created_at": "..." },
    { "id": "uuid", "role": "assistant", "content": "...", "created_at": "..." }
  ],
  "has_more": true
}
```

---

## 6. VPS 路由層

### 6.1 WebSocket 代理架構

```
小程序                     控制平面（Go goroutines）             用戶 VPS
  │                              │                                  │
  │ WSS /ws/chat?token=XXX       │                                  │
  │─────────────────────────────►│                                  │
  │                              │ 1. 驗證 session_token            │
  │                              │ 2. DB 查 user_id → vps.host/port │
  │                              │ 3. 確認 vps.status = 'ready'     │
  │                              │                                  │
  │                              │ WS ws://<host>:<port>/ws/agent   │
  │                              │ Header: X-VPS-Token: <api_token> │
  │                              │─────────────────────────────────►│
  │                              │◄─────────────────────────────────│
  │                              │         已連線                    │
  │                              │                                  │
  │  chat_message frame          │                                  │
  │─────────────────────────────►│─────────────────────────────────►│
  │                              │◄─────────────────────────────────│
  │◄─────────────────────────────│      token frame (streaming)     │
  │    ... (many frames)         │          ...                     │
  │◄─────────────────────────────│◄─────────────────────────────────│
  │      done frame              │         done frame               │
```

### 6.2 控制平面代理邏輯（Go pseudocode）

```go
func handleChatWS(w http.ResponseWriter, r *http.Request) {
    // 1. 驗證
    token := r.URL.Query().Get("token")
    session, err := db.GetWechatSession(token)
    if err != nil || session.ExpiresAt.Before(time.Now()) {
        conn.Close(websocket.CloseCode(4001), "unauthorized")
        return
    }

    // 2. 查找 VPS
    vps, err := db.GetVPSInstance(session.UserID)
    if err != nil || vps.Status != "ready" {
        conn.WriteJSON(ErrorMsg{Code: "vps_unavailable"})
        conn.Close(websocket.CloseNormalClosure, "")
        return
    }

    // 3. 連接到用戶 VPS（10 秒 timeout）
    vpsConn, _, err := dialer.DialContext(ctx,
        fmt.Sprintf("ws://%s:%d/ws/agent", vps.Host, vps.Port),
        http.Header{"X-VPS-Token": {vps.APIToken}, "X-User-ID": {session.UserID}},
    )
    if err != nil {
        conn.WriteJSON(ErrorMsg{Code: "vps_connection_failed"})
        return
    }
    defer vpsConn.Close()

    // 4. 雙向代理
    errCh := make(chan error, 2)
    go proxy(clientConn, vpsConn, errCh)  // client → vps
    go proxy(vpsConn, clientConn, errCh)  // vps → client
    <-errCh
}
```

### 6.3 Per-VPS Token

每台 VPS 有唯一的 `api_token`，儲存於 `vps_instances.api_token`（DB 加密）。OpenClaw bridge service 驗證每個入站 WebSocket 連接的 `X-VPS-Token` header。

**Token Rotation（每 30 天）**：
1. 後端生成新 token。
2. DB 更新 `vps_instances.api_token`。
3. 呼叫 VPS 管理 API：`POST http://<host>:9090/admin/rotate-token { "new_token": "..." }` （以獨立 mgmt secret 驗證）。
4. VPS 在 60 秒過渡期同時接受新舊 token。
5. 60 秒後 VPS 只接受新 token。

### 6.4 健康檢查

控制平面每 30 秒 background job：

```
GET http://<vps.host>:<vps.port>/health
Header: X-VPS-Token: <api_token>
Timeout: 5 秒

成功 → status = 'ready', last_healthy_at = now()
失敗且 last_healthy_at < now()-2min → status = 'degraded'
失敗且 last_healthy_at < now()-10min → status = 'error'，觸發告警
```

### 6.5 VPS 不可用時的 Fallback

| 時機 | 行為 |
|------|------|
| 連線時 VPS 掛了 | 返回 `{ type: "error", code: "vps_unavailable" }`，小程序顯示重試按鈕 |
| 任務進行中 VPS 斷線 | 發送 `{ type: "error", code: "vps_disconnected" }`，小程序顯示「重新連線」|
| VPS status = provisioning | 小程序顯示「龍蝦建立中，請稍候...」動態進度 |

---

## 7. 小程序頁面結構

### 7.1 技術選型

**使用原生 WXML + TypeScript**，不使用 Taro 或 uni-app。

原因：
- 小程序只有 5-6 頁，不需要 React 抽象層的複雜度。
- `wx.connectSocket()`、`wx.login()`、scene 參數等有微信特定的邊界行為，原生 code 更容易 debug。
- 避免 Taro 編譯層引入的奇怪 bug（尤其在 iOS WeChat 上）。

安裝類型定義：
```bash
npm install --save-dev miniprogram-api-typings
```

`tsconfig.json` 加入：
```json
{
  "compilerOptions": {
    "types": ["miniprogram-api-typings"],
    "noImplicitAny": true,
    "strictNullChecks": true
  }
}
```

### 7.2 目錄結構

```
miniprogram/
├── app.ts                    # App 生命週期，全域 session 初始化
├── app.json                  # 頁面列表、tabBar 設定
├── app.wxss                  # 全域樣式（字體、顏色變數）
├── project.config.json       # AppID、編譯設定
├── pages/
│   ├── index/                # 入口頁面（僅做 redirect，無 UI）
│   ├── chat/                 # 主聊天介面
│   ├── bind/                 # QR 掃碼進入的綁定頁
│   ├── settings/             # 設定（API Key、VPS 狀態、解除綁定）
│   └── subscribe/            # 未付費/訂閱過期的 paywall
├── components/
│   ├── chat-bubble/          # 訊息氣泡（user/assistant 兩種樣式）
│   ├── typing-indicator/     # 三點 loading 動畫
│   ├── chat-input/           # 多行輸入框 + 發送按鈕
│   └── vps-status-badge/     # 綠/黃/紅 VPS 狀態小圓點
└── utils/
    ├── api.ts                # wx.request 的 Promise 封裝，含 401/402 全域攔截
    ├── ws.ts                 # WebSocket 管理器（連線、重連、keepalive、消息隊列）
    ├── auth.ts               # session token 存取、login 流程
    ├── storage.ts            # 型別安全的 wx.setStorageSync 封裝
    └── constants.ts          # API_BASE_URL、WS_URL 等常數
```

### 7.3 各頁面說明

**`pages/index`**：無可見 UI（約 100ms 白畫面）。在 `onLoad` 執行 auth check：
```
wx.login() → POST /api/wechat/login →
  unbound → pages/subscribe?state=unbound
  subscription_expired → pages/subscribe?state=expired
  session_token + vps.status:provisioning → pages/chat?mode=provisioning
  session_token + vps.status:ready → pages/chat
```

**`pages/bind`**：接收 QR 掃碼的 `scene=bt=<token>`。流程：
1. 解析 scene 取得 bind_token。
2. 顯示「正在綁定您的帳號...」。
3. `wx.login()` → code。
4. `POST /api/wechat/bind`。
5. 成功：顯示「綁定成功！」→ 2 秒後導向 pages/chat。
6. 失敗：顯示對應錯誤（過期/已用/已綁其他帳號）。

**`pages/chat`**：
- 頂部：「龍蝦 AI」標題 + VPS 狀態徽章 + 設定圖示。
- 中間：`<scroll-view>` 訊息列表，`scroll-into-view` 指向最新訊息。
- 底部：固定 `chat-input` 元件。
- Streaming 時：顯示 `typing-indicator` 作為假的 assistant bubble，收到 token 時逐字附加到 `streamingContent`。

**`pages/subscribe`**：
- `state=unbound`：「請先至官網購買方案，再掃碼綁定」+ 「前往官網」按鈕。
- `state=expired`：「您的訂閱已到期」+ 「前往續訂」按鈕。

**`pages/settings`**：
- 帳號資訊（名稱、到期日）。
- VPS 狀態（含手動 refresh 按鈕）。
- API Key 設定（若採用用戶自帶 key 模式）。
- 清除聊天記錄按鈕。
- 解除綁定按鈕（含二次確認）。

---

## 8. 存取控制狀態機

```
小程序啟動
     │
     ▼
 wx.login() → code
     │
     ▼
POST /api/wechat/login
     │
     ├─[網路錯誤]──────────────────► 「網路連線失敗」重試畫面
     │
     ├─[auth_state: "unbound"]──────► pages/subscribe?state=unbound
     │                                「請至官網購買並綁定」
     │
     ├─[auth_state: "sub_expired"]──► pages/subscribe?state=expired
     │                                「訂閱已到期」
     │
     └─[session_token 返回]
              │
              ├─[vps: "provisioning"]─► pages/chat（顯示建立中橫幅）
              │
              ├─[vps: "error"]────────► pages/chat（顯示錯誤橫幅 + 客服連結）
              │
              └─[vps: "ready"]────────► pages/chat（完整聊天介面）
```

### Session 存取

```typescript
// utils/storage.ts
const SESSION_KEY = 'wechat_session_token';

export const getToken = (): string | null =>
    wx.getStorageSync(SESSION_KEY) || null;

export const saveToken = (token: string) =>
    wx.setStorageSync(SESSION_KEY, token);

export const clearToken = () =>
    wx.removeStorageSync(SESSION_KEY);
```

小程序 storage 在 App 關閉後持久存在，重裝或清除資料後才會消失。每次啟動都呼叫 `/api/wechat/login` 重新驗證（同時刷新 `last_used_at`）。

### 全域錯誤攔截

```typescript
// utils/api.ts
async function request<T>(opts: WxRequestOption): Promise<T> {
    const token = getToken();
    const res = await wxRequestPromise<T>({
        ...opts,
        header: { Authorization: `Bearer ${token}`, ...opts.header }
    });

    if (res.statusCode === 401) {
        clearToken();
        wx.redirectTo({ url: '/pages/index/index' });
        throw new AuthError('session_expired');
    }
    if (res.statusCode === 402) {
        wx.redirectTo({ url: '/pages/subscribe/index?state=expired' });
        throw new AuthError('subscription_required');
    }
    return res.data;
}
```

---

## 9. 串流與長任務處理

### 9.1 WebSocket Manager（`utils/ws.ts`）

```typescript
class WSManager {
    private socket: WechatMiniprogram.SocketTask | null = null;
    private messageQueue: string[] = [];
    private reconnectAttempts = 0;
    private pingTimer: ReturnType<typeof setInterval> | null = null;
    private handlers: Map<string, ((msg: any) => void)[]> = new Map();

    connect(sessionToken: string): void {
        this.socket = wx.connectSocket({
            url: `${WS_URL}/ws/chat?token=${sessionToken}`,
        });

        this.socket.onOpen(() => {
            this.reconnectAttempts = 0;
            this.flushQueue();
            // Keepalive：微信代理約 30 秒無資料會斷線
            this.pingTimer = setInterval(() => this.send({ type: 'ping' }), 25000);
        });

        this.socket.onMessage(({ data }) => {
            const msg = JSON.parse(data as string);
            (this.handlers.get(msg.type) || []).forEach(fn => fn(msg));
        });

        this.socket.onClose(() => this.reconnect(sessionToken));
        this.socket.onError(() => this.reconnect(sessionToken));
    }

    private reconnect(token: string): void {
        if (this.pingTimer) clearInterval(this.pingTimer);
        this.socket = null;
        // Exponential backoff: 1s, 2s, 4s, 8s, 最大 30s
        const delay = Math.min(1000 * (2 ** this.reconnectAttempts), 30000);
        this.reconnectAttempts++;
        setTimeout(() => this.connect(token), delay);
    }

    send(msg: object): void {
        const str = JSON.stringify(msg);
        if (this.socket) {
            this.socket.send({ data: str });
        } else {
            this.messageQueue.push(str); // 連線中暫存
        }
    }

    on(type: string, handler: (msg: any) => void): void {
        if (!this.handlers.has(type)) this.handlers.set(type, []);
        this.handlers.get(type)!.push(handler);
    }

    private flushQueue(): void {
        while (this.messageQueue.length > 0 && this.socket) {
            this.socket.send({ data: this.messageQueue.shift()! });
        }
    }
}

export const wsManager = new WSManager();
```

### 9.2 聊天頁 Streaming 渲染

```typescript
// pages/chat/index.ts（關鍵邏輯）
Page({
    data: {
        messages: [] as Message[],
        isStreaming: false,
        streamingContent: '',
        currentTaskId: null as string | null,
        elapsedSeconds: 0,
    },

    onLoad() {
        wsManager.on('token', ({ task_id, delta }) => {
            if (task_id !== this.data.currentTaskId) return;
            this.setData({ streamingContent: this.data.streamingContent + delta });
        });

        wsManager.on('done', ({ task_id, message_id }) => {
            const msg = { id: message_id, role: 'assistant', content: this.data.streamingContent };
            this.setData({
                messages: [...this.data.messages, msg],
                isStreaming: false,
                streamingContent: '',
                currentTaskId: null,
            });
            clearInterval(this.elapsedTimer);
        });

        wsManager.on('error', ({ code }) => {
            this.setData({ isStreaming: false });
            // 顯示對應錯誤 toast
        });
    },

    onSend(content: string) {
        if (this.data.isStreaming) return;
        const taskId = randomUUID();
        this.setData({ isStreaming: true, currentTaskId: taskId, elapsedSeconds: 0 });

        // 超過 5 秒無 token 則顯示進度計時
        this.elapsedTimer = setInterval(() => {
            this.setData({ elapsedSeconds: this.data.elapsedSeconds + 1 });
        }, 1000);

        wsManager.send({ type: 'chat_message', content, task_id: taskId });
    },
});
```

### 9.3 長任務 UX（30 秒以上）

| 情況 | UI 表現 |
|------|---------|
| 0-5 秒無回應 | 僅顯示 typing indicator |
| 5 秒後仍無 token | 顯示「🦞 龍蝦正在思考中... (12秒)」計時 |
| 用戶想取消 | 顯示「取消」按鈕，點擊後發送 `{ type: "cancel", task_id: "..." }` |
| Mini program 背景暫停 | iOS WeChat 可能暫停 JS。`onShow` 時檢查 WS 狀態，斷線則重連並呼叫 `/api/chat/sessions/:id/messages` 取得最新訊息 |

### 9.4 WeChat WebSocket 限制

- 最多同時 **5 個** WebSocket 連線（聊天頁只需 1 個，不是問題）。
- 微信代理約 **30 秒**無資料會關閉連線 → 25 秒 ping 解決。
- iOS WeChat 比 Android 更積極地在背景暫停 JS → 測試兩個平台。

---

## 10. Tech Stack 建議

### 小程序

| 層 | 選型 | 說明 |
|----|------|------|
| 框架 | 原生 WXML + TypeScript | 無抽象層，完整 wx.* API 存取 |
| 型別 | `miniprogram-api-typings` | 全套 wx.* IDE 補全 |
| 樣式 | WXSS + CSS custom properties | 原生，無需 CSS-in-JS |
| 建構工具 | WeChat DevTools 原生 npm | 處理 TS 編譯，無需 webpack |

### 控制平面後端

| 層 | 選型 | 說明 |
|----|------|------|
| 語言 | **Go 1.22+** | goroutine 模型完美匹配 WebSocket 代理的並發需求 |
| HTTP 框架 | `gin-gonic/gin` | 成熟，middleware 生態完整 |
| WebSocket | `gorilla/websocket` | Go 的事實標準 WS 庫 |
| DB 驅動 | `jackc/pgx/v5` | PostgreSQL 最佳 Go 驅動 |
| Cache | Redis 7 | access_token 快取、Rate limiting sliding window |
| Background jobs | `robfig/cron` | bind_token 過期清理、VPS 健康檢查、token rotation |
| Config | 環境變數 + `spf13/viper` | 12-factor app |

### 部署架構

```
Internet
    │
    ▼
Nginx（TLS）
api.openclaw.io  → Go :8080
ws.openclaw.io   → Go :8080/ws/*
    │
    ▼
Go 控制平面 binary
    │
    ├── PostgreSQL 16
    └── Redis 7
```

關鍵 Nginx 設定（WebSocket 升級）：
```nginx
location /ws/ {
    proxy_pass http://localhost:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header X-Real-IP $remote_addr;
    proxy_read_timeout 600s;   # 允許長任務（最長 10 分鐘）
    proxy_send_timeout 600s;
}
```

---

## 11. 安全設計

### VPS IP 永不外露

- `vps_instances` 的 `host`/`port` 欄位在所有 Go response struct 中標記 `json:"-"`。
- Integration test：斷言所有 API response 不包含 VPS 內網 IP 段（例如 `10.0.0.0/8`）。

### Per-VPS Token 保護

- DB 存儲時以 `pgcrypto` 或 application-layer AES-256-GCM 加密。
- 控制平面與 VPS 之間走內網 TLS，或以防火牆限制 VPS port 只開放給控制平面 IP。
- Log 只記錄 token 前 8 字元 + `...`，不記全文。
- 每 30 天 rotate，rotation 有 60 秒過渡期。

### Rate Limiting（Redis sliding window）

| 端點 / 動作 | 限制 |
|------------|------|
| `POST /generate-bind-qr` | 10 次/小時/用戶 |
| `POST /wechat/login` | 60 次/小時/openid |
| `POST /wechat/bind` | 10 次/小時/openid |
| WebSocket 訊息 | 30 則/分鐘/用戶 |
| 每日聊天訊息數 | 依方案設定（如 200 則/天）|

超限返回 `429` + `Retry-After` header。

### session_key 處理

微信 `jscode2session` 返回的 `session_key` 用於解密用戶敏感資料（如手機號）：
- **不儲存到 DB**。
- 需要時立即用、立即捨棄。
- **不記錄到 log**。
- **不返回給客戶端**。

### Bind Token CSRF 防護

Bind token 是一次性、有時效、與特定 user_id 綁定的隨機值，只有已驗證的官網 session 才能生成。消費時使用 PostgreSQL `SELECT ... FOR UPDATE` 確保原子性單次使用，無需額外 CSRF 防護。

### HTTPS/WSS 強制

- Nginx 層：所有 HTTP 301 跳轉到 HTTPS。
- TLS：Let's Encrypt 自動更新。
- 最低 TLS 版本：1.2（微信 Android 5/6 不支援 1.3）。
- 小程序端 wx.request / wx.connectSocket 在生產環境強制 HTTPS/WSS（微信 SDK 層面）。

---

## 12. 實作順序

| Phase | 工作 | 前置條件 |
|-------|------|---------|
| 1 | 申請公眾平台小程序帳號（企業資質）+ 開放平台 | - |
| 2 | 申請 ICP 備案（`api.openclaw.io`、`ws.openclaw.io`）| - |
| 3 | 建立控制平面 Go 專案骨架、PostgreSQL、Redis | - |
| 4 | 實作 DB Schema（Section 4 完整 DDL）| Phase 3 |
| 5 | 實作微信 access_token 快取服務（Redis TTL）| Phase 3 |
| 6 | 實作 `POST /api/wechat/generate-bind-qr`（含 QR 生成）| Phase 4, 5 |
| 7 | 實作 `POST /api/wechat/login`（jscode2session）| Phase 4, 5 |
| 8 | 實作 `POST /api/wechat/bind`（token 交換）| Phase 4, 5 |
| 9 | 官網加入「綁定微信小程序」按鈕、QR Modal、bind-status polling | Phase 6 |
| 10 | 建立小程序專案（WeChat DevTools），配置 AppID | Phase 1 |
| 11 | 實作小程序 `utils/`（api.ts、ws.ts、auth.ts、storage.ts）| Phase 7, 8, 10 |
| 12 | 實作 `pages/bind`（scene 解析、綁定 API 呼叫）| Phase 8, 11 |
| 13 | 實作 `pages/index`（auth redirect 邏輯）| Phase 7, 11 |
| 14 | 實作 VPS WebSocket 代理層（控制平面 proxy.go）| Phase 4 |
| 15 | 實作 `pages/chat`（訊息列表、streaming 渲染）| Phase 14, 11 |
| 16 | 實作 `pages/subscribe` + `pages/settings` | Phase 13 |
| 17 | 配置 Nginx（HTTPS/WSS），白名單域名，設定微信平台服務器域名 | Phase 2 |
| 18 | 端到端測試（綁定流程、串流聊天、VPS 掛掉、token 過期場景）| All above |
| 19 | 提交小程序審核 | Phase 18 |

---

*文件版本：v1.0 — 2026-03-10*
