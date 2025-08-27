// 多用户认证系统前端

/**
 * API基础配置
 */
const API_BASE = '/api/auth';

/**
 * HTTP请求工具
 */
async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    credentials: 'include', // 包含cookies
    ...options
  };

  if (options.body && typeof options.body === 'object') {
    config.body = JSON.stringify(options.body);
  }

  try {
    const response = await fetch(url, config);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || '请求失败');
    }

    return data;
  } catch (error) {
    console.error('API请求错误:', error);
    throw error;
  }
}

/**
 * 用户认证管理器
 */
class AuthManager {
  constructor() {
    this.currentUser = null;
    this.listeners = [];
    this.init();
  }

  /**
   * 初始化认证管理器
   */
  async init() {
    // 检查系统模式
    if (this.isLegacyMode()) {
      console.log('运行在兼容模式（旧密码系统）');
      return;
    }

    // 尝试获取当前用户信息
    try {
      await this.getCurrentUser();
    } catch (error) {
      console.log('用户未登录或会话已过期');
    }
  }

  /**
   * 检查是否为兼容模式
   */
  isLegacyMode() {
    return window.__ENV__ && window.__ENV__.LEGACY_MODE === true;
  }

  /**
   * 是否启用多用户系统
   */
  isMultiUserEnabled() {
    return window.__ENV__ && window.__ENV__.MULTI_USER_ENABLED === true;
  }

  /**
   * 用户登录
   */
  async login(username, password, rememberMe = false) {
    try {
      const response = await apiRequest('/login', {
        method: 'POST',
        body: { username, password, rememberMe }
      });

      this.currentUser = response.data.user;
      this.notifyListeners('login', this.currentUser);

      return response;
    } catch (error) {
      throw error;
    }
  }

  /**
   * 用户注册
   */
  async register(username, password, email = '', role = 'user') {
    try {
      const response = await apiRequest('/register', {
        method: 'POST',
        body: { username, password, email, role }
      });

      return response;
    } catch (error) {
      throw error;
    }
  }

  /**
   * 用户登出
   */
  async logout() {
    try {
      await apiRequest('/logout', {
        method: 'POST'
      });

      this.currentUser = null;
      this.notifyListeners('logout');
    } catch (error) {
      console.error('登出错误:', error);
      // 即使API调用失败，也清除本地状态
      this.currentUser = null;
      this.notifyListeners('logout');
    }
  }

  /**
   * 获取当前用户信息
   */
  async getCurrentUser() {
    try {
      const response = await apiRequest('/me');
      this.currentUser = response.data;
      this.notifyListeners('userUpdate', this.currentUser);
      return this.currentUser;
    } catch (error) {
      this.currentUser = null;
      this.notifyListeners('userUpdate', null);
      throw error;
    }
  }

  /**
   * 刷新会话
   */
  async refreshSession() {
    try {
      const response = await apiRequest('/refresh', {
        method: 'POST'
      });

      this.currentUser = response.data.user;
      this.notifyListeners('sessionRefresh', this.currentUser);
      return response;
    } catch (error) {
      this.currentUser = null;
      this.notifyListeners('sessionExpired');
      throw error;
    }
  }

