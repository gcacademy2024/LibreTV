# LibreTV 多用户系统指南

## 概述

LibreTV 现在支持完整的多用户登录系统，提供用户注册、登录、角色管理等功能。该系统与原有的简单密码保护系统完全兼容。

## 系统模式

### 兼容模式（旧系统）
当设置了 `PASSWORD` 或 `ADMINPASSWORD` 环境变量时，系统运行在兼容模式下，使用原有的简单密码保护。

### 多用户模式（新系统）
当没有设置 `PASSWORD` 和 `ADMINPASSWORD` 环境变量时，系统自动启用多用户模式。

## 用户角色

系统支持三种用户角色：

1. **管理员 (admin)**
   - 可以访问所有内容
   - 可以访问管理面板
   - 可以管理其他用户
   - 可以访问设置页面

2. **用户 (user)**
   - 可以访问所有内容
   - 可以访问设置页面
   - 不能管理其他用户

3. **观看者 (viewer)**
   - 只能访问内容
   - 不能访问设置页面

## 首次启动

当系统首次启动多用户模式时，会自动创建一个默认管理员账户：

- **用户名**: `admin`
- **密码**: 随机生成（会在控制台显示）

**重要**: 请保存控制台显示的密码，这是唯一一次显示机会！

你也可以通过设置环境变量 `DEFAULT_ADMIN_PASSWORD` 来指定默认管理员密码。

## 环境变量

### 新增环境变量

- `DEFAULT_ADMIN_PASSWORD`: 默认管理员密码（可选）
- `SESSION_SECRET`: 会话加密密钥（可选，自动生成）
- `ALLOWED_ORIGINS`: 允许的CORS源（可选，默认为 "*"）

### 兼容性环境变量

- `PASSWORD`: 用户密码（设置后启用兼容模式）
- `ADMINPASSWORD`: 管理员密码（设置后启用兼容模式）

## API 端点

### 认证相关

- `POST /api/auth/register` - 用户注册
- `POST /api/auth/login` - 用户登录
- `POST /api/auth/logout` - 用户登出
- `GET /api/auth/me` - 获取当前用户信息
- `POST /api/auth/refresh` - 刷新会话

### 用户管理（管理员功能）

- `GET /api/auth/users` - 获取所有用户
- `PUT /api/auth/users/:id` - 更新用户信息
- `DELETE /api/auth/users/:id` - 删除用户

### 其他

- `PUT /api/auth/password` - 修改密码
- `GET /api/auth/roles` - 获取角色权限信息

## 前端集成

### 自动初始化

系统会在页面加载时自动初始化认证系统。如果用户未登录，会显示登录对话框。

### 全局对象

- `window.authManager` - 认证管理器
- `window.authUI` - 认证UI管理器
- `window.userManagement` - 用户管理界面（管理员）

### 使用示例

```javascript
// 检查用户登录状态
if (authManager.isLoggedIn()) {
    console.log('用户已登录:', authManager.currentUser);
}

// 检查用户权限
if (authManager.hasPermission('admin_panel')) {
    console.log('用户有管理员权限');
}

// 登录
try {
    await authManager.login('username', 'password');
    console.log('登录成功');
} catch (error) {
    console.error('登录失败:', error.message);
}

// 登出
await authManager.logout();
```

## 数据存储

用户数据存储在以下文件中：

- `data/users.json` - 用户信息
- `data/sessions.json` - 会话信息

这些文件会在首次启动时自动创建。

## 安全特性

1. **密码哈希**: 使用 bcrypt 加密存储密码
2. **会话管理**: 支持会话过期和自动刷新
3. **权限控制**: 基于角色的访问控制
4. **速率限制**: 防止暴力破解攻击
5. **CORS保护**: 可配置的跨域访问控制

## 迁移指南

### 从旧系统迁移到新系统

1. 移除 `PASSWORD` 和 `ADMINPASSWORD` 环境变量
2. 重启服务器
3. 使用自动生成的管理员账户登录
4. 在用户管理界面创建新用户账户

### 继续使用旧系统

保持 `PASSWORD` 或 `ADMINPASSWORD` 环境变量设置即可。

## 故障排除

### 忘记管理员密码

1. 停止服务器
2. 删除 `data/users.json` 文件
3. 重启服务器，系统会重新生成默认管理员账户

### 会话问题

如果遇到会话相关问题，可以删除 `data/sessions.json` 文件重新开始。

### 权限问题

检查用户角色和权限配置，确保用户有足够的权限访问所需功能。

## 配置示例

### Docker 环境变量

```yaml
environment:
  - DEFAULT_ADMIN_PASSWORD=your_secure_password
  - SESSION_SECRET=your_session_secret
  - ALLOWED_ORIGINS=https://yourdomain.com
```

### 环境文件 (.env)

```env
DEFAULT_ADMIN_PASSWORD=your_secure_password
SESSION_SECRET=your_session_secret
ALLOWED_ORIGINS=https://yourdomain.com
DEBUG=true
```

## 开发和自定义

### 扩展用户角色

编辑 `lib/userManager.js` 中的 `USER_ROLES` 和 `ROLE_PERMISSIONS` 常量。

### 添加新权限

在 `PERMISSIONS` 对象中添加新权限，并更新相应的角色权限映射。

### 自定义UI

修改 `js/auth.js` 和 `js/userManagement.js` 中的UI代码来自定义外观和行为。

## 支持和反馈

如果在使用多用户系统时遇到问题，请查看服务器日志获取详细错误信息，或在项目仓库中创建 issue。