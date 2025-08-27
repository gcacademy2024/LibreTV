import fs from 'fs/promises';
import path from 'path';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USERS_FILE = path.join(__dirname, '..', 'data', 'users.json');
const SESSIONS_FILE = path.join(__dirname, '..', 'data', 'sessions.json');

// 用户角色定义
export const USER_ROLES = {
  ADMIN: 'admin',
  USER: 'user',
  VIEWER: 'viewer'
};

// 权限定义
export const PERMISSIONS = {
  VIEW_CONTENT: 'view_content',
  ADMIN_PANEL: 'admin_panel',
  USER_MANAGEMENT: 'user_management',
  SETTINGS_ACCESS: 'settings_access'
};

// 角色权限映射
const ROLE_PERMISSIONS = {
  [USER_ROLES.ADMIN]: [
    PERMISSIONS.VIEW_CONTENT,
    PERMISSIONS.ADMIN_PANEL,
    PERMISSIONS.USER_MANAGEMENT,
    PERMISSIONS.SETTINGS_ACCESS
  ],
  [USER_ROLES.USER]: [
    PERMISSIONS.VIEW_CONTENT,
    PERMISSIONS.SETTINGS_ACCESS
  ],
  [USER_ROLES.VIEWER]: [
    PERMISSIONS.VIEW_CONTENT
  ]
};

/**
 * 确保数据目录和文件存在
 */
async function ensureDataFiles() {
  const dataDir = path.dirname(USERS_FILE);
  
  try {
    await fs.access(dataDir);
  } catch {
    await fs.mkdir(dataDir, { recursive: true });
  }
  
  try {
    await fs.access(USERS_FILE);
  } catch {
    await fs.writeFile(USERS_FILE, JSON.stringify({
      users: {},
      nextId: 1
    }, null, 2));
  }
  
  try {
    await fs.access(SESSIONS_FILE);
  } catch {
    await fs.writeFile(SESSIONS_FILE, JSON.stringify({
      sessions: {}
    }, null, 2));
  }
}

/**
 * 读取用户数据
 */
async function readUsers() {
  await ensureDataFiles();
  const data = await fs.readFile(USERS_FILE, 'utf8');
  return JSON.parse(data);
}

/**
 * 写入用户数据
 */
async function writeUsers(userData) {
  await fs.writeFile(USERS_FILE, JSON.stringify(userData, null, 2));
}

/**
 * 读取会话数据
 */
async function readSessions() {
  await ensureDataFiles();
  const data = await fs.readFile(SESSIONS_FILE, 'utf8');
  return JSON.parse(data);
}

/**
 * 写入会话数据
 */
async function writeSessions(sessionData) {
  await fs.writeFile(SESSIONS_FILE, JSON.stringify(sessionData, null, 2));
}

/**
 * 创建新用户
 */
export async function createUser(username, password, email, role = USER_ROLES.USER) {
  if (!username || !password) {
    throw new Error('用户名和密码不能为空');
  }
  
  if (!Object.values(USER_ROLES).includes(role)) {
    throw new Error('无效的用户角色');
  }
  
  const userData = await readUsers();
  
  // 检查用户名是否已存在
  const existingUser = Object.values(userData.users).find(user => 
    user.username.toLowerCase() === username.toLowerCase()
  );
  
  if (existingUser) {
    throw new Error('用户名已存在');
  }
  
  // 检查邮箱是否已存在
  if (email) {
    const existingEmail = Object.values(userData.users).find(user => 
      user.email && user.email.toLowerCase() === email.toLowerCase()
    );
    
    if (existingEmail) {
      throw new Error('邮箱已被使用');
    }
  }
  
  // 加密密码
  const saltRounds = 12;
  const hashedPassword = await bcrypt.hash(password, saltRounds);
  
  // 创建用户
  const userId = userData.nextId++;
  const user = {
    id: userId,
    username,
    email: email || null,
    password: hashedPassword,
    role,
    createdAt: new Date().toISOString(),
    lastLogin: null,
    isActive: true
  };
  
  userData.users[userId] = user;
  await writeUsers(userData);
  
  // 返回用户信息（不包含密码）
  const { password: _, ...userInfo } = user;
  return userInfo;
}

/**
 * 验证用户登录
 */
export async function authenticateUser(username, password) {
  if (!username || !password) {
    throw new Error('用户名和密码不能为空');
  }
  
  const userData = await readUsers();
  
  // 查找用户
  const user = Object.values(userData.users).find(user => 
    user.username.toLowerCase() === username.toLowerCase() && user.isActive
  );
  
  if (!user) {
    throw new Error('用户名或密码错误');
  }
  
  // 验证密码
  const isValid = await bcrypt.compare(password, user.password);
  
  if (!isValid) {
    throw new Error('用户名或密码错误');
  }
  
  // 更新最后登录时间
  user.lastLogin = new Date().toISOString();
  userData.users[user.id] = user;
  await writeUsers(userData);
  
  // 返回用户信息（不包含密码）
  const { password: _, ...userInfo } = user;
  return userInfo;
}

/**
 * 创建用户会话
 */
