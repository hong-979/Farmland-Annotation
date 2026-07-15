# 标注服务平台

这是一个可独立部署的报告标注平台，支持管理员上传 `JSON + PDF`、分发标注任务、查看标注历史，并导出结果 JSON。

当前版本已经支持：

- 管理员登录后创建标注员账号
- 管理员逐个上传文档包
- 管理员查看文档、任务状态、操作历史，并导出 JSON
- 标注员按“文件”领取任务，而不是逐条领取
- 标注员在同一份文件内完成多条审核点标注
- PDF 原文、任务列表、证据编辑、判断依据联动标注
- 前端构建产物由后端直接托管，可单独启动服务

## 技术栈

- 前端：React + Vite + TypeScript
- 后端：Express + TypeScript
- 数据库：SQLite

## 目录说明

- `src/`：前端页面与组件
- `server/`：后端接口与服务
- `tests/`：Vitest 测试
- `start.bat` / `stop.bat`：Windows 后台启停脚本
- `start.sh` / `stop.sh`：Linux 后台启停脚本

## 本地开发

先安装依赖：

```bash
npm install
```

开发模式：

```bash
npm run dev:server
npm run dev -- --host 127.0.0.1 --port 5174
```

开发模式下前端会把 `/api` 代理到本地后端。

## 构建

```bash
npm run build
```

构建完成后会生成：

- `dist/`：前端静态资源
- `dist-server/`：后端可执行产物

## 直接启动服务

### Windows

```bat
start.bat
```

停止：

```bat
stop.bat
```

也可以用 npm 脚本：

```bash
npm run service:start:windows
npm run service:stop:windows
```

### Linux

首次建议先赋予执行权限：

```bash
chmod +x start.sh stop.sh
```

启动：

```bash
./start.sh
```

停止：

```bash
./stop.sh
```

也可以用 npm 脚本：

```bash
npm run service:start:linux
npm run service:stop:linux
```

## 默认环境变量

服务默认读取以下环境变量：

- `ANNOTATION_SERVER_HOST`：监听地址，默认 `0.0.0.0`
- `ANNOTATION_SERVER_PORT`：监听端口，默认 `3001`
- `ANNOTATION_DB_PATH`：SQLite 数据库路径，默认 `./.data/annotation.sqlite`
- `BOOTSTRAP_ADMIN_USERNAME`：初始管理员用户名，默认 `admin`
- `BOOTSTRAP_ADMIN_PASSWORD`：初始管理员密码，默认 `Admin@123456`
- `BOOTSTRAP_ADMIN_DISPLAY_NAME`：初始管理员显示名，默认 `System Admin`
- `SESSION_SECRET`：会话签名密钥

Linux 示例：

```bash
export ANNOTATION_SERVER_HOST=0.0.0.0
export ANNOTATION_SERVER_PORT=3001
export SESSION_SECRET='replace-this-secret'
./start.sh
```

Windows 示例：

```bat
set ANNOTATION_SERVER_HOST=0.0.0.0
set ANNOTATION_SERVER_PORT=3001
set SESSION_SECRET=replace-this-secret
start.bat
```

## 局域网访问

服务监听在 `0.0.0.0` 时，其他设备可通过：

```text
http://你的局域网IP:3001
```

访问平台。

## 测试

运行全部测试：

```bash
npm test
```

当前仓库已通过：

- 全量单元/集成测试
- 生产构建

## GitHub 发布建议

这个仓库已经补齐了适合 GitHub 的基础整理：

- `.gitignore` 已忽略 `node_modules`、构建产物、SQLite 数据库、日志目录
- `.gitattributes` 已补齐跨平台换行策略
- 文档已补充 Linux / Windows 启动方式

如果要发布到 GitHub，建议按下面步骤执行：

```bash
git init
git add .
git commit -m "feat: prepare annotation platform for linux deployment"
git branch -M main
git remote add origin <你的 GitHub 仓库地址>
git push -u origin main
```

如果仓库已经初始化过，只需要：

```bash
git add .
git commit -m "feat: prepare annotation platform for linux deployment"
git push
```

## 部署建议

如果准备长期放到 Linux 服务器上运行，建议后续再补一层：

- `systemd` 服务文件
- Nginx 反向代理
- HTTPS
- 管理员密码与 `SESSION_SECRET` 外部化
- 定期备份 `ANNOTATION_DB_PATH` 指向的 SQLite 文件

当前版本已经足够在局域网或轻量 Linux 主机上直接运行。
