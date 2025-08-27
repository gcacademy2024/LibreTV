// 用户管理界面

class UserManagement {
  constructor(authManager) {
    this.authManager = authManager;
    this.users = [];
    this.isVisible = false;
  }

  /**
   * 显示用户管理界面
   */
  async show() {
    if (!this.authManager.isAdmin()) {
      alert('没有权限访问用户管理');
      return;
    }

    if (this.isVisible) {
      return;
    }

    try {
      await this.loadUsers();
      this.createUI();
      this.isVisible = true;
    } catch (error) {
      console.error('加载用户管理界面失败:', error);
      alert('加载用户管理界面失败: ' + error.message);
    }
  }

  /**
   * 隐藏用户管理界面
   */
  hide() {
    const modal = document.getElementById('userManagementModal');
    if (modal) {
      modal.remove();
    }
    this.isVisible = false;
  }

  /**
   * 加载用户列表
   */
  async loadUsers() {
    try {
      this.users = await this.authManager.getAllUsers();
    } catch (error) {
      throw new Error('获取用户列表失败: ' + error.message);
    }
  }

  /**
   * 创建用户管理UI
   */
  createUI() {
    const modalHtml = `
      <div id="userManagementModal" class="fixed inset-0 bg-black/95 flex items-center justify-center z-[80] transition-opacity duration-300">
        <div class="bg-[#111] border border-[#333] rounded-lg p-6 w-full max-w-6xl mx-4 max-h-[90vh] overflow-y-auto">
          <div class="flex justify-between items-center mb-6">
            <h2 class="text-2xl font-bold gradient-text">用户管理</h2>
            <button onclick="userManagement.hide()" class="text-gray-400 hover:text-white">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
          
          <div class="mb-6">
            <button onclick="userManagement.showAddUserForm()" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg">
              添加用户
            </button>
            <button onclick="userManagement.refreshUsers()" class="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg ml-2">
              刷新
            </button>
          </div>
          
          <!-- 添加用户表单 -->
          <div id="addUserForm" class="bg-[#222] border border-[#333] rounded-lg p-4 mb-6 hidden">
            <h3 class="text-lg font-semibold mb-4">添加新用户</h3>
            <form id="newUserForm" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label class="block text-sm font-medium mb-2">用户名</label>
                <input type="text" id="newUsername" class="w-full bg-[#111] border border-[#333] text-white px-3 py-2 rounded focus:outline-none focus:border-white" required>
              </div>
              <div>
                <label class="block text-sm font-medium mb-2">邮箱</label>
                <input type="email" id="newEmail" class="w-full bg-[#111] border border-[#333] text-white px-3 py-2 rounded focus:outline-none focus:border-white">
              </div>
              <div>
                <label class="block text-sm font-medium mb-2">密码</label>
                <input type="password" id="newPassword" class="w-full bg-[#111] border border-[#333] text-white px-3 py-2 rounded focus:outline-none focus:border-white" required>
              </div>
              <div>
                <label class="block text-sm font-medium mb-2">角色</label>
                <select id="newRole" class="w-full bg-[#111] border border-[#333] text-white px-3 py-2 rounded focus:outline-none focus:border-white">
                  <option value="viewer">观看者</option>
                  <option value="user">用户</option>
                  <option value="admin">管理员</option>
                </select>
              </div>
              <div class="flex items-end">
                <button type="submit" class="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded mr-2">
                  创建
                </button>
                <button type="button" onclick="userManagement.hideAddUserForm()" class="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded">
                  取消
                </button>
              </div>
            </form>
          </div>
          
          <!-- 用户列表 -->
          <div class="overflow-x-auto">
            <table class="w-full border border-[#333] rounded-lg">
              <thead class="bg-[#222]">
                <tr>
                  <th class="px-4 py-3 text-left">ID</th>
                  <th class="px-4 py-3 text-left">用户名</th>
                  <th class="px-4 py-3 text-left">邮箱</th>
                  <th class="px-4 py-3 text-left">角色</th>
                  <th class="px-4 py-3 text-left">状态</th>
                  <th class="px-4 py-3 text-left">创建时间</th>
                  <th class="px-4 py-3 text-left">最后登录</th>
                  <th class="px-4 py-3 text-left">操作</th>
                </tr>
              </thead>
              <tbody id="userTableBody" class="divide-y divide-[#333]">
                <!-- 用户数据将在这里插入 -->
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    this.bindEvents();
    this.renderUserTable();
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    const newUserForm = document.getElementById('newUserForm');
    newUserForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleAddUser();
    });
  }

  /**
   * 渲染用户表格
   */
  renderUserTable() {
    const tbody = document.getElementById('userTableBody');
    if (!tbody) return;

    tbody.innerHTML = this.users.map(user => {
      const createdAt = new Date(user.createdAt).toLocaleString('zh-CN');
      const lastLogin = user.lastLogin ? new Date(user.lastLogin).toLocaleString('zh-CN') : '从未登录';
      const isCurrentUser = user.id === this.authManager.currentUser?.id;

      return `
        <tr class="hover:bg-[#222]">
          <td class="px-4 py-3">${user.id}</td>
          <td class="px-4 py-3">
            ${user.username}
            ${isCurrentUser ? '<span class="text-blue-400 text-xs">(当前用户)</span>' : ''}
          </td>
          <td class="px-4 py-3">${user.email || '未设置'}</td>
          <td class="px-4 py-3">
            <select onchange="userManagement.updateUserRole(${user.id}, this.value)" 
                    class="bg-[#111] border border-[#333] text-white px-2 py-1 rounded text-sm"
                    ${isCurrentUser ? 'disabled' : ''}>
              <option value="viewer" ${user.role === 'viewer' ? 'selected' : ''}>观看者</option>
              <option value="user" ${user.role === 'user' ? 'selected' : ''}>用户</option>
              <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>管理员</option>
            </select>
          </td>
          <td class="px-4 py-3">
            <span class="px-2 py-1 rounded text-xs ${user.isActive ? 'bg-green-600' : 'bg-red-600'}">
              ${user.isActive ? '活跃' : '禁用'}
            </span>
          </td>
          <td class="px-4 py-3 text-sm text-gray-400">${createdAt}</td>
          <td class="px-4 py-3 text-sm text-gray-400">${lastLogin}</td>
          <td class="px-4 py-3">
            <div class="flex space-x-2">
              <button onclick="userManagement.toggleUserStatus(${user.id})" 
                      class="px-2 py-1 rounded text-xs ${user.isActive ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}"
                      ${isCurrentUser ? 'disabled' : ''}>
                ${user.isActive ? '禁用' : '启用'}
              </button>
              <button onclick="userManagement.deleteUser(${user.id})" 
                      class="px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-xs"
                      ${isCurrentUser ? 'disabled' : ''}>
                删除
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  /**
   * 显示添加用户表单
   */
  showAddUserForm() {
    const form = document.getElementById('addUserForm');
    if (form) {
      form.classList.remove('hidden');
    }
  }

  /**
   * 隐藏添加用户表单
   */
  hideAddUserForm() {
    const form = document.getElementById('addUserForm');
    if (form) {
      form.classList.add('hidden');
      document.getElementById('newUserForm').reset();
    }
  }

  /**
   * 处理添加用户
   */
  async handleAddUser() {
    const username = document.getElementById('newUsername').value.trim();
    const email = document.getElementById('newEmail').value.trim();
    const password = document.getElementById('newPassword').value;
    const role = document.getElementById('newRole').value;

    if (!username || !password) {
      alert('用户名和密码不能为空');
      return;
    }

    try {
      await this.authManager.register(username, password, email, role);
      await this.refreshUsers();
      this.hideAddUserForm();
      alert('用户创建成功');
    } catch (error) {
      alert('创建用户失败: ' + error.message);
    }
  }

  /**
   * 刷新用户列表
   */
  async refreshUsers() {
    try {
      await this.loadUsers();
      this.renderUserTable();
    } catch (error) {
      alert('刷新用户列表失败: ' + error.message);
    }
  }

  /**
   * 更新用户角色
   */
  async updateUserRole(userId, newRole) {
    try {
      await this.authManager.updateUser(userId, { role: newRole });
      await this.refreshUsers();
      alert('用户角色更新成功');
    } catch (error) {
      alert('更新用户角色失败: ' + error.message);
      await this.refreshUsers(); // 刷新以恢复原始状态
    }
  }

  /**
   * 切换用户状态
   */
  async toggleUserStatus(userId) {
    const user = this.users.find(u => u.id === userId);
    if (!user) return;

    try {
      await this.authManager.updateUser(userId, { isActive: !user.isActive });
      await this.refreshUsers();
      alert(`用户已${user.isActive ? '禁用' : '启用'}`);
    } catch (error) {
      alert('更新用户状态失败: ' + error.message);
    }
  }

  /**
   * 删除用户
   */
  async deleteUser(userId) {
    const user = this.users.find(u => u.id === userId);
    if (!user) return;

    if (!confirm(`确定要删除用户 "${user.username}" 吗？此操作不可恢复。`)) {
      return;
    }

    try {
      await this.authManager.deleteUser(userId);
      await this.refreshUsers();
      alert('用户删除成功');
    } catch (error) {
      alert('删除用户失败: ' + error.message);
    }
  }
}

// 全局实例
let userManagement;

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  if (window.authManager) {
    userManagement = new UserManagement(window.authManager);
    window.userManagement = userManagement;
  }
});

// 导出到全局
window.UserManagement = UserManagement;