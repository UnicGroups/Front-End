// Shared auth + session store for all pages.
(function() {
  const USERS_KEY = 'sn_users_v1';
  const CURRENT_USER_KEY = 'sn_current_user_v1';
  const SESSIONS_KEY = 'sn_sessions_v1';
  const JOINED_KEY = 'joinedGroups';
  const PASSWORD_FILENAME = 'password';

  const defaultUsers = [{ email: 'admin', name: 'admin', password: 'password' }];
  const defaultSessions = [
    {
      id: 1,
      tag: 'COMP 401',
      title: 'COMP 401 Midterm Review Hackathon',
      location: 'UNIC Main Library, 3rd Floor',
      time: 'Tomorrow, 5:00 PM',
      about: 'We are going to power through the last 3 years of past exams together.',
      description: 'We are going to power through the last 3 years of past exams. Bring snacks and your notes so we can review everything together.',
      spots: 2,
      total: 6,
      lat: 35.16325,
      lng: 33.31396,
      color: '#4a7cff',
      hostName: 'Nedim C.',
      day: 'tomorrow',
      dist: 'near',
      mine: true,
      attendees: [
        { initials: 'N', color: 'blue', name: 'Nedim C.', role: 'Host' },
        { initials: 'T', color: 'green', name: 'Timur S.', role: 'Attendee' },
        { initials: 'H', color: 'yellow', name: 'Hussein K.', role: 'Attendee' },
        { initials: 'K', color: 'purple', name: 'Kumru A.', role: 'Attendee' }
      ]
    },
    {
      id: 2,
      tag: 'COMP 328',
      title: 'UI/UX Figma Collaboration',
      location: 'Student Union Cafe (Near the window)',
      time: 'Thursday, 2:00 PM',
      about: 'Working on our final project design system in Figma.',
      description: 'Working on our final project design. If anyone is good at setting up Figma auto-layout, please come help us out.',
      spots: 2,
      total: 4,
      lat: 35.1598,
      lng: 33.3268,
      color: '#e548a6',
      hostName: 'Aisha M.',
      day: 'thursday',
      dist: 'near',
      mine: false,
      attendees: [
        { initials: 'A', color: 'red', name: 'Aisha M.', role: 'Host' },
        { initials: 'I', color: 'pink', name: 'Illia B.', role: 'Attendee' }
      ]
    },
    {
      id: 3,
      tag: 'COMP 413',
      title: 'Database Normalization Study Group',
      location: 'Engineering Building, Room 104',
      time: 'Saturday, 10:00 AM',
      about: 'Going over BCNF and 3NF reductions with worked examples on the whiteboard.',
      description: 'Going over BCNF and 3NF reductions. I have a whiteboard marker, and we will do practice examples together.',
      spots: 3,
      total: 8,
      lat: 35.1551,
      lng: 33.3092,
      color: '#25b36a',
      hostName: 'Hussein K.',
      day: 'saturday',
      dist: 'near',
      mine: true,
      attendees: [
        { initials: 'H', color: 'yellow', name: 'Hussein K.', role: 'Host' },
        { initials: 'A', color: 'blue', name: 'Aisha M.', role: 'Attendee' },
        { initials: 'S', color: 'teal', name: 'Sara L.', role: 'Attendee' },
        { initials: 'M', color: 'pink', name: 'Mia T.', role: 'Attendee' }
      ]
    }
  ];

  const avatarColorPool = ['blue', 'green', 'yellow', 'purple', 'red', 'pink', 'teal'];
  let currentUser = null;
  let users = [];
  let authModal = null;
  let profileMenu = null;
  let hostModal = null;
  let mapPickerModal = null;
  let mapPickerState = { lat: null, lng: null };
  let leafletPromise = null;

  function initialsFromName(name) {
    const v = (name || '').trim();
    return v ? v.charAt(0).toUpperCase() : 'S';
  }

  function colorFromName(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 1000;
    return avatarColorPool[Math.abs(hash) % avatarColorPool.length];
  }

  function serializeUsers(list) {
    return list.map(u => `${u.email}\n${u.name}\n${u.password}`).join('\n\n');
  }

  function parseUsers(text) {
    const lines = text.split(/\r?\n/).filter(Boolean);
    const out = [];
    for (let i = 0; i + 2 < lines.length; i += 3) {
      out.push({ email: lines[i], name: lines[i + 1], password: lines[i + 2] });
    }
    return out;
  }

  function getJoined() {
    const raw = JSON.parse(localStorage.getItem(JOINED_KEY) || '[]');
    const normalized = Array.from(new Set(raw.map(function(v) { return Number(v); }).filter(function(v) {
      return Number.isFinite(v) && v > 0;
    })));
    localStorage.setItem(JOINED_KEY, JSON.stringify(normalized));
    return normalized;
  }

  function setJoined(value) {
    localStorage.setItem(JOINED_KEY, JSON.stringify(value));
  }

  function getSessions() {
    const raw = localStorage.getItem(SESSIONS_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        let nextId = 1;
        const normalized = parsed.map(function(s) {
          let sid = Number(s.id);
          if (!Number.isFinite(sid) || sid <= 0) sid = nextId;
          nextId = Math.max(nextId, sid + 1);
          return {
            ...s,
            id: sid,
            spots: Number(s.spots),
            total: Number(s.total),
            lat: (s.lat === null || s.lat === undefined || s.lat === '') ? null : (typeof s.lat === 'number' ? s.lat : Number(s.lat)),
            lng: (s.lng === null || s.lng === undefined || s.lng === '') ? null : (typeof s.lng === 'number' ? s.lng : Number(s.lng))
          };
        });
        const byId = {};
        normalized.forEach(function(s) {
          if (!byId[s.id]) byId[s.id] = s;
        });
        const deduped = Object.keys(byId).map(function(k) { return byId[k]; }).sort(function(a, b) { return a.id - b.id; });
        const repaired = deduped.map(function(s, idx) {
          return { ...s, id: idx + 1 };
        });
        // Remap joined ids if ids were repaired
        const oldToNew = {};
        deduped.forEach(function(s, idx) { oldToNew[s.id] = idx + 1; });
        const joined = getJoined();
        const remappedJoined = Array.from(new Set(joined.map(function(id) { return oldToNew[id] || id; }).filter(function(v) {
          return Number.isFinite(v) && v > 0;
        })));
        setJoined(remappedJoined);
        localStorage.setItem(SESSIONS_KEY, JSON.stringify(repaired));
        return repaired;
      } catch (_) {}
    }
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(defaultSessions));
    return defaultSessions.slice();
  }

  function saveSessions(list) {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent('sn:sessions-updated'));
  }

  function saveUsers(list) {
    localStorage.setItem(USERS_KEY, JSON.stringify(list));
    try {
      const blob = new Blob([serializeUsers(list)], { type: 'text/plain' });
      const a = document.createElement('a');
      a.download = PASSWORD_FILENAME;
      a.href = URL.createObjectURL(blob);
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      a.remove();
    } catch (_) {}
  }

  async function loadUsers() {
    const local = localStorage.getItem(USERS_KEY);
    if (local) {
      try { return JSON.parse(local); } catch (_) {}
    }
    try {
      const res = await fetch(PASSWORD_FILENAME);
      if (res.ok) {
        const parsed = parseUsers(await res.text());
        if (parsed.length) {
          localStorage.setItem(USERS_KEY, JSON.stringify(parsed));
          return parsed;
        }
      }
    } catch (_) {}
    localStorage.setItem(USERS_KEY, JSON.stringify(defaultUsers));
    return defaultUsers.slice();
  }

  function getCurrentUser() {
    const raw = localStorage.getItem(CURRENT_USER_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (_) { return null; }
  }

  function setCurrentUser(user) {
    currentUser = user;
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
    updateAvatar();
    window.dispatchEvent(new CustomEvent('sn:auth-changed', { detail: { user } }));
  }

  function logout() {
    localStorage.removeItem(CURRENT_USER_KEY);
    currentUser = null;
    updateAvatar();
    closeProfileMenu();
    openAuthModal('login');
    window.dispatchEvent(new CustomEvent('sn:auth-changed', { detail: { user: null } }));
  }

  function updateAvatar() {
    const avatar = document.querySelector('.avatar');
    if (!avatar) return;
    avatar.textContent = initialsFromName(currentUser ? currentUser.name : 'S');
    avatar.title = currentUser ? currentUser.name : 'Sign in';
  }

  function closeAuthModal() {
    if (authModal) authModal.classList.remove('open');
  }

  function switchAuthMode(mode) {
    if (!authModal) return;
    authModal.setAttribute('data-mode', mode);
    const label = authModal.querySelector('[data-mode-label]');
    const nameField = authModal.querySelector('.name-field');
    const error = authModal.querySelector('.auth-error');
    if (label) label.textContent = mode === 'login' ? 'Log in' : 'Sign up';
    if (nameField) nameField.style.display = mode === 'signup' ? 'block' : 'none';
    if (error) error.textContent = '';
  }

  function openAuthModal(mode) {
    if (!authModal) return;
    closeProfileMenu();
    authModal.classList.add('open');
    switchAuthMode(mode || 'login');
  }

  function ensureAuthModal() {
    if (authModal) return;
    authModal = document.createElement('div');
    authModal.className = 'auth-overlay';
    authModal.setAttribute('data-mode', 'login');
    authModal.innerHTML = `
      <div class="auth-modal">
        <button class="auth-close" aria-label="Close">x</button>
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
          <input type="text" class="auth-name" placeholder="Name Surname">
        </label>
        <label class="auth-field">Password
          <input type="password" class="auth-pass" placeholder="Password" required>
        </label>
        <button class="auth-primary">Continue</button>
      </div>`;
    document.body.appendChild(authModal);

    authModal.addEventListener('click', e => {
      if (e.target === authModal) closeAuthModal();
    });
    authModal.querySelector('.auth-close').addEventListener('click', closeAuthModal);
    authModal.querySelectorAll('.auth-tab').forEach(btn => {
      btn.addEventListener('click', () => switchAuthMode(btn.dataset.tab));
    });
    authModal.querySelector('.auth-primary').addEventListener('click', () => {
      const mode = authModal.getAttribute('data-mode');
      const email = authModal.querySelector('.auth-email').value.trim();
      const password = authModal.querySelector('.auth-pass').value;
      const name = authModal.querySelector('.auth-name').value.trim();
      const error = authModal.querySelector('.auth-error');
      error.textContent = '';

      if (!email || !password || (mode === 'signup' && !name)) {
        error.textContent = 'Please fill in all required fields.';
        return;
      }

      if (mode === 'signup') {
        if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
          error.textContent = 'User already exists. Please log in.';
          return;
        }
        const user = { email, name, password };
        users.push(user);
        saveUsers(users);
        setCurrentUser(user);
        closeAuthModal();
        return;
      }

      const found = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
      if (!found) {
        error.textContent = 'Invalid email or password.';
        return;
      }
      setCurrentUser(found);
      closeAuthModal();
    });
  }

  function closeProfileMenu() {
    if (profileMenu) profileMenu.classList.remove('open');
  }

  function ensureProfileMenu() {
    if (profileMenu) return;
    profileMenu = document.createElement('div');
    profileMenu.className = 'auth-menu';
    profileMenu.innerHTML = `
      <h4 data-name></h4>
      <small data-email></small>
      <button type="button">Profile</button>
      <button type="button">Settings</button>
      <button type="button" class="logout">Log out</button>
    `;
    document.body.appendChild(profileMenu);
    profileMenu.querySelector('.logout').addEventListener('click', logout);
    profileMenu.addEventListener('click', e => e.stopPropagation());
  }

  function openProfileMenu(anchor) {
    if (!currentUser) return;
    ensureProfileMenu();
    profileMenu.querySelector('[data-name]').textContent = currentUser.name;
    profileMenu.querySelector('[data-email]').textContent = currentUser.email;
    const rect = anchor.getBoundingClientRect();
    profileMenu.style.top = `${rect.bottom + 8}px`;
    profileMenu.style.left = `${Math.max(rect.right - 220, 12)}px`;
    profileMenu.classList.add('open');
  }

  function closeHostModal() {
    if (hostModal) hostModal.classList.remove('open');
  }

  function loadLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    if (leafletPromise) return leafletPromise;
    leafletPromise = new Promise(function(resolve, reject) {
      const hasCss = document.querySelector('link[data-sn-leaflet="1"]');
      if (!hasCss) {
        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        css.setAttribute('data-sn-leaflet', '1');
        document.head.appendChild(css);
      }
      const existing = document.querySelector('script[data-sn-leaflet="1"]');
      if (existing) {
        existing.addEventListener('load', function() { resolve(window.L); });
        existing.addEventListener('error', reject);
        return;
      }
      const js = document.createElement('script');
      js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      js.setAttribute('data-sn-leaflet', '1');
      js.onload = function() { resolve(window.L); };
      js.onerror = reject;
      document.body.appendChild(js);
    });
    return leafletPromise;
  }

  function closeMapPicker() {
    if (mapPickerModal) mapPickerModal.classList.remove('open');
  }

  function ensureMapPickerModal() {
    if (mapPickerModal) return;
    mapPickerModal = document.createElement('div');
    mapPickerModal.className = 'auth-overlay';
    mapPickerModal.innerHTML = `
      <div class="auth-modal map-picker-modal">
        <button class="auth-close" aria-label="Close">x</button>
        <h3>Select Point on Map (Optional)</h3>
        <div class="auth-note">Click anywhere on the map to set a point, then press Save Point.</div>
        <div id="host-map-picker" style="height:320px;border:1px solid #e8e8e8;border-radius:12px;"></div>
        <div style="display:flex;gap:10px;">
          <button class="auth-primary" id="save-map-point">Save Point</button>
          <button class="auth-tab" id="clear-map-point" type="button">Clear Point</button>
        </div>
      </div>`;
    document.body.appendChild(mapPickerModal);

    mapPickerModal.addEventListener('click', function(e) {
      if (e.target === mapPickerModal) closeMapPicker();
    });
    mapPickerModal.querySelector('.auth-close').addEventListener('click', closeMapPicker);
    mapPickerModal.querySelector('#save-map-point').addEventListener('click', function() {
      const preview = hostModal ? hostModal.querySelector('#host-map-preview') : null;
      if (preview) {
        preview.textContent = (mapPickerState.lat != null && mapPickerState.lng != null)
          ? ('Point selected: ' + mapPickerState.lat.toFixed(5) + ', ' + mapPickerState.lng.toFixed(5))
          : 'No point selected';
      }
      closeMapPicker();
    });
    mapPickerModal.querySelector('#clear-map-point').addEventListener('click', function() {
      mapPickerState = { lat: null, lng: null };
      const preview = hostModal ? hostModal.querySelector('#host-map-preview') : null;
      if (preview) preview.textContent = 'No point selected';
      closeMapPicker();
    });
  }

  async function openMapPicker() {
    ensureMapPickerModal();
    mapPickerModal.classList.add('open');
    const L = await loadLeaflet();
    const mount = mapPickerModal.querySelector('#host-map-picker');
    if (!mount) return;

    mount.innerHTML = '';
    const center = (mapPickerState.lat != null && mapPickerState.lng != null)
      ? [mapPickerState.lat, mapPickerState.lng]
      : [35.159, 33.318];
    const map = L.map(mount, { zoomControl: true }).setView(center, 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(map);

    let marker = null;
    if (mapPickerState.lat != null && mapPickerState.lng != null) {
      marker = L.marker([mapPickerState.lat, mapPickerState.lng]).addTo(map);
    }
    map.on('click', function(e) {
      mapPickerState = { lat: e.latlng.lat, lng: e.latlng.lng };
      if (marker) marker.remove();
      marker = L.marker([mapPickerState.lat, mapPickerState.lng]).addTo(map);
    });
    setTimeout(function() { map.invalidateSize(); }, 30);
  }

  function ensureHostModal() {
    if (hostModal) return;
    hostModal = document.createElement('div');
    hostModal.className = 'auth-overlay';
    hostModal.innerHTML = `
      <div class="auth-modal">
        <button class="auth-close" aria-label="Close">x</button>
        <h3>Host a Session</h3>
        <div class="auth-error host-error" aria-live="polite"></div>
        <label class="auth-field">Course Tag
          <input type="text" id="host-tag" placeholder="COMP 401">
        </label>
        <label class="auth-field">Session Title
          <input type="text" id="host-title" placeholder="Midterm Review">
        </label>
        <label class="auth-field">Time
          <input type="text" id="host-time" placeholder="Friday, 4:00 PM">
        </label>
        <label class="auth-field">Location
          <input type="text" id="host-location" placeholder="Library, 2nd floor">
        </label>
        <button class="auth-tab" id="host-map-btn" type="button">Show on map (optional)</button>
        <div class="auth-note" id="host-map-preview">No point selected</div>
        <label class="auth-field">Total Spots
          <input type="number" id="host-total" min="1" value="6">
        </label>
        <label class="auth-field">About This Session
          <input type="text" id="host-about" placeholder="What will you study?">
        </label>
        <button class="auth-primary" id="host-submit">Create Session</button>
      </div>`;
    document.body.appendChild(hostModal);

    hostModal.addEventListener('click', e => {
      if (e.target === hostModal) closeHostModal();
    });
    hostModal.querySelector('.auth-close').addEventListener('click', closeHostModal);
    hostModal.querySelector('#host-map-btn').addEventListener('click', function() {
      openMapPicker().catch(function() {
        const err = hostModal.querySelector('.host-error');
        err.textContent = 'Could not load map. You can still create session without map point.';
      });
    });
    hostModal.querySelector('#host-submit').addEventListener('click', () => {
      const err = hostModal.querySelector('.host-error');
      const tag = hostModal.querySelector('#host-tag').value.trim();
      const title = hostModal.querySelector('#host-title').value.trim();
      const time = hostModal.querySelector('#host-time').value.trim();
      const location = hostModal.querySelector('#host-location').value.trim();
      const lat = mapPickerState.lat;
      const lng = mapPickerState.lng;
      const total = parseInt(hostModal.querySelector('#host-total').value, 10);
      const about = hostModal.querySelector('#host-about').value.trim();
      err.textContent = '';

      if (!currentUser) {
        err.textContent = 'Please log in first.';
        return;
      }
      if (!tag || !title || !time || !location || !about || !total || total < 1) {
        err.textContent = 'Please fill all fields correctly.';
        return;
      }

      const sessions = getSessions();
      const id = sessions.reduce(function(max, s) {
        const sid = Number(s.id);
        return Math.max(max, Number.isFinite(sid) ? sid : 0);
      }, 0) + 1;
      const hostInitial = initialsFromName(currentUser.name);
      const hostColor = colorFromName(currentUser.name);
      const created = {
        id,
        tag,
        title,
        location,
        time,
        about,
        description: about,
        spots: total - 1,
        total,
        lat: typeof lat === 'number' ? lat : null,
        lng: typeof lng === 'number' ? lng : null,
        color: '#0f0f10',
        hostName: currentUser.name,
        createdByEmail: currentUser.email,
        day: 'today',
        dist: 'near',
        mine: true,
        attendees: [
          { initials: hostInitial, color: hostColor, name: currentUser.name, role: 'Host' }
        ]
      };
      sessions.push(created);
      saveSessions(sessions);

      // Do not auto-join host as attendee.
      closeHostModal();
      mapPickerState = { lat: null, lng: null };
      hostModal.querySelector('#host-map-preview').textContent = 'No point selected';
      window.dispatchEvent(new CustomEvent('sn:host-created', { detail: { sessionId: id } }));
    });
  }

  function requireLogin() {
    if (currentUser) return true;
    openAuthModal('login');
    return false;
  }

  function bindHeaderActions() {
    const avatar = document.querySelector('.avatar');
    if (avatar) {
      avatar.setAttribute('role', 'button');
      avatar.setAttribute('tabindex', '0');
      avatar.addEventListener('click', e => {
        e.stopPropagation();
        if (!currentUser) openAuthModal('login');
        else {
          if (profileMenu && profileMenu.classList.contains('open')) closeProfileMenu();
          else openProfileMenu(avatar);
        }
      });
      avatar.addEventListener('keypress', e => {
        if (e.key === 'Enter') avatar.click();
      });
    }

    document.querySelectorAll('.host-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!requireLogin()) return;
        ensureHostModal();
        closeProfileMenu();
        hostModal.classList.add('open');
      });
    });

    document.addEventListener('click', closeProfileMenu);
  }

  function updateMyGroupsBadge() {
    const joined = getJoined();
    const sessions = getSessions();
    const hosted = currentUser
      ? sessions
          .filter(function(s) {
            return (s.createdByEmail && s.createdByEmail === currentUser.email) || (s.hostName && s.hostName === currentUser.name);
          })
          .map(function(s) { return Number(s.id); })
      : [];
    const total = Array.from(new Set(joined.concat(hosted))).length;
    document.querySelectorAll('#nav-mygroups').forEach(el => {
      el.textContent = total > 0 ? `My Groups (${total})` : 'My Groups';
    });
  }

  async function init() {
    users = await loadUsers();
    currentUser = getCurrentUser();
    ensureAuthModal();
    ensureProfileMenu();
    bindHeaderActions();
    updateAvatar();
    updateMyGroupsBadge();
    window.addEventListener('sn:sessions-updated', updateMyGroupsBadge);
    window.addEventListener('sn:auth-changed', updateMyGroupsBadge);

    window.StudyNomad = {
      getCurrentUser: () => currentUser,
      requireLogin,
      openLogin: () => openAuthModal('login'),
      getSessions,
      saveSessions,
      deleteSession: function(sessionId) {
        const user = currentUser;
        if (!user) return { ok: false, error: 'Login required' };
        const id = Number(sessionId);
        const sessions = getSessions();
        const target = sessions.find(function(s) { return Number(s.id) === id; });
        if (!target) return { ok: false, error: 'Session not found' };
        const isOwner = (target.createdByEmail && target.createdByEmail === user.email) || (target.hostName && target.hostName === user.name);
        if (!isOwner) return { ok: false, error: 'Only host can delete this session' };
        const next = sessions.filter(function(s) { return Number(s.id) !== id; });
        saveSessions(next);
        const joined = getJoined().filter(function(j) { return Number(j) !== id; });
        setJoined(joined);
        return { ok: true };
      },
      getJoined,
      setJoined,
      initialsFromName,
      colorFromName
    };
    window.dispatchEvent(new CustomEvent('sn:ready'));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
