import { validateSession, hasPermission, PERMISSIONS } from './userManager.js';

/**
 * 从请求中提取会话ID
 */
function extractSessionId(req) {
  // 首先尝试从cookie中获取
  if (req.headers.cookie) {
    const cookies = req.headers.cookie.split(';').reduce((acc, cookie) => {
      const [key, value] = cookie.trim().split('=');
      acc[key] = value;
      return acc;
    }, {});
    
    if (cookies.sessionId) {
      return cookies.sessionId;
    }
  }
  
  // 然后尝试从Authorization header获取
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  
  // 最后尝试从查询参数获取
  return req.query.sessionId;
}

/**
 * 基础认证中间件
 * 将用户信息添加到req.user，但不强制要求认证
 */
export async function authMiddleware(req, res, next) {
  try {
    const sessionId = extractSessionId(req);
    
    if (sessionId) {
      const user = await validateSession(sessionId);
      if (user) {
        req.user = user;
        req.sessionId = sessionId;
      }
    }
    
    next();
  } catch (error) {
    console.error('认证中间件错误:', error);
    next();
  }
}

/**
 * 要求认证的中间件
 * 如果用户未认证，返回401错误
 */
export function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      error: '需要登录',
      code: 'AUTHENTICATION_REQUIRED'
    });
  }
  
  next();
}

/**
 * 要求特定权限的中间件
 */
export function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: '需要登录',
        code: 'AUTHENTICATION_REQUIRED'
      });
    }
    
    if (!hasPermission(req.user, permission)) {
      return res.status(403).json({
        error: '权限不足',
        code: 'INSUFFICIENT_PERMISSIONS',
        required: permission
      });
    }
    
    next();
  };
}

/**
 * 要求管理员权限的中间件
 */
export const requireAdmin = requirePermission(PERMISSIONS.ADMIN_PANEL);

/**
 * 要求用户管理权限的中间件
 */
export const requireUserManagement = requirePermission(PERMISSIONS.USER_MANAGEMENT);

/**
 * 要求设置访问权限的中间件
 */
export const requireSettingsAccess = requirePermission(PERMISSIONS.SETTINGS_ACCESS);

/**
 * API响应中间件 - 统一API响应格式
 */
export function apiResponse(req, res, next) {
  // 成功响应
  res.success = (data, message = '操作成功') => {
    res.json({
      success: true,
      message,
      data
    });
  };
  
  // 错误响应
  res.error = (message, code = 'UNKNOWN_ERROR', statusCode = 400) => {
    res.status(statusCode).json({
      success: false,
      error: message,
      code
    });
  };
  
  next();
}

/**
 * 检查是否为兼容模式（旧的密码系统）
 */
export function isLegacyMode() {
  const hasPassword = process.env.PASSWORD && process.env.PASSWORD.trim() !== '';
  const hasAdminPassword = process.env.ADMINPASSWORD && process.env.ADMINPASSWORD.trim() !== '';
  
  return hasPassword || hasAdminPassword;
}

/**
 * 兼容性中间件 - 处理旧的密码系统和新的用户系统
 */
export async function compatibilityMiddleware(req, res, next) {
  // 如果启用了旧的密码系统，则跳过多用户认证
  if (isLegacyMode()) {
    req.legacyMode = true;
    return next();
  }
  
  // 如果没有启用旧系统，则使用新的用户认证系统
  req.legacyMode = false;
  return authMiddleware(req, res, next);
}

/**
 * 内容访问控制中间件
 * 检查用户是否有权访问内容
 */
export function requireContentAccess(req, res, next) {
  // 兼容模式下的处理
  if (req.legacyMode) {
    // 如果设置了密码，则需要通过旧的验证系统
    return next();
  }
  
  // 新系统下的处理
  if (!req.user) {
    return res.status(401).json({
      error: '需要登录才能访问内容',
      code: 'AUTHENTICATION_REQUIRED'
    });
  }
  
  if (!hasPermission(req.user, PERMISSIONS.VIEW_CONTENT)) {
    return res.status(403).json({
      error: '没有权限访问此内容',
      code: 'INSUFFICIENT_PERMISSIONS'
    });
  }
  
  next();
}

/**
 * 设置访问控制中间件
 * 检查用户是否有权访问设置页面
 */
export function requireSettingsPageAccess(req, res, next) {
  // 兼容模式下的处理
  if (req.legacyMode) {
    // 如果设置了管理员密码，则通过旧的验证系统处理
    return next();
  }
  
  // 新系统下的处理
  if (!req.user) {
    return res.status(401).json({
      error: '需要登录才能访问设置',
      code: 'AUTHENTICATION_REQUIRED'
    });
  }
  
  if (!hasPermission(req.user, PERMISSIONS.SETTINGS_ACCESS)) {
    return res.status(403).json({
      error: '没有权限访问设置',
      code: 'INSUFFICIENT_PERMISSIONS'
    });
  }
  
  next();
}

/**
 * 错误处理中间件
 */
export function errorHandler(err, req, res, next) {
  console.error('API错误:', err);
  
  if (res.headersSent) {
    return next(err);
  }
  
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: '请求参数验证失败',
      code: 'VALIDATION_ERROR',
      details: err.message
    });
  }
  
  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({
      success: false,
      error: '认证失败',
      code: 'AUTHENTICATION_FAILED'
    });
  }
  
  res.status(500).json({
    success: false,
    error: '服务器内部错误',
    code: 'INTERNAL_SERVER_ERROR'
  });
}

/**
 * 速率限制中间件 - 简单的内存实现
 */
const requestCounts = new Map();

export function rateLimit(maxRequests = 100, windowMs = 15 * 60 * 1000) {
  return (req, res, next) => {
    const clientId = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    const windowStart = now - windowMs;
    
    // 清理过期的请求记录
    if (requestCounts.has(clientId)) {
      const requests = requestCounts.get(clientId).filter(time => time > windowStart);
      requestCounts.set(clientId, requests);
    }
    
    // 获取当前客户端的请求次数
    const requests = requestCounts.get(clientId) || [];
    
    if (requests.length >= maxRequests) {
      return res.status(429).json({
        error: '请求过于频繁，请稍后再试',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }
    
    // 记录当前请求
    requests.push(now);
    requestCounts.set(clientId, requests);
    
    next();
  };
}

/**
 * CORS中间件增强
 */
export function corsEnhanced(req, res, next) {
  const origin = req.headers.origin;
  const allowedOrigins = process.env.ALLOWED_ORIGINS ? 
    process.env.ALLOWED_ORIGINS.split(',') : ['*'];
  
  if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
}