# Pascal Editor 开发环境指南

## 快速启动

### 正确的启动方式（Windows）

```powershell
# 方式 1：使用 turbo 直接启动（推荐）
npx turbo run dev --env-mode=loose

# 方式 2：只启动 editor 应用
cd apps/editor
npm run dev
```

### 错误的启动方式

```powershell
# ❌ 不要使用根目录的 npm run dev（Windows 不兼容）
npm run dev
# 原因：根目录脚本使用 bash 语法 set -a，Windows 无法执行

# ❌ 不要使用 Git Bash 的 set -a
set -a && . ./.env 2>/dev/null; set +a; turbo run dev --env-mode=loose
# 原因：set -a 是 bash 特有语法，PowerShell 不支持
```

### 端口配置

- **Editor 应用**：端口 `3002`（在 `apps/editor/package.json` 中配置）
- **API 服务**：端口 `3001`（如存在）
- **默认 Next.js**：端口 `3000`（本项目未使用）

启动时会自动加载 `.env.local` 文件中的环境变量。

---

## 端口占用检查

### 检查端口是否被占用

```powershell
# 检查 3002 端口（Editor 应用）
netstat -ano | findstr :3002

# 检查 3000 端口
netstat -ano | findstr :3000

# 检查 3001 端口
netstat -ano | findstr :3001

# 检查所有 Node.js 进程
tasklist | findstr node
```

### 解除端口占用

```powershell
# 方法 1：根据 PID 结束进程（推荐）
# 先用 netstat 找到 PID，然后：
taskkill /F /PID <PID号>

# 方法 2：结束所有 node.exe 进程（谨慎使用）
taskkill /F /IM node.exe

# 方法 3：使用 PowerShell
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
```

### 常见占用场景

| 端口 | 常见占用原因 | 解决方案 |
|------|-------------|---------|
| 3002 | 上次 dev server 未正常退出 | `taskkill /F /IM node.exe` |
| 3002 | 多个终端同时运行 dev | 关闭多余的终端 |
| 3000 | 其他 Next.js 项目 | 找到并结束对应进程 |

---

## 常见问题排查

### 1. 启动时报 "Port 3002 already in use"

```powershell
# 检查谁占用了端口
netstat -ano | findstr :3002

# 结束占用进程（替换为实际 PID）
taskkill /F /PID 12345
```

### 2. 启动后页面 500 错误

**原因**：Jest worker 崩溃或编译错误

```powershell
# 完全重启
taskkill /F /IM node.exe
npx turbo run dev --env-mode=loose
```

### 3. Windows 下 "set -a" 报错

```powershell
# 错误信息：'set -a' 不是内部或外部命令
# 解决：不要使用根目录的 npm run dev，改用：
npx turbo run dev --env-mode=loose
```

### 4. Playwright 导出时报错

```powershell
# 确保 dev server 正在运行
# 检查 http://localhost:3002 是否可访问
curl http://localhost:3002

# 如果不可访问，重启 dev server
taskkill /F /IM node.exe
npx turbo run dev --env-mode=loose
```

### 5. 场景加载失败（500 on /scene/）

**原因**：内存不足或 Jest worker 冲突

```powershell
# 完全清理后重启
taskkill /F /IM node.exe
# 等待 5 秒
npx turbo run dev --env-mode=loose
```

---

## 开发工作流

### 日常开发

```powershell
# 1. 启动开发服务器
npx turbo run dev --env-mode=loose

# 2. 在浏览器访问
# http://localhost:3002

# 3. 修改代码后自动热重载
```

### 运行 Playwright 导出脚本

```powershell
# 确保 dev server 正在运行
# 然后在另一个终端执行：
node codex/batch-export-obj.mjs <scene-id>

# 例如：
node codex/batch-export-obj.mjs 6277f322fd6f
```

### 停止开发服务器

```powershell
# 方法 1：在 dev server 终端按 Ctrl+C

# 方法 2：强制结束
taskkill /F /IM node.exe
```

---

## 环境变量

项目使用 `.env.local` 文件存储敏感配置。启动时会自动加载。

关键环境变量：
- `NEXT_PUBLIC_SUPABASE_URL`：Supabase 服务地址
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`：Supabase 匿名密钥
- `BETTER_AUTH_SECRET`：认证密钥

如需修改环境变量，编辑项目根目录的 `.env.local` 文件。

---

## 故障速查表

| 症状 | 原因 | 解决 |
|------|------|------|
| `set -a` 报错 | 使用了根目录 npm run dev | 改用 `npx turbo run dev --env-mode=loose` |
| 端口 3002 被占用 | 上次未正常退出 | `taskkill /F /IM node.exe` |
| 页面 500 错误 | Jest worker 崩溃 | 重启 dev server |
| 场景加载失败 | 内存不足 | 重启 dev server |
| Playwright 超时 | dev server 未运行 | 启动 dev server |
| 编译错误 | 代码语法问题 | 检查终端输出的错误信息 |

---

## 相关文件

- `apps/editor/package.json` — Editor 应用配置（端口 3002）
- `package.json` — 根目录脚本（Windows 不兼容）
- `.env.local` — 环境变量配置
- `turbo.json` — Turborepo 任务配置