  /**
   * 获取所有用户（管理员功能）
   */
  async getAllUsers() {
    try {
      const response = await apiRequest('/users');
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * 更新用户信息（管理员功能）
   */
  async updateUser(userId, updates) {
    try {
      const response = await apiRequest(`/users/${userId}`, {
        method: 'PUT',
        body: updates
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * 删除用户（管理员功能）
   */
  async deleteUser(userId) {
    try {
      const response = await apiRequest(`/users/${userId}`, {
        method: 'DELETE'
      });
      return response;
    } catch (error) {
      throw error;
    }
  }

  /**
   * 获取角色权限信息
   */
  async getRolePermissions() {
    try {
      const response = await apiRequest('/roles');
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * 检查用户是否已登录
   */
  isLoggedIn() {
    return !!this.currentUser;
  }

  /**
   * 检查用户是否有特定权限
   */
  hasPermission(permission) {
    if (!this.currentUser) return false;
    
    // 这里需要从服务器获取权限信息，简化版本
    const rolePermissions = {
      admin: ['view_content', 'admin_panel', 'user_management', 'settings_access'],
      user: ['view_content', 'settings_access'],
      viewer: ['view_content']
    };

    const userPermissions = rolePermissions[this.currentUser.role] || [];
    return userPermissions.includes(permission);
  }

  /**
   * 检查是否为管理员
   */
  isAdmin() {
    return this.currentUser && this.currentUser.role === 'admin';
  }

  /**
   * 添加事件监听器
   */
  addListener(callback) {
    this.listeners.push(callback);
  }

  /**
   * 移除事件监听器
   */
  removeListener(callback) {
    const index = this.listeners.indexOf(callback);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  /**
   * 通知监听器
   */
  notifyListeners(event, data) {
    this.listeners.forEach(callback => {
      try {
        callback(event, data);
      } catch (error) {
        console.error('监听器回调错误:', error);
      }
    });
  }

  /**
   * 自动刷新会话
   */
  startSessionRefresh() {
    // 每20分钟尝试刷新会话
    setInterval(async () => {
      if (this.isLoggedIn()) {
        try {
          await this.refreshSession();
        } catch (error) {
          console.log('会话自动刷新失败，用户可能需要重新登录');
        }
      }
    }, 20 * 60 * 1000);
  }
}

/**
 * UI管理器
 */
class AuthUI {
  constructor(authManager) {
    this.authManager = authManager;
    this.init();
  }

  init() {
    // 监听认证状态变化
    this.authManager.addListener((event, data) => {
      this.handleAuthStateChange(event, data);
    });

    // 如果启用多用户系统，创建UI
    if (this.authManager.isMultiUserEnabled()) {
      this.createLoginModal();
      this.createUserMenu();
      this.updateUI();
    }
  }

  /**
   * 处理认证状态变化
   */
  handleAuthStateChange(event, data) {
    switch (event) {
      case 'login':
      case 'userUpdate':
        this.updateUI();
        this.hideLoginModal();
        break;
      case 'logout':
      case 'sessionExpired':
        this.updateUI();
        this.showLoginModal();
        break;
    }
  }

  /**
   * 创建登录模态框
   */
  createLoginModal() {
    const modalHtml = `
      <div id="authModal" class="fixed inset-0 bg-black/95 hidden items-center justify-center z-[70] transition-opacity duration-300">
        <div class="bg-[#111] border border-[#333] rounded-lg p-6 w-full max-w-md mx-4">
          <div class="flex justify-between items-center mb-6">
            <h2 id="authModalTitle" class="text-xl font-bold gradient-text">用户登录</h2>
            <button onclick="authUI.hideLoginModal()" class="text-gray-400 hover:text-white">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
          
          <div id="authModalContent">
            <!-- 登录表单 -->
            <form id="loginForm" class="space-y-4">
              <div>
                <input type="text" id="loginUsername" placeholder="用户名" 
                       class="w-full bg-[#222] border border-[#333] text-white px-4 py-3 rounded-lg focus:outline-none focus:border-white transition-colors" required>
              </div>
              <div>
                <input type="password" id="loginPassword" placeholder="密码" 
                       class="w-full bg-[#222] border border-[#333] text-white px-4 py-3 rounded-lg focus:outline-none focus:border-white transition-colors" required>
              </div>
              <div class="flex items-center justify-between">
                <label class="flex items-center text-sm text-gray-300">
                  <input type="checkbox" id="rememberMe" class="mr-2">
                  记住我
                </label>
              </div>
              <button type="submit" class="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-lg transition-colors">
                登录
              </button>
            </form>
            
            <!-- 注册表单 -->
            <form id="registerForm" class="space-y-4 hidden">
              <div>
                <input type="text" id="registerUsername" placeholder="用户名" 
                       class="w-full bg-[#222] border border-[#333] text-white px-4 py-3 rounded-lg focus:outline-none focus:border-white transition-colors" required>
              </div>
              <div>
                <input type="email" id="registerEmail" placeholder="邮箱（可选）" 
                       class="w-full bg-[#222] border border-[#333] text-white px-4 py-3 rounded-lg focus:outline-none focus:border-white transition-colors">
              </div>
              <div>
                <input type="password" id="registerPassword" placeholder="密码" 
                       class="w-full bg-[#222] border border-[#333] text-white px-4 py-3 rounded-lg focus:outline-none focus:border-white transition-colors" required>
              </div>
              <div>
                <input type="password" id="registerPasswordConfirm" placeholder="确认密码" 
                       class="w-full bg-[#222] border border-[#333] text-white px-4 py-3 rounded-lg focus:outline-none focus:border-white transition-colors" required>
              </div>
              <button type="submit" class="w-full bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded-lg transition-colors">
                注册
              </button>
            </form>
          </div>
          
          <div class="mt-4 text-center">
            <button id="toggleAuthMode" class="text-blue-400 hover:text-blue-300 text-sm">
              还没有账户？点击注册
            </button>
          </div>
          
          <p id="authError" class="text-red-500 mt-2 hidden text-sm"></p>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    this.bindLoginEvents();
  }

  /**
   * 创建用户菜单
   */
  createUserMenu() {
    // 在右上角添加用户菜单按钮
    const userMenuHtml = `
      <div id="userMenu" class="fixed top-4 right-16 z-10 hidden">
        <button id="userMenuBtn" class="bg-[#222] hover:bg-[#333] border border-[#333] hover:border-white rounded-lg px-3 py-1.5 transition-colors flex items-center space-x-2">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
          </svg>
          <span id="currentUsername"></span>
        </button>
        
        <div id="userDropdown" class="absolute right-0 mt-2 w-48 bg-[#111] border border-[#333] rounded-lg shadow-lg hidden">
          <div class="py-2">
            <div class="px-4 py-2 text-sm text-gray-300 border-b border-[#333]">
              <div id="userInfo"></div>
            </div>
            <button onclick="authUI.showUserManagement()" class="w-full text-left px-4 py-2 text-sm text-white hover:bg-[#333] admin-only hidden">
              用户管理
            </button>
            <button onclick="authUI.showProfile()" class="w-full text-left px-4 py-2 text-sm text-white hover:bg-[#333]">
              个人资料
            </button>
            <button onclick="authManager.logout()" class="w-full text-left px-4 py-2 text-sm text-white hover:bg-[#333]">
              退出登录
            </button>
          </div>
        </div>
      </div>
    `;

    // 在设置按钮之前插入
    const settingsBtn = document.querySelector('[onclick="toggleSettings(event)"]').parentElement;
    settingsBtn.insertAdjacentHTML('beforebegin', userMenuHtml);
    this.bindUserMenuEvents();
  }

  /**
   * 绑定登录相关事件
   */
  bindLoginEvents() {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const toggleBtn = document.getElementById('toggleAuthMode');
    
    let isLoginMode = true;

    // 切换登录/注册模式
    toggleBtn.addEventListener('click', () => {
      isLoginMode = !isLoginMode;
      
      if (isLoginMode) {
        loginForm.classList.remove('hidden');
        registerForm.classList.add('hidden');
        document.getElementById('authModalTitle').textContent = '用户登录';
        toggleBtn.textContent = '还没有账户？点击注册';
      } else {
        loginForm.classList.add('hidden');
        registerForm.classList.remove('hidden');
        document.getElementById('authModalTitle').textContent = '用户注册';
        toggleBtn.textContent = '已有账户？点击登录';
      }
    });

    // 登录表单提交
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const username = document.getElementById('loginUsername').value;
      const password = document.getElementById('loginPassword').value;
      const rememberMe = document.getElementById('rememberMe').checked;

      try {
        await this.authManager.login(username, password, rememberMe);
        this.showAuthSuccess('登录成功');
      } catch (error) {
        this.showAuthError(error.message);
      }
    });

    // 注册表单提交
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const username = document.getElementById('registerUsername').value;
      const email = document.getElementById('registerEmail').value;
      const password = document.getElementById('registerPassword').value;
      const confirmPassword = document.getElementById('registerPasswordConfirm').value;

      if (password !== confirmPassword) {
        this.showAuthError('两次输入的密码不一致');
        return;
      }

      try {
        await this.authManager.register(username, password, email);
        this.showAuthSuccess('注册成功，请登录');
        // 切换到登录模式
        toggleBtn.click();
      } catch (error) {
        this.showAuthError(error.message);
      }
    });
  }

  /**
   * 绑定用户菜单事件
   */
  bindUserMenuEvents() {
    const userMenuBtn = document.getElementById('userMenuBtn');
    const userDropdown = document.getElementById('userDropdown');

    userMenuBtn.addEventListener('click', () => {
      userDropdown.classList.toggle('hidden');
    });

    // 点击外部关闭下拉菜单
    document.addEventListener('click', (e) => {
      if (!userMenuBtn.contains(e.target) && !userDropdown.contains(e.target)) {
        userDropdown.classList.add('hidden');
      }
    });
  }

  /**
   * 更新UI状态
   */
  updateUI() {
    const userMenu = document.getElementById('userMenu');
    const currentUser = this.authManager.currentUser;

    if (currentUser) {
      // 显示用户菜单
      userMenu.classList.remove('hidden');
      document.getElementById('currentUsername').textContent = currentUser.username;
      document.getElementById('userInfo').innerHTML = `
        <div class="font-medium">${currentUser.username}</div>
        <div class="text-xs text-gray-400">${this.getRoleDisplayName(currentUser.role)}</div>
      `;

      // 显示/隐藏管理员功能
      const adminOnlyElements = document.querySelectorAll('.admin-only');
      adminOnlyElements.forEach(el => {
        if (currentUser.role === 'admin') {
          el.classList.remove('hidden');
        } else {
          el.classList.add('hidden');
        }
      });
    } else {
      // 隐藏用户菜单
      userMenu.classList.add('hidden');
    }
  }

  /**
   * 获取角色显示名称
   */
  getRoleDisplayName(role) {
    const roleNames = {
      admin: '管理员',
      user: '用户',
      viewer: '观看者'
    };
    return roleNames[role] || role;
  }

  /**
   * 显示登录模态框
   */
  showLoginModal() {
    if (!this.authManager.isMultiUserEnabled()) return;
    
    const modal = document.getElementById('authModal');
    if (modal) {
      modal.style.display = 'flex';
      // 聚焦到用户名输入框
      setTimeout(() => {
        document.getElementById('loginUsername').focus();
      }, 100);
    }
  }

  /**
   * 隐藏登录模态框
   */
  hideLoginModal() {
    const modal = document.getElementById('authModal');
    if (modal) {
      modal.style.display = 'none';
    }
  }

  /**
   * 显示认证错误
   */
  showAuthError(message) {
    const errorElement = document.getElementById('authError');
    if (errorElement) {
      errorElement.textContent = message;
      errorElement.classList.remove('hidden');
    }
  }

  /**
   * 显示认证成功
   */
  showAuthSuccess(message) {
    const errorElement = document.getElementById('authError');
    if (errorElement) {
      errorElement.textContent = message;
      errorElement.className = 'text-green-500 mt-2 text-sm';
      errorElement.classList.remove('hidden');
      
      setTimeout(() => {
        errorElement.classList.add('hidden');
        errorElement.className = 'text-red-500 mt-2 hidden text-sm';
      }, 2000);
    }
  }

  /**
   * 显示用户管理界面
   */
  showUserManagement() {
    if (window.userManagement) {
      window.userManagement.show();
    } else {
      // 动态加载用户管理脚本
      const script = document.createElement('script');
      script.src = 'js/userManagement.js';
      script.onload = () => {
        if (window.userManagement) {
          window.userManagement.show();
        }
      };
      document.head.appendChild(script);
    }
  }

  /**
   * 显示个人资料界面
   */
  showProfile() {
    // 这里可以实现个人资料界面
    console.log('显示个人资料界面');
  }
}

// 全局实例
let authManager;
let authUI;

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
  authManager = new AuthManager();
  authUI = new AuthUI(authManager);
  
  // 启动会话自动刷新
  authManager.startSessionRefresh();
  
  // 如果启用多用户系统且用户未登录，显示登录框
  if (authManager.isMultiUserEnabled() && !authManager.isLoggedIn()) {
    // 延迟显示，让页面先加载完成
    setTimeout(() => {
      if (!authManager.isLoggedIn()) {
        authUI.showLoginModal();
      }
    }, 1000);
  }
});

// 导出到全局
window.authManager = authManager;
window.authUI = authUI;