# 标注平台

这个仓库只保留标注平台代码和启动说明。克隆下来后，直接在仓库根目录操作即可。

## 快速启动

先安装依赖：

```bash
npm install
```

### Windows

启动服务：

```bat
start.bat
```

停止服务：

```bat
stop.bat
```

### Linux

首次先赋予脚本执行权限：

```bash
chmod +x start.sh stop.sh
```

启动服务：

```bash
./start.sh
```

停止服务：

```bash
./stop.sh
```

`start.bat` 和 `start.sh` 会在缺少 `dist/` 时自动执行构建，然后启动服务。

## 访问与登录

- 默认地址：`http://127.0.0.1:3001`
- 默认管理员账号：`admin`
- 默认管理员密码：`Admin@123456`

## 开发模式

后端开发：

```bash
npm run dev:server
```

前端开发：

```bash
npm run dev -- --host 127.0.0.1 --port 5174
```

生产构建：

```bash
npm run build
```

## 可配置环境变量

- `ANNOTATION_SERVER_HOST`
- `ANNOTATION_SERVER_PORT`
- `ANNOTATION_DB_PATH`
- `BOOTSTRAP_ADMIN_USERNAME`
- `BOOTSTRAP_ADMIN_PASSWORD`
- `BOOTSTRAP_ADMIN_DISPLAY_NAME`
- `SESSION_SECRET`

## 数据目录

- 运行数据库、上传文件、导出结果都在 `.data/`
- `.data/` 已加入忽略，不会提交到仓库
- 原始 PDF、原始 JSON、日志文件、构建产物都不应提交到 Git