export async function createSession(userId) {
  const sessionId = crypto.randomBytes(32).toString('hex');
  const sessionData = await readSessions();
  
  sessionData.sessions[sessionId] = {
    userId,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24小时过期
    isActive: true
  };
  
  await writeSessions(sessionData);
  return sessionId;
}

/**
 * 验证会话
 */
export async function validateSession(sessionId) {
  if (!sessionId) {
    return null;
  }
  
  const sessionData = await readSessions();
  const session = sessionData.sessions[sessionId];
  
  if (!session || !session.isActive) {
    return null;
  }
  
  // 检查是否过期
  if (new Date(session.expiresAt) < new Date()) {
    // 删除过期会话
    delete sessionData.sessions[sessionId];
    await writeSessions(sessionData);
    return null;
  }
  
  // 获取用户信息
  const userData = await readUsers();
  const user = userData.users[session.userId];
  
  if (!user || !user.isActive) {
    return null;
  }
  
  const { password: _, ...userInfo } = user;
  return userInfo;
}

/**
 * 销毁会话
 */
export async function destroySession(sessionId) {
  if (!sessionId) {
    return;
  }
  
  const sessionData = await readSessions();
  if (sessionData.sessions[sessionId]) {
    delete sessionData.sessions[sessionId];
    await writeSessions(sessionData);
  }
}

/**
 * 获取用户权限
 */
export function getUserPermissions(role) {
  return ROLE_PERMISSIONS[role] || [];
}

/**
 * 检查用户是否有特定权限
 */
export function hasPermission(user, permission) {
  const permissions = getUserPermissions(user.role);
  return permissions.includes(permission);
}

/**
 * 获取所有用户（管理员功能）
 */
export async function getAllUsers() {
  const userData = await readUsers();
  return Object.values(userData.users).map(user => {
    const { password: _, ...userInfo } = user;
    return userInfo;
  });
}

/**
 * 更新用户信息
 */
export async function updateUser(userId, updates) {
  const userData = await readUsers();
  const user = userData.users[userId];
  
  if (!user) {
    throw new Error('用户不存在');
  }
  
  // 只允许更新特定字段
  const allowedFields = ['email', 'role', 'isActive', 'password'];
  const filteredUpdates = {};
  
  for (const field of allowedFields) {
    if (field in updates) {
      filteredUpdates[field] = updates[field];
    }
  }
  
  // 验证角色
  if (filteredUpdates.role && !Object.values(USER_ROLES).includes(filteredUpdates.role)) {
    throw new Error('无效的用户角色');
  }
  
  // 检查邮箱唯一性
  if (filteredUpdates.email) {
    const existingEmail = Object.values(userData.users).find(u => 
      u.id !== userId && u.email && u.email.toLowerCase() === filteredUpdates.email.toLowerCase()
    );
    
    if (existingEmail) {
      throw new Error('邮箱已被使用');
    }
  }
  
  // 处理密码更新
  if (filteredUpdates.password) {
    const saltRounds = 12;
    filteredUpdates.password = await bcrypt.hash(filteredUpdates.password, saltRounds);
  }
  
  // 更新用户
  Object.assign(user, filteredUpdates);
  userData.users[userId] = user;
  await writeUsers(userData);
  
  const { password: _, ...userInfo } = user;
  return userInfo;
}

/**
 * 删除用户
 */
export async function deleteUser(userId) {
  const userData = await readUsers();
  
  if (!userData.users[userId]) {
    throw new Error('用户不存在');
  }
  
  delete userData.users[userId];
  await writeUsers(userData);
  
  // 删除用户的所有会话
  const sessionData = await readSessions();
  const sessionsToDelete = Object.keys(sessionData.sessions).filter(
    sessionId => sessionData.sessions[sessionId].userId === userId
  );
  
  sessionsToDelete.forEach(sessionId => {
    delete sessionData.sessions[sessionId];
  });
  
  await writeSessions(sessionData);
}

/**
 * 初始化默认管理员用户
 */
export async function initializeDefaultAdmin() {
  const userData = await readUsers();
  
  // 检查是否已有管理员用户
  const adminExists = Object.values(userData.users).some(user => 
    user.role === USER_ROLES.ADMIN
  );
  
  if (!adminExists) {
    // 从环境变量获取默认管理员密码，如果没有则生成随机密码
    const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD || crypto.randomBytes(16).toString('hex');
    
    await createUser('admin', adminPassword, null, USER_ROLES.ADMIN);
    
    console.log('已创建默认管理员用户');
    console.log('用户名: admin');
    console.log('密码:', adminPassword);
    
    if (!process.env.DEFAULT_ADMIN_PASSWORD) {
      console.log('⚠️  请保存此密码，这是唯一一次显示！');
    }
  }
}

/**
 * 清理过期会话
 */
export async function cleanupExpiredSessions() {
  const sessionData = await readSessions();
  const now = new Date();
  let cleaned = false;
  
  for (const [sessionId, session] of Object.entries(sessionData.sessions)) {
    if (new Date(session.expiresAt) < now) {
      delete sessionData.sessions[sessionId];
      cleaned = true;
    }
  }
  
  if (cleaned) {
    await writeSessions(sessionData);
  }
}