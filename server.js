const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");
const dotenv = require("dotenv");
const sqlite3 = require("sqlite3").verbose();
const { open } = require("sqlite");
const crypto = require("crypto");

// 加载环境变量
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "default_password";
const PATH_SECRET = process.env.PATH_SECRET || "secret";
const DB_PATH = process.env.DB_PATH || "./data/cookie_share.db";

// 确保数据目录存在
const dbDir = path.dirname(DB_PATH);
const fs = require("fs");
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// 加密函数
function encryptData(data) {
  const algorithm = "aes-256-cbc";
  const key = crypto
    .createHash("sha256")
    .update(ADMIN_PASSWORD)
    .digest("base64")
    .substr(0, 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(data, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

// 解密函数
function decryptData(encryptedData) {
  const algorithm = "aes-256-cbc";
  const key = crypto
    .createHash("sha256")
    .update(ADMIN_PASSWORD)
    .digest("base64")
    .substr(0, 32);
  const parts = encryptedData.split(":");
  const iv = Buffer.from(parts[0], "hex");
  const encryptedText = parts[1];
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  let decrypted = decipher.update(encryptedText, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// 初始化数据库连接
let db;
async function initDatabase() {
  db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database,
  });

  // 创建表
  await db.exec(`
    CREATE TABLE IF NOT EXISTS cookies (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      cookie_data TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log("SQLite database initialized at", DB_PATH);
}

// 中间件
app.use(bodyParser.json());
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-Admin-Password"],
  })
);

// 校验函数
function verifyAdminPassword(req, res, next) {
  const adminPassword = req.headers["x-admin-password"];
  if (adminPassword !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
  next();
}

function isValidId(id) {
  return /^[a-zA-Z0-9]+$/.test(id);
}

// 数据操作函数 - 使用SQLite替代文件系统
const COOKIE_STORE = {
  async put(key, value) {
    const data = JSON.parse(value);
    const { url, cookies } = data;
    const cookieData = JSON.stringify(cookies);
    // 加密cookie数据
    const encryptedCookieData = encryptData(cookieData);

    try {
      await db.run(
        `INSERT INTO cookies (id, url, cookie_data, updated_at) 
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(id) DO UPDATE SET 
         url = ?, cookie_data = ?, updated_at = CURRENT_TIMESTAMP`,
        [key, url, encryptedCookieData, url, encryptedCookieData]
      );
      return true;
    } catch (error) {
      console.error("Error storing cookie:", error);
      throw error;
    }
  },

  async get(key) {
    try {
      const row = await db.get(
        "SELECT id, url, cookie_data FROM cookies WHERE id = ?",
        key
      );
      if (!row) return null;

      // 解密cookie数据
      const decryptedCookieData = decryptData(row.cookie_data);

      return JSON.stringify({
        id: row.id,
        url: row.url,
        cookies: JSON.parse(decryptedCookieData),
      });
    } catch (error) {
      console.error(`Error retrieving cookie for key ${key}:`, error);
      throw error;
    }
  },

  async delete(key) {
    try {
      await db.run("DELETE FROM cookies WHERE id = ?", key);
      return true;
    } catch (error) {
      console.error(`Error deleting cookie for key ${key}:`, error);
      throw error;
    }
  },

  async list() {
    try {
      const rows = await db.all("SELECT id, url FROM cookies");
      return {
        keys: rows.map((row) => ({ name: row.id })),
      };
    } catch (error) {
      console.error("Error listing cookies:", error);
      return { keys: [] };
    }
  },
};

// 路由
app.post(`/${PATH_SECRET}/send-cookies`, async (req, res) => {
  try {
    const { id, url, cookies } = req.body;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID. Only letters and numbers are allowed.",
      });
    }

    // 验证 cookies 格式
    if (
      !Array.isArray(cookies) ||
      !cookies.every(
        (cookie) =>
          cookie.name &&
          cookie.value &&
          cookie.domain &&
          typeof cookie.httpOnly === "boolean" &&
          typeof cookie.secure === "boolean" &&
          cookie.sameSite
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid cookie format",
      });
    }

    // 处理 URL 格式：如果不是完整的 URL，则添加 https:// 前缀
    const processedUrl = url.includes("://") ? url : `https://${url}`;

    // 预处理cookies，确保域名不带点前缀
    const processedCookies = cookies.map((cookie) => {
      // 如果域名以点开头，去掉点
      const domain = cookie.domain.startsWith(".")
        ? cookie.domain.slice(1)
        : cookie.domain;
      return {
        domain: domain,
        expirationDate: cookie.expirationDate,
        hostOnly: true,
        httpOnly: cookie.httpOnly,
        name: cookie.name,
        path: cookie.path || "/",
        sameSite: cookie.sameSite.toLowerCase(),
        secure: cookie.secure,
        session: cookie.session || false,
        storeId: null,
        value: cookie.value,
      };
    });

    // 存储数据
    await COOKIE_STORE.put(
      id,
      JSON.stringify({
        id,
        url: processedUrl,
        cookies: processedCookies,
      })
    );

    res.status(200).json({
      success: true,
      message: "Cookies saved successfully",
    });
  } catch (error) {
    console.error("Error in send-cookies:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get(`/${PATH_SECRET}/receive-cookies/:cookieId`, async (req, res) => {
  try {
    const { cookieId } = req.params;

    if (!isValidId(cookieId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid cookie ID",
      });
    }

    const data = await COOKIE_STORE.get(cookieId);
    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Cookies not found",
      });
    }

    const { cookies } = JSON.parse(data);
    res.status(200).json({
      success: true,
      cookies: cookies.map((cookie) => ({
        domain: cookie.domain,
        expirationDate: cookie.expirationDate,
        hostOnly: cookie.hostOnly,
        httpOnly: cookie.httpOnly,
        name: cookie.name,
        path: cookie.path || "/",
        sameSite: cookie.sameSite,
        secure: cookie.secure,
        session: false,
        storeId: null,
        value: cookie.value,
      })),
    });
  } catch (error) {
    console.error("Error in receive-cookies:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 管理员路由
app.get(`/${PATH_SECRET}/admin`, (req, res) => {
  const htmlContent = `
  <!DOCTYPE html>
  <html lang="zh">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Cookie 管理器</title>
    <style>
      body {
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        background: url('https://picsum.photos/1920/1080?blur=5') no-repeat center center fixed;
        background-size: cover;
        margin: 10px;
        padding: 0;
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
      }
      .container {
        background: rgba(255, 255, 255, 0.7);
        backdrop-filter: blur(10px);
        border-radius: 12px;
        padding: 2rem;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
        width: 90%;
        max-width: 800px;
      }
      h1, h2 {
        color: #0078D4;
      }
      input, textarea, button {
        width: 100%;
        padding: 0.5rem;
        margin-bottom: 1rem;
        border: 1px solid #ccc;
        border-radius: 4px;
      }
      button {
        background-color: #0078D4;
        color: white;
        border: none;
        cursor: pointer;
        transition: background-color 0.3s;
      }
      button:hover {
        background-color: #005a9e;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th, td {
        border: 1px solid #ddd;
        padding: 0.5rem;
        text-align: left;
      }
      th {
        background-color: #f2f2f2;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>Cookie 管理器</h1>
      
      <!-- 添加管理员密码输入和保存按钮 -->
      <div>
        <h2>管理员密码</h2>
        <input type="password" id="adminPassword" placeholder="输入管理员密码">
        <button id="savePassword">保存密码</button>
      </div>
      
      <!-- 创建 Cookie -->
      <div id="cookieManagement" style="display: none;">
        <h2>创建 Cookie</h2>
        <form id="createForm">
          <input type="text" id="createId" placeholder="ID" required>
          <input type="url" id="createUrl" placeholder="URL" required>
          <textarea id="createCookies" placeholder="Cookies (JSON 格式)" rows="3" required></textarea>
          <button type="submit">创建</button>
        </form>
      </div>
  
      <!-- 列出 Cookies -->
      <div id="cookieList" style="display: none;">
        <h2>已存储的 Cookies</h2>
        <button id="refreshList">刷新列表</button>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>URL</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody id="cookieListBody">
            <!-- 动态内容 -->
          </tbody>
        </table>
      </div>
  
      <!-- 更新 Cookie -->
      <div id="updateCookie" style="display: none;">
        <h2>更新 Cookie</h2>
        <form id="updateForm">
          <input type="text" id="updateId" placeholder="ID" required>
          <input type="text" id="updateUrl" placeholder="URL">
          <textarea id="updateCookies" placeholder="Cookies (JSON 格式)" rows="3" required></textarea>
          <button type="submit">更新</button>
        </form>
      </div>
  
      <!-- 删除 Cookie -->
      <div id="deleteCookie" style="display: none;">
        <h2>删除 Cookie</h2>
        <form id="deleteForm">
          <input type="text" id="deleteId" placeholder="ID" required>
          <button type="submit">删除</button>
        </form>
      </div>
    </div>
  
    <script>
      const API_BASE = '/${PATH_SECRET}';
      let adminPassword = '';
  
      document.addEventListener('DOMContentLoaded', () => {
        // 从本地存储中获取保存的密码
        adminPassword = localStorage.getItem('adminPassword') || '';
        if (adminPassword) {
          document.getElementById('adminPassword').value = adminPassword;
          showCookieManagement();
        }
  
        document.getElementById('savePassword').addEventListener('click', saveAdminPassword);
        document.getElementById('createForm').addEventListener('submit', createCookie);
        document.getElementById('updateForm').addEventListener('submit', updateCookie);
        document.getElementById('deleteForm').addEventListener('submit', deleteCookie);
        document.getElementById('refreshList').addEventListener('click', loadCookies);
      });
  
      function saveAdminPassword() {
        const password = document.getElementById('adminPassword').value;
        if (password) {
          localStorage.setItem('adminPassword', password);
          adminPassword = password;
          showCookieManagement();
          loadCookies();
          alert('管理员密码已保存');
        } else {
          alert('请输入有效的管理员密码');
        }
      }
  
      function showCookieManagement() {
        document.getElementById('cookieManagement').style.display = 'block';
        document.getElementById('cookieList').style.display = 'block';
        document.getElementById('updateCookie').style.display = 'block';
        document.getElementById('deleteCookie').style.display = 'block';
        loadCookies();
      }
  
      async function loadCookies() {
        const response = await fetch(API_BASE + '/admin/list-cookies', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'X-Admin-Password': adminPassword
          }
        });
  
        if (response.ok) {
          const data = await response.json();
          const list = data.cookies;
          const tbody = document.getElementById('cookieListBody');
          tbody.innerHTML = '';
  
          list.forEach(cookie => {
            const tr = document.createElement('tr');
            tr.innerHTML = \`
              <td>\${cookie.id}</td>
              <td>\${new URL(cookie.url).hostname}</td>
              <td>
                <button onclick="deleteCookieById('\${cookie.id}')">删除</button>
              </td>
            \`;
            tbody.appendChild(tr);
          });
        } else {
          alert('无法加载 Cookies 列表，请检查管理员密码是否正确');
        }
      }
  
      async function createCookie(event) {
        event.preventDefault();
        const id = document.getElementById('createId').value;
        const url = document.getElementById('createUrl').value;
        let cookies;
        try {
          cookies = JSON.parse(document.getElementById('createCookies').value);
        } catch {
          alert('Cookies 必须是有效的 JSON');
          return;
        }
  
        const response = await fetch(API_BASE + '/send-cookies', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'X-Admin-Password': adminPassword
          },
          body: JSON.stringify({ id, url, cookies })
        });
  
        const result = await response.json();
        alert(result.message);
        if (response.ok) {
          loadCookies();
          document.getElementById('createForm').reset();
        }
      }
  
      async function updateCookie(event) {
        event.preventDefault();
        const key = document.getElementById('updateId').value;
        const url = document.getElementById('updateUrl').value;
        let value;
        try {
          value = JSON.parse(document.getElementById('updateCookies').value);
        } catch {
          alert('Cookies 必须是有效的 JSON');
          return;
        }
  
        const response = await fetch(API_BASE + '/admin/update', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'X-Admin-Password': adminPassword },
          body: JSON.stringify({ key, value, url })
        });
  
        const result = await response.json();
        alert(result.message);
        if (response.ok) {
          loadCookies();
          document.getElementById('updateForm').reset();
        }
      }
  
      async function deleteCookie(event) {
        event.preventDefault();
        const key = document.getElementById('deleteId').value;
  
        const response = await fetch(API_BASE + '/admin/delete?key='+encodeURIComponent(key), {
          method: 'DELETE',
          headers: { 
            'Content-Type': 'application/json', 
            'X-Admin-Password': adminPassword 
          }
        });
  
        const result = await response.json();
        alert(result.message);
        if (response.ok) {
          loadCookies();
          document.getElementById('deleteForm').reset();
        }
      }
  
      async function deleteCookieById(id) {
        if (!confirm('确定要删除 ID 为'+id+' 的 Cookie 吗？')) return;
  
        const response = await fetch(API_BASE + '/admin/delete?key='+encodeURIComponent(id), {
          method: 'DELETE',
          headers: { 
            'Content-Type': 'application/json', 
            'X-Admin-Password': adminPassword 
          }
        });
  
        const result = await response.json();
        alert(result.message);
        if (response.ok) {
          loadCookies();
        }
      }
    </script>
  </body>
  </html>
  `;
  res.status(200).send(htmlContent);
});

app.get(
  `/${PATH_SECRET}/admin/list-cookies`,
  verifyAdminPassword,
  async (req, res) => {
    try {
      const list = await COOKIE_STORE.list();
      const cookies = await Promise.all(
        list.keys.map(async (key) => {
          const data = await COOKIE_STORE.get(key.name);
          if (data) {
            try {
              const { id, url } = JSON.parse(data);
              return { id, url };
            } catch (e) {
              console.error(`Error parsing data for key ${key.name}:`, e);
              return null;
            }
          }
          return null;
        })
      );

      const filteredCookies = cookies.filter((cookie) => cookie !== null);
      res.status(200).json({ success: true, cookies: filteredCookies });
    } catch (error) {
      console.error("Error in list-cookies:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

app.get(
  `/${PATH_SECRET}/admin/list-cookies-by-host/:host`,
  verifyAdminPassword,
  async (req, res) => {
    try {
      const { host } = req.params;

      // 直接从数据库查询特定主机名的cookies
      const rows = await db.all(
        `SELECT id, url FROM cookies WHERE url LIKE ? OR url LIKE ?`,
        [`%://${host}/%`, `%://${host}`]
      );

      const cookies = rows.map((row) => ({ id: row.id, url: row.url }));
      res.status(200).json({ success: true, cookies });
    } catch (error) {
      console.error("Error in list-cookies-by-host:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

app.delete(
  `/${PATH_SECRET}/admin/delete`,
  verifyAdminPassword,
  async (req, res) => {
    try {
      const key = req.query.key;

      if (!isValidId(key)) {
        return res.status(400).json({
          success: false,
          message: "Invalid key. Only letters and numbers are allowed.",
        });
      }

      await COOKIE_STORE.delete(key);
      res.status(200).json({
        success: true,
        message: "Data deleted successfully",
      });
    } catch (error) {
      console.error("Error in delete:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

app.put(
  `/${PATH_SECRET}/admin/update`,
  verifyAdminPassword,
  async (req, res) => {
    try {
      const { key, value, url } = req.body;

      if (!isValidId(key)) {
        return res.status(400).json({
          success: false,
          message: "Invalid key. Only letters and numbers are allowed.",
        });
      }

      // 验证 cookies 格式
      if (
        !Array.isArray(value) ||
        !value.every(
          (cookie) =>
            cookie.name &&
            cookie.value &&
            cookie.domain &&
            typeof cookie.httpOnly === "boolean" &&
            typeof cookie.secure === "boolean" &&
            cookie.sameSite
        )
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid cookie format",
        });
      }

      // 检查记录是否存在
      const existingData = await COOKIE_STORE.get(key);
      if (!existingData) {
        return res.status(404).json({
          success: false,
          message: "Cookie not found",
        });
      }

      // 获取现有数据
      const data = JSON.parse(existingData);

      // 如果提供了新的 URL，则更新
      if (url) {
        // 处理 URL 格式：如果不是完整的 URL，则添加 https:// 前缀
        data.url = url.includes("://") ? url : `https://${url}`;
      }

      // 更新 cookies
      data.cookies = value.map((cookie) => {
        const domain = cookie.domain.startsWith(".")
          ? cookie.domain.slice(1)
          : cookie.domain;
        return {
          domain: domain,
          expirationDate: cookie.expirationDate,
          hostOnly: true,
          httpOnly: cookie.httpOnly,
          name: cookie.name,
          path: cookie.path || "/",
          sameSite: cookie.sameSite.toLowerCase(),
          secure: cookie.secure,
          session: cookie.session || false,
          storeId: null,
          value: cookie.value,
        };
      });

      // 保存更新后的数据
      await COOKIE_STORE.put(key, JSON.stringify(data));

      res.status(200).json({
        success: true,
        message: "Cookies and URL updated successfully",
      });
    } catch (error) {
      console.error("Error in update:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// 处理OPTIONS请求
app.options(`/${PATH_SECRET}/*`, (req, res) => {
  res.status(204).end();
});

// 处理404
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Not Found" });
});

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, error: err.message });
});

// 启动服务器
async function startServer() {
  try {
    await initDatabase();
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Admin URL: http://localhost:${PORT}/${PATH_SECRET}/admin`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
