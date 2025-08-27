import path from 'path';
import express from 'express';
import axios from 'axios';
import cors from 'cors';
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'crypto';
import dotenv from 'dotenv';
import session from 'express-session';
import authRoutes from './api/auth.js';
import { 
  authMiddleware, 
  compatibilityMiddleware, 
  corsEnhanced, 
  isLegacyMode 
} from './lib/authMiddleware.js';
import { 
  initializeDefaultAdmin, 
  cleanupExpiredSessions 
} from './lib/userManager.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = {
  port: process.env.PORT || 8080,
  password: process.env.PASSWORD || '',
  adminpassword: process.env.ADMINPASSWORD || '',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  timeout: parseInt(process.env.REQUEST_TIMEOUT || '5000'),
  maxRetries: parseInt(process.env.MAX_RETRIES || '2'),
  cacheMaxAge: process.env.CACHE_MAX_AGE || '1d',
  userAgent: process.env.USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  debug: process.env.DEBUG === 'true'
};

const log = (...args) => {
  if (config.debug) {
    console.log('[DEBUG]', ...args);
  }
};

const app = express();

// 增强的CORS支持
app.use(corsEnhanced);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Session配置
app.use(session({
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24小时
  }
}));

// 兼容性中间件 - 处理新旧系统共存
app.use(compatibilityMiddleware);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

function sha256Hash(input) {
  return new Promise((resolve) => {
    const hash = crypto.createHash('sha256');
    hash.update(input);
    resolve(hash.digest('hex'));
  });
}

async function renderPage(filePath, password, req) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // 注入系统配置
  content = content.replace('{{MULTI_USER_ENABLED}}', !isLegacyMode());
  content = content.replace('{{LEGACY_MODE}}', isLegacyMode());
  
  // 注入用户信息
  if (req && req.user) {
    content = content.replace('{{CURRENT_USER}}', JSON.stringify(req.user));
  } else {
    content = content.replace('{{CURRENT_USER}}', 'null');
  }
  
  // 兼容旧的密码系统
  if (password !== '') {
    const sha256 = await sha256Hash(password);
    content = content.replace('{{PASSWORD}}', sha256);
  } else {
    content = content.replace('{{PASSWORD}}', '');
  }
  
  // 添加ADMINPASSWORD注入
  if (config.adminpassword !== '') {
      const adminSha256 = await sha256Hash(config.adminpassword);
      content = content.replace('{{ADMINPASSWORD}}', adminSha256);
  } else {
      content = content.replace('{{ADMINPASSWORD}}', '');
  }
  
  return content;
}

app.get(['/', '/index.html', '/player.html'], async (req, res) => {
  try {
    let filePath;
    switch (req.path) {
      case '/player.html':
        filePath = path.join(__dirname, 'player.html');
        break;
      default: // '/' 和 '/index.html'
        filePath = path.join(__dirname, 'index.html');
        break;
    }
    
    const content = await renderPage(filePath, config.password, req);
    res.send(content);
  } catch (error) {
    console.error('页面渲染错误:', error);
    res.status(500).send('读取静态页面失败');
  }
});

app.get('/s=:keyword', async (req, res) => {
  try {
    const filePath = path.join(__dirname, 'index.html');
    const content = await renderPage(filePath, config.password, req);
    res.send(content);
  } catch (error) {
    console.error('搜索页面渲染错误:', error);
    res.status(500).send('读取静态页面失败');
  }
});

// API路由
app.use('/api/auth', authRoutes);

function isValidUrl(urlString) {
  try {
    const parsed = new URL(urlString);
    const allowedProtocols = ['http:', 'https:'];
    
    // 从环境变量获取阻止的主机名列表
    const blockedHostnames = (process.env.BLOCKED_HOSTS || 'localhost,127.0.0.1,0.0.0.0,::1').split(',');
    
    // 从环境变量获取阻止的 IP 前缀
    const blockedPrefixes = (process.env.BLOCKED_IP_PREFIXES || '192.168.,10.,172.').split(',');
    
    if (!allowedProtocols.includes(parsed.protocol)) return false;
    if (blockedHostnames.includes(parsed.hostname)) return false;
    
    for (const prefix of blockedPrefixes) {
      if (parsed.hostname.startsWith(prefix)) return false;
    }
    
    return true;
  } catch {
    return false;
  }
}

// 修复反向代理处理过的路径
app.use('/proxy', (req, res, next) => {
  const targetUrl = req.url.replace(/^\//, '').replace(/(https?:)\/([^/])/, '$1//$2');
  req.url = '/' + encodeURIComponent(targetUrl);
  next();
});

// 代理路由
app.get('/proxy/:encodedUrl', async (req, res) => {
  try {
    const encodedUrl = req.params.encodedUrl;
    const targetUrl = decodeURIComponent(encodedUrl);

    // 安全验证
    if (!isValidUrl(targetUrl)) {
      return res.status(400).send('无效的 URL');
    }

    log(`代理请求: ${targetUrl}`);

    // 添加请求超时和重试逻辑
    const maxRetries = config.maxRetries;
    let retries = 0;
    
    const makeRequest = async () => {
      try {
        return await axios({
          method: 'get',
          url: targetUrl,
          responseType: 'stream',
          timeout: config.timeout,
          headers: {
            'User-Agent': config.userAgent
          }
        });
      } catch (error) {
        if (retries < maxRetries) {
          retries++;
          log(`重试请求 (${retries}/${maxRetries}): ${targetUrl}`);
          return makeRequest();
        }
        throw error;
      }
    };

    const response = await makeRequest();

    // 转发响应头（过滤敏感头）
    const headers = { ...response.headers };
    const sensitiveHeaders = (
      process.env.FILTERED_HEADERS || 
      'content-security-policy,cookie,set-cookie,x-frame-options,access-control-allow-origin'
    ).split(',');
    
    sensitiveHeaders.forEach(header => delete headers[header]);
    res.set(headers);

    // 管道传输响应流
    response.data.pipe(res);
  } catch (error) {
    console.error('代理请求错误:', error.message);
    if (error.response) {
      res.status(error.response.status || 500);
      error.response.data.pipe(res);
    } else {
      res.status(500).send(`请求失败: ${error.message}`);
    }
  }
});

app.use(express.static(path.join(__dirname), {
  maxAge: config.cacheMaxAge
}));

app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).send('服务器内部错误');
});

app.use((req, res) => {
  res.status(404).send('页面未找到');
});

// 初始化系统
async function initializeSystem() {
  try {
    // 如果没有启用旧的密码系统，则初始化多用户系统
    if (!isLegacyMode()) {
      await initializeDefaultAdmin();
      console.log('多用户系统已启用');
    } else {
      console.log('兼容模式已启用（使用旧的密码系统）');
    }
    
    // 定期清理过期会话
    setInterval(cleanupExpiredSessions, 60 * 60 * 1000); // 每小时清理一次
  } catch (error) {
    console.error('系统初始化错误:', error);
  }
}

// 启动服务器
app.listen(config.port, async () => {
  console.log(`服务器运行在 http://localhost:${config.port}`);
  
  if (isLegacyMode()) {
    if (config.password !== '') {
      console.log('用户登录密码已设置');
    }
    if (config.adminpassword !== '') {
      console.log('管理员登录密码已设置');
    }
  }
  
  if (config.debug) {
    console.log('调试模式已启用');
    console.log('配置:', { 
      ...config, 
      password: config.password ? '******' : '', 
      adminpassword: config.adminpassword ? '******' : '',
      multiUserEnabled: !isLegacyMode()
    });
  }
  
  // 初始化系统
  await initializeSystem();
});
