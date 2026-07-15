# 标注平台

这个仓库只保留标注平台代码和必要的操作说明。

## 目录

- `annotation-platform/`：标注平台前后端代码

## 本地启动

先进入项目目录：

```bash
cd annotation-platform
```

安装依赖：

```bash
npm install
```

开发模式：

```bash
npm run dev:server
npm run dev -- --host 127.0.0.1 --port 5174
```

生产构建：

```bash
npm run build
```

## 服务启动

### Windows

```bat
cd annotation-platform
start.bat
```

停止：

```bat
cd annotation-platform
stop.bat
```

### Linux

首次建议先赋予执行权限：

```bash
cd annotation-platform
chmod +x start.sh stop.sh
```

启动：

```bash
cd annotation-platform
./start.sh
```

停止：

```bash
cd annotation-platform
./stop.sh
```

## 默认配置

- 默认地址：`http://127.0.0.1:3001`
- 默认管理员账号：`admin`
- 默认管理员密码：`Admin@123456`

可通过环境变量覆盖：

- `ANNOTATION_SERVER_HOST`
- `ANNOTATION_SERVER_PORT`
- `ANNOTATION_DB_PATH`
- `BOOTSTRAP_ADMIN_USERNAME`
- `BOOTSTRAP_ADMIN_PASSWORD`
- `BOOTSTRAP_ADMIN_DISPLAY_NAME`
- `SESSION_SECRET`

## 数据说明

- 运行期数据库、上传文件、导出数据都在 `annotation-platform/.data/`
- `.data/` 已加入忽略，不会提交到仓库
- 原始 PDF、原始 JSON、测试运行产物不应放进 Git
