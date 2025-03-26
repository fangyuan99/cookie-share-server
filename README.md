# Cookie share server

<a href="#cookie-share-服务器版本">简体中文</a>

This is a server for [cookie-share](https://github.com/fangyuan99/cookie-share). It is a simple server that can store and share cookies.

## Features

- Store and share cookies
- Admin interface for managing cookies
- Uses SQLite database
- Compatible with browser extensions
- Data encryption using AES-256-CBC with admin password as key

## Installation and Deployment

### Requirements

- Node.js 14.x or higher
- npm or yarn

### Steps

1. Clone or download the code to your server

```bash
git clone https://github.com/fangyuan99/cookie-share-server.git
cd cookie-share-server
```

2. Install dependencies

```bash
npm install
# or
yarn install
```

3. Configure environment variables

Copy the `.env.example` file to `.env` and modify the relevant configurations:

```bash
cp .env.example .env
```

Edit the `.env` file and set:

- `PORT`: Server port number, default is 3000
- `ADMIN_PASSWORD`: Set a strong password for accessing admin endpoints
- `PATH_SECRET`: Set a strong string to prevent brute force attacks
- `DATA_DIR`: Data storage directory, default is `./data`

4. Start the server

Development mode:

```bash
npm run dev
# or
yarn dev
```

Production mode:

```bash
npm start
# or
yarn start
```

You can use PM2 or other process managers to run the server persistently:

```bash
# Install PM2
npm install -g pm2

# Start the server
pm2 start server.js --name cookie-share
```

5. Configure nginx or other reverse proxy (optional)

If you need to access the service via HTTPS or configure a domain, you can use nginx as a reverse proxy:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

6. Access the admin interface

Visit `http://your-server-address:port/your-path-secret/admin`, for example: `http://localhost:3000/secret/admin`

## API Endpoints

- `POST /{PATH_SECRET}/send-cookies`: Store cookies associated with a unique ID
- `GET /{PATH_SECRET}/receive-cookies/{cookieId}`: Get cookies for a specific ID
- `GET /{PATH_SECRET}/admin`: Access the admin management page
- `GET /{PATH_SECRET}/admin/list-cookies`: List all stored cookie IDs and URLs
- `GET /{PATH_SECRET}/admin/list-cookies-by-host/{host}`: Filter and list cookies by hostname
- `DELETE /{PATH_SECRET}/admin/delete?key={key}`: Delete data for a given key
- `PUT /{PATH_SECRET}/admin/update`: Update data for a given key

## Security Considerations

- Ensure you set `ADMIN_PASSWORD` to a strong password and change it regularly
- Don't hardcode the `ADMIN_PASSWORD` in the code, always use environment variables
- Use HTTPS to protect data in transit
- Use the `PATH_SECRET` to prevent brute force attacks
- Cookie data is encrypted using AES-256-CBC algorithm with a key derived from your ADMIN_PASSWORD
- Even if the database is compromised, cookie contents cannot be read without the correct ADMIN_PASSWORD

## Data Encryption

All cookie data is now encrypted using the AES-256-CBC algorithm with the admin password as the encryption key. This provides an additional layer of security for sensitive cookie information.

Key implementation details:
- Added crypto module for encryption/decryption
- Created two helper functions:
  - `encryptData()`: Encrypts data using a key derived from ADMIN_PASSWORD
  - `decryptData()`: Decrypts data using the same key
- Modified COOKIE_STORE methods:
  - `put()`: Encrypts cookies before storage
  - `get()`: Decrypts cookies after retrieval

This ensures that even if the database is compromised, the cookie contents cannot be read without the correct ADMIN_PASSWORD. The encryption/decryption process happens automatically in the backend with no change to the user experience.

## Maintenance

Logs will be output to the console. You can use PM2 or other tools to collect and rotate logs:

```bash
# View logs
pm2 logs cookie-share

# Monitor application status
pm2 monit
```

## Configuring Browser Extensions

In your browser extension, configure the server address as:

```
http://your-server-address:port/{PATH_SECRET}
```

For example: `http://localhost:3000/secret` (note: do not add a trailing slash)

# Cookie Share 服务器版本

这是 [cookie-share](https://github.com/fangyuan99/cookie-share) 的自托管服务器版本，使用 Node.js 和 Express 开发，可以轻松部署到您自己的服务器上。

## 功能

- 存储和共享 cookies
- 管理员界面管理 cookies
- 使用 SQLite 数据库
- 与浏览器扩展兼容
- 使用管理员密码作为密钥的 AES-256-CBC 数据加密

## 安装和部署

### 必要条件

- Node.js 14.x 或更高版本
- npm 或 yarn

### 步骤

1. 克隆或下载代码到您的服务器

```bash
git clone https://github.com/fangyuan99/cookie-share-server.git
cd cookie-share-server
```

2. 安装依赖

```bash
npm install
# 或
yarn install
```

3. 配置环境变量

复制 `.env.example` 文件为 `.env`，并修改相关配置：

```bash
cp .env.example .env
```

编辑 `.env` 文件，设置：

- `PORT`: 服务器端口号，默认为 3000
- `ADMIN_PASSWORD`: 设置一个强密码，用于访问管理员端点
- `PATH_SECRET`: 设置一个强字符串，防止被暴力破解
- `DATA_DIR`: 数据存储目录，默认为 `./data`

4. 启动服务器

开发模式：

```bash
npm run dev
# 或
yarn dev
```

生产模式：

```bash
npm start
# 或
yarn start
```

可以使用 PM2 或其他进程管理器来持久化运行服务器：

```bash
# 安装 PM2
npm install -g pm2

# 启动服务器
pm2 start server.js --name cookie-share
```

5. 配置 nginx 或其他反向代理（可选）

如果您需要通过 HTTPS 访问服务，或者配置域名，可以使用 nginx 作为反向代理：

```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

6. 访问管理界面

访问 `http://your-server-address:port/your-path-secret/admin`，例如：`http://localhost:3000/secret/admin`

## API 接口

- `POST /{PATH_SECRET}/send-cookies`: 存储与唯一 ID 关联的 cookies
- `GET /{PATH_SECRET}/receive-cookies/{cookieId}`: 获取指定 ID 的 cookies
- `GET /{PATH_SECRET}/admin`: 访问管理员管理页面
- `GET /{PATH_SECRET}/admin/list-cookies`: 列出所有存储的 cookie ID 和 URL
- `GET /{PATH_SECRET}/admin/list-cookies-by-host/{host}`: 按主机名筛选并列出 cookies
- `DELETE /{PATH_SECRET}/admin/delete?key={key}`: 删除给定键的数据
- `PUT /{PATH_SECRET}/admin/update`: 更新给定键的数据

## 安全注意事项

- 确保将 `ADMIN_PASSWORD` 设置为一个强密码，并定期更改
- 不要在代码中硬编码 `ADMIN_PASSWORD`，始终使用环境变量
- 使用 HTTPS 保护传输过程中的数据
- 使用 `PATH_SECRET` 防止暴力破解攻击
- Cookie 数据使用 AES-256-CBC 算法加密，密钥由 ADMIN_PASSWORD 派生
- 即使数据库被泄露，没有正确的 ADMIN_PASSWORD 也无法读取 cookie 内容

## 数据加密

现在所有 cookie 数据已使用 AES-256-CBC 算法进行加密，加密密钥由管理员密码派生。这为敏感的 cookie 信息提供了额外的安全层。

主要实现细节：
- 添加了 crypto 模块用于加密/解密
- 创建了两个辅助函数：
  - `encryptData()`：使用 ADMIN_PASSWORD 派生的密钥加密数据
  - `decryptData()`：使用同样的密钥解密数据
- 修改了 COOKIE_STORE 的方法：
  - `put()`：存储 cookie 前先加密
  - `get()`：获取 cookie 后先解密

这样，即使数据库被泄露，没有正确的 ADMIN_PASSWORD 也无法读取 cookie 的内容。同时用户体验不会有任何变化，所有加密/解密过程都在后端自动完成。

## 维护

日志将会输出到控制台，您可以使用 PM2 或其他工具来收集和轮转日志：

```bash
# 查看日志
pm2 logs cookie-share

# 监控应用状态
pm2 monit
```

## 适配浏览器扩展

在浏览器扩展中，将服务器地址配置为：

```
http://your-server-address:port/{PATH_SECRET}
```

例如：`http://localhost:3000/secret`（注意不要在末尾添加斜杠） 