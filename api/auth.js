import express from 'express';
import { 
  createUser, 
  authenticateUser, 
  createSession, 
  destroySession, 
  validateSession,
  getAllUsers,
  updateUser,
  deleteUser,
  USER_ROLES,
  hasPermission,
  PERMISSIONS
} from '../lib/userManager.js';
import { 
  requireAuth, 
  requireAdmin, 
  requireUserManagement, 
  apiResponse, 
  rateLimit,
  errorHandler
} from '../lib/authMiddleware.js';

const router = express.Router();

// 应用中间件
router.use(apiResponse);
router.use(rateLimit(50, 15 * 60 * 1000)); // 15分钟内最多50个请求

/**
 * 用户注册
 * POST /api/auth/register
 */
router.post('/register', async (req, res) => {
  try {
    const { username, password, email, role } = req.body;
    
    // 基本验证
    if (!username || !password) {
      return res.error('用户名和密码不能为空', 'MISSING_REQUIRED_FIELDS', 400);
    }
    
    if (username.length < 3) {
      return res.error('用户名至少需要3个字符', 'USERNAME_TOO_SHORT', 400);
    }
    
    if (password.length < 6) {
      return res.error('密码至少需要6个字符', 'PASSWORD_TOO_SHORT', 400);
    }
    
    // 邮箱格式验证
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.error('邮箱格式不正确', 'INVALID_EMAIL_FORMAT', 400);
    }
    
    // 只有管理员可以创建管理员用户
    const requestedRole = role || USER_ROLES.USER;
    if (requestedRole === USER_ROLES.ADMIN && (!req.user || !hasPermission(req.user, PERMISSIONS.USER_MANAGEMENT))) {
      return res.error('没有权限创建管理员用户', 'INSUFFICIENT_PERMISSIONS', 403);
    }
    
    const user = await createUser(username, password, email, requestedRole);
    
    res.success(user, '用户注册成功');
  } catch (error) {
    console.error('注册错误:', error);
    res.error(error.message, 'REGISTRATION_FAILED', 400);
  }
});

/**
 * 用户登录
 * POST /api/auth/login
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password, rememberMe } = req.body;
    
    if (!username || !password) {
      return res.error('用户名和密码不能为空', 'MISSING_CREDENTIALS', 400);
    }
    
    const user = await authenticateUser(username, password);
    const sessionId = await createSession(user.id);
    
    // 设置cookie
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000 // 30天或1天
    };
    
    res.cookie('sessionId', sessionId, cookieOptions);
    
    res.success({
      user,
      sessionId,
      expiresIn: rememberMe ? 30 * 24 * 60 * 60 : 24 * 60 * 60 // 秒
    }, '登录成功');
  } catch (error) {
    console.error('登录错误:', error);
    res.error(error.message, 'LOGIN_FAILED', 401);
  }
});

/**
 * 用户登出
 * POST /api/auth/logout
 */
router.post('/logout', requireAuth, async (req, res) => {
  try {
    if (req.sessionId) {
      await destroySession(req.sessionId);
    }
    
    res.clearCookie('sessionId');
    res.success(null, '登出成功');
  } catch (error) {
    console.error('登出错误:', error);
    res.error('登出失败', 'LOGOUT_FAILED', 500);
  }
});

/**
 * 获取当前用户信息
 * GET /api/auth/me
 */
router.get('/me', requireAuth, async (req, res) => {
  try {
    res.success(req.user, '获取用户信息成功');
  } catch (error) {
    console.error('获取用户信息错误:', error);
    res.error('获取用户信息失败', 'GET_USER_INFO_FAILED', 500);
  }
});

/**
 * 刷新会话
 * POST /api/auth/refresh
 */
router.post('/refresh', async (req, res) => {
  try {
    const sessionId = req.sessionId || req.body.sessionId;
    
    if (!sessionId) {
      return res.error('没有提供会话ID', 'MISSING_SESSION_ID', 400);
    }
    
    const user = await validateSession(sessionId);
    
    if (!user) {
      return res.error('会话无效或已过期', 'INVALID_SESSION', 401);
    }
    
    // 创建新会话
    const newSessionId = await createSession(user.id);
    
    // 销毁旧会话
    await destroySession(sessionId);
    
    // 设置新cookie
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000 // 1天
    };
    
    res.cookie('sessionId', newSessionId, cookieOptions);
    
    res.success({
      user,
      sessionId: newSessionId,
      expiresIn: 24 * 60 * 60 // 秒
    }, '会话刷新成功');
  } catch (error) {
    console.error('刷新会话错误:', error);
    res.error('刷新会话失败', 'REFRESH_SESSION_FAILED', 500);
  }
});

