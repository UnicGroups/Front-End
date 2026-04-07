// Lightweight client-side auth mock that stores users in localStorage
// and lets the user download an updated `password` file after sign up.

(function() {
  const STORAGE_KEY = 'sn_users_v1';
  const CURRENT_KEY = 'sn_current_user_v1';
  const PASSWORD_FILENAME = 'password';
  let currentUser = null;
  let menuEl = null;
  let modalEl = null;
  let usersCache = [];

  const defaultUsers = [
    { email: 'admin', name: 'admin', password: 'password' }
  ];

  function serialize(users) {
    // blank line between user blocks
    return users.map(u => `${u.email}\n${u.name}\n${u.password}`).join('\n\n');
  }

  function parse(text) {
    const lines = text.split(/\r?\n/).filter(Boolean);
    const users = [];
    for (let i = 0; i + 2 < lines.length; i += 3) {
      users.push({ email: lines[i], name: lines[i + 1], password: lines[i + 2] });
    }
    return users;
  }

  function saveUsers(users) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
    try {
      const blob = new Blob([serialize(users)], { type: 'text/plain' });
      const a = document.createElement('a');
      a.download = PASSWORD_FILENAME;
      a.href = URL.createObjectURL(blob);
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      a.remove();
    } catch (e) {
      console.warn('Could not trigger password file download', e);
    }
  }

  async function loadUsers() {
    const fromLs = localStorage.getItem(STORAGE_KEY);
    if (fromLs) {
      try { return JSON.parse(fromLs); } catch { /* fallthrough */ }
    }

    try {
      const res = await fetch(PASSWORD_FILENAME);
      if (res.ok) {
        const text = await res.text();
        const parsed = parse(text);
        if (parsed.length) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Could not read password file, using defaults.', e);
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultUsers));
    return defaultUsers.slice();
  }

  function setCurrentUser(user) {
    currentUser = user;
    localStorage.setItem(CURRENT_KEY, JSON.stringify(user));
    updateAvatar(user);
  }

  function getCurrentUser() {
    const raw = localStorage.getItem(CURRENT_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  function toggleMenu(anchor) {
    if (!menuEl) return;
    const open = menuEl.classList.contains('open');
    if (open) {
      menuEl.classList.remove('open');
      return;
    }
    const rect = anchor.getBoundingClientRect();
    menuEl.style.top = `${rect.bottom + 8}px`;
    menuEl.style.left = `${Math.max(rect.right - 220, 12)}px`;
    menuEl.classList.add('open');
  }

  function closeMenu() {
    if (menuEl) menuEl.classList.remove('open');
  }

  function attachMenu(user) {
    if (menuEl) {
      menuEl.querySelector('[data-name]').textContent = user.name;
      menuEl.querySelector('[data-email]').textContent = user.email;
      return;
    }
    menuEl = document.createElement('div');
    menuEl.className = 'auth-menu';
    menuEl.innerHTML = `
      <h4 data-name></h4>
      <small data-email></small>
      <button type="button">Profile</button>
      <button type="button">Settings</button>
      <button type="button" class="logout">Log out</button>
    `;
    document.body.appendChild(menuEl);
    menuEl.querySelector('.logout').addEventListener('click', () => {
      localStorage.removeItem(CURRENT_KEY);
      currentUser = null;
      updateAvatar(null);
      closeMenu();
      if (modalEl) openModal(modalEl, 'login');
    });
    // other buttons are inert per requirements
    menuEl.addEventListener('click', (e) => e.stopPropagation());
  }

  function updateAvatar(user) {
    const avatar = document.querySelector('.avatar');
    if (!avatar) return;
    const letter = user && user.name ? user.name.trim().charAt(0).toUpperCase() : 'S';
    avatar.textContent = letter;
    avatar.title = user ? user.name : 'Sign in';
  }

  function closeModal(modal) {
    modal.classList.remove('open');
  }

  function openModal(modal, mode) {
    modal.classList.add('open');
    switchMode(modal, mode || 'login');
  }

  function switchMode(modal, mode) {
    modal.setAttribute('data-mode', mode);
    modal.querySelector('[data-mode-label]').textContent = mode === 'login' ? 'Log in' : 'Sign up';
    modal.querySelector('.name-field').style.display = mode === 'signup' ? 'block' : 'none';
    modal.querySelector('.auth-error').textContent = '';
  }

  function initModal(users) {
    if (document.querySelector('.auth-overlay')) return { modal: document.querySelector('.auth-overlay'), users };

    const overlay = document.createElement('div');
    overlay.className = 'auth-overlay';
    overlay.innerHTML = `
      <div class="auth-modal">
        <button class="auth-close" aria-label="Close">×</button>
        <div class="auth-tabs">
          <button class="auth-tab" data-tab="login">Log in</button>
          <button class="auth-tab" data-tab="signup">Sign up</button>
        </div>
        <h3 data-mode-label>Log in</h3>
        <div class="auth-error" aria-live="polite"></div>
        <label class="auth-field">Email
          <input type="email" class="auth-email" placeholder="you@example.com" required>
        </label>
        <label class="auth-field name-field" style="display:none;">Full name
          <input type="text" class="auth-name" placeholder="Full name" autocomplete="name">
        </label>
        <label class="auth-field">Password
          <input type="password" class="auth-pass" placeholder="Password" required>
        </label>
        <button class="auth-primary">Continue</button>
        <p class="auth-note">Accounts are stored locally only. After sign up a file called "password" will download with your credentials.</p>
      </div>`;

    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(overlay); });
    overlay.querySelector('.auth-close').addEventListener('click', () => closeModal(overlay));

    overlay.querySelectorAll('.auth-tab').forEach(btn => {
      btn.addEventListener('click', () => switchMode(overlay, btn.dataset.tab));
    });

    overlay.querySelector('.auth-primary').addEventListener('click', () => {
      const mode = overlay.getAttribute('data-mode');
      const email = overlay.querySelector('.auth-email').value.trim();
      const pass = overlay.querySelector('.auth-pass').value;
      const name = overlay.querySelector('.auth-name').value.trim();
      const errorEl = overlay.querySelector('.auth-error');
      errorEl.textContent = '';

      if (!email || !pass || (mode === 'signup' && !name)) {
        errorEl.textContent = 'Please fill in all required fields.';
        return;
      }

      if (mode === 'signup') {
        if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
          errorEl.textContent = 'User already exists. Try logging in instead.';
          return;
        }
        const user = { email, name, password: pass };
        users.push(user);
        saveUsers(users);
        setCurrentUser(user);
        attachMenu(user);
        closeModal(overlay);
        return;
      }

      // login
      const found = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === pass);
      if (!found) {
        errorEl.textContent = 'Invalid email or password.';
        return;
      }
      setCurrentUser(found);
      attachMenu(found);
      closeModal(overlay);
    });

    document.body.appendChild(overlay);
    return { modal: overlay, users };
  }

  async function initAuth() {
    const users = await loadUsers();
    usersCache = users;
    const { modal } = initModal(users);
    modalEl = modal;
    const current = getCurrentUser();
    currentUser = current;
    updateAvatar(current);
    if (current) attachMenu(current);

    const avatarBtn = document.querySelector('.avatar');
    if (avatarBtn) {
      avatarBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (currentUser) {
          toggleMenu(avatarBtn);
        } else {
          openModal(modal, 'login');
        }
      });
      avatarBtn.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          if (currentUser) toggleMenu(avatarBtn); else openModal(modal, 'login');
        }
      });
    }

    document.addEventListener('click', closeMenu);
  }

  // auto-run after DOM is ready
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(initAuth, 0);
  } else {
    document.addEventListener('DOMContentLoaded', initAuth);
  }
})();