/**
 * 获取所有用户（管理员功能）
 * GET /api/auth/users
 */
router.get('/users', requireAuth, requireUserManagement, async (req, res) => {
  try {
    const users = await getAllUsers();
    res.success(users, '获取用户列表成功');
  } catch (error) {
    console.error('获取用户列表错误:', error);
    res.error('获取用户列表失败', 'GET_USERS_FAILED', 500);
  }
});

/**
 * 更新用户信息（管理员功能）
 * PUT /api/auth/users/:userId
 */
router.put('/users/:userId', requireAuth, requireUserManagement, async (req, res) => {
  try {
    const { userId } = req.params;
    const { email, role, isActive } = req.body;
    
    if (!userId || isNaN(parseInt(userId))) {
      return res.error('无效的用户ID', 'INVALID_USER_ID', 400);
    }
    
    const updates = {};
    if (email !== undefined) updates.email = email;
    if (role !== undefined) updates.role = role;
    if (isActive !== undefined) updates.isActive = isActive;
    
    // 验证角色
    if (updates.role && !Object.values(USER_ROLES).includes(updates.role)) {
      return res.error('无效的用户角色', 'INVALID_ROLE', 400);
    }
    
    // 邮箱格式验证
    if (updates.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updates.email)) {
      return res.error('邮箱格式不正确', 'INVALID_EMAIL_FORMAT', 400);
    }
    
    const updatedUser = await updateUser(parseInt(userId), updates);
    res.success(updatedUser, '用户信息更新成功');
  } catch (error) {
    console.error('更新用户信息错误:', error);
    res.error(error.message, 'UPDATE_USER_FAILED', 400);
  }
});

/**
 * 删除用户（管理员功能）
 * DELETE /api/auth/users/:userId
 */
router.delete('/users/:userId', requireAuth, requireUserManagement, async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId || isNaN(parseInt(userId))) {
      return res.error('无效的用户ID', 'INVALID_USER_ID', 400);
    }
    
    // 防止删除自己
    if (parseInt(userId) === req.user.id) {
      return res.error('不能删除自己的账户', 'CANNOT_DELETE_SELF', 400);
    }
    
    await deleteUser(parseInt(userId));
    res.success(null, '用户删除成功');
  } catch (error) {
    console.error('删除用户错误:', error);
    res.error(error.message, 'DELETE_USER_FAILED', 400);
  }
});

/**
 * 修改密码
 * PUT /api/auth/password
 */
router.put('/password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.error('当前密码和新密码不能为空', 'MISSING_PASSWORDS', 400);
    }
    
    if (newPassword.length < 6) {
      return res.error('新密码至少需要6个字符', 'PASSWORD_TOO_SHORT', 400);
    }
    
    // 验证当前密码
    try {
      await authenticateUser(req.user.username, currentPassword);
    } catch (error) {
      return res.error('当前密码错误', 'INVALID_CURRENT_PASSWORD', 400);
    }
    
    // 更新密码
    await updateUser(req.user.id, { password: newPassword });
    
    res.success(null, '密码修改成功');
  } catch (error) {
    console.error('修改密码错误:', error);
    res.error('修改密码失败', 'CHANGE_PASSWORD_FAILED', 500);
  }
});

/**
 * 获取用户角色和权限信息
 * GET /api/auth/roles
 */
router.get('/roles', requireAuth, (req, res) => {
  try {
    const roles = Object.values(USER_ROLES);
    const permissions = Object.values(PERMISSIONS);
    
    res.success({
      roles,
      permissions,
      userRole: req.user.role,
      userPermissions: req.user.role ? require('../lib/userManager.js').getUserPermissions(req.user.role) : []
    }, '获取角色权限信息成功');
  } catch (error) {
    console.error('获取角色权限信息错误:', error);
    res.error('获取角色权限信息失败', 'GET_ROLES_FAILED', 500);
  }
});

// 错误处理中间件
router.use(errorHandler);

export default router;