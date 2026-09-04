/**
 * THE PIGEON DIARY - Admin Control Room Client JS
 */

(() => {
  'use strict';

  let socket = null;
  let adminPin = localStorage.getItem('pigeon_admin_pin') || '';

  const el = {
    authModal: document.getElementById('authModal'),
    authForm: document.getElementById('authForm'),
    adminPinInput: document.getElementById('adminPinInput'),
    dashboardWrapper: document.getElementById('dashboardWrapper'),
    btnLogout: document.getElementById('btnLogout'),

    // Announcement
    announcementInput: document.getElementById('announcementInput'),
    btnBroadcastAnnouncement: document.getElementById('btnBroadcastAnnouncement'),
    btnClearAnnouncement: document.getElementById('btnClearAnnouncement'),

    // Stats
    statOnlineCount: document.getElementById('statOnlineCount'),
    statMaxCapacity: document.getElementById('statMaxCapacity'),
    statTotalCalls: document.getElementById('statTotalCalls'),
    statTotalMessages: document.getElementById('statTotalMessages'),
    statTotalVoiceClips: document.getElementById('statTotalVoiceClips'),
    statTotalPhotos: document.getElementById('statTotalPhotos'),
    statQueueCount: document.getElementById('statQueueCount'),

    // Theme Radios
    themeRadioCards: document.querySelectorAll('.theme-option-card'),

    // Capacity
    capacitySlider: document.getElementById('capacitySlider'),
    capacityValDisplay: document.getElementById('capacityValDisplay'),
    btnUpdateCapacity: document.getElementById('btnUpdateCapacity'),

    // Toggles
    toggleVoiceCalls: document.getElementById('toggleVoiceCalls'),
    toggleVoiceClips: document.getElementById('toggleVoiceClips'),
    togglePhotos: document.getElementById('togglePhotos'),
    toggleBotCompanion: document.getElementById('toggleBotCompanion'),
    toggleMaintenance: document.getElementById('toggleMaintenance'),

    // Table & Lists
    activeUsersTableBody: document.getElementById('activeUsersTableBody'),
    tableUserCount: document.getElementById('tableUserCount'),
    btnRefreshUsers: document.getElementById('btnRefreshUsers'),
    bannedIpsList: document.getElementById('bannedIpsList'),
    manualBanIpInput: document.getElementById('manualBanIpInput'),
    btnManualBanIp: document.getElementById('btnManualBanIp'),
    reportsStream: document.getElementById('reportsStream'),

    // PIN change
    newAdminPin: document.getElementById('newAdminPin'),
    btnUpdatePin: document.getElementById('btnUpdatePin')
  };

  function initAdmin() {
    socket = io();

    setupSocketEvents();
    setupEventListeners();

    if (adminPin) {
      el.adminPinInput.value = adminPin;
      socket.emit('admin-auth', { pin: adminPin });
    }
  }

  function setupSocketEvents() {
    socket.on('admin-auth-success', (data) => {
      el.authModal.classList.add('hide');
      el.dashboardWrapper.classList.remove('hide');
      localStorage.setItem('pigeon_admin_pin', adminPin);

      applySiteConfigToUI(data.config);
      applyStatsToUI(data.stats);
      renderUsersTable(data.users);
    });

    socket.on('admin-auth-failed', (data) => {
      alert(`⚠️ ${data.message}`);
      localStorage.removeItem('pigeon_admin_pin');
      adminPin = '';
      el.authModal.classList.remove('hide');
      el.dashboardWrapper.classList.add('hide');
    });

    socket.on('admin-dashboard-update', (data) => {
      applySiteConfigToUI(data.config);
      applyStatsToUI(data.stats);
      renderUsersTable(data.activeUsers);
      renderBannedIps(data.config.bannedIps);

      el.statOnlineCount.innerHTML = `${data.activeUsers.length} <small id="statMaxCapacity">/ ${data.config.maxActiveUsers}</small>`;
      el.statQueueCount.textContent = data.waitingQueueLength || 0;
    });

    socket.on('admin-new-report', (report) => {
      addIncidentReport(report);
    });

    socket.on('admin-notice', (data) => {
      alert(`ℹ️ ${data.message}`);
    });
  }

  function setupEventListeners() {
    // Auth Submit
    el.authForm.addEventListener('submit', (e) => {
      e.preventDefault();
      adminPin = el.adminPinInput.value.trim();
      socket.emit('admin-auth', { pin: adminPin });
    });

    // Logout
    el.btnLogout.addEventListener('click', () => {
      localStorage.removeItem('pigeon_admin_pin');
      window.location.reload();
    });

    // Theme Switch
    el.themeRadioCards.forEach(card => {
      card.addEventListener('click', () => {
        el.themeRadioCards.forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        const theme = card.getAttribute('data-theme');
        card.querySelector('input').checked = true;
        socket.emit('admin-change-theme', { theme });
      });
    });

    // Capacity Slider
    el.capacitySlider.addEventListener('input', (e) => {
      el.capacityValDisplay.textContent = `${e.target.value} Users Max`;
    });

    el.btnUpdateCapacity.addEventListener('click', () => {
      const cap = el.capacitySlider.value;
      socket.emit('admin-change-capacity', { capacity: cap });
      alert(`✅ Active room capacity updated to ${cap} users max!`);
    });

    // Feature Toggles
    el.toggleVoiceCalls.addEventListener('change', (e) => {
      socket.emit('admin-toggle-feature', { feature: 'allowVoiceCalls', enabled: e.target.checked });
    });
    el.toggleVoiceClips.addEventListener('change', (e) => {
      socket.emit('admin-toggle-feature', { feature: 'allowVoiceClips', enabled: e.target.checked });
    });
    el.togglePhotos.addEventListener('change', (e) => {
      socket.emit('admin-toggle-feature', { feature: 'allowPhotoUploads', enabled: e.target.checked });
    });
    el.toggleBotCompanion.addEventListener('change', (e) => {
      socket.emit('admin-toggle-feature', { feature: 'allowBotCompanion', enabled: e.target.checked });
    });
    el.toggleMaintenance.addEventListener('change', (e) => {
      socket.emit('admin-toggle-feature', { feature: 'maintenanceMode', enabled: e.target.checked });
    });

    // Announcement Broadcast
    el.btnBroadcastAnnouncement.addEventListener('click', () => {
      const text = el.announcementInput.value.trim();
      if (!text) return;
      socket.emit('admin-send-announcement', { text });
      alert('📢 Announcement broadcasted to all connected user screens!');
    });

    el.btnClearAnnouncement.addEventListener('click', () => {
      el.announcementInput.value = '';
      socket.emit('admin-send-announcement', { text: '' });
    });

    // Manual Ban IP
    el.btnManualBanIp.addEventListener('click', () => {
      const ip = el.manualBanIpInput.value.trim();
      if (!ip) return;
      socket.emit('admin-ban-ip', { ip });
      el.manualBanIpInput.value = '';
    });

    // Update Security PIN
    el.btnUpdatePin.addEventListener('click', () => {
      const newPin = el.newAdminPin.value.trim();
      if (newPin.length < 4) {
        alert('PIN must be at least 4 characters long.');
        return;
      }
      socket.emit('admin-change-pin', { newPin });
      adminPin = newPin;
      localStorage.setItem('pigeon_admin_pin', newPin);
      el.newAdminPin.value = '';
    });
  }

  function applySiteConfigToUI(config) {
    if (!config) return;

    // Theme
    el.themeRadioCards.forEach(card => {
      if (card.getAttribute('data-theme') === config.theme) {
        card.classList.add('active');
        card.querySelector('input').checked = true;
      } else {
        card.classList.remove('active');
      }
    });

    // Capacity
    el.capacitySlider.value = config.maxActiveUsers;
    el.capacityValDisplay.textContent = `${config.maxActiveUsers} Users Max`;

    // Toggles
    el.toggleVoiceCalls.checked = !!config.allowVoiceCalls;
    el.toggleVoiceClips.checked = !!config.allowVoiceClips;
    el.togglePhotos.checked = !!config.allowPhotoUploads;
    el.toggleBotCompanion.checked = !!config.allowBotCompanion;
    el.toggleMaintenance.checked = !!config.maintenanceMode;

    if (config.announcementText && !el.announcementInput.value) {
      el.announcementInput.value = config.announcementText;
    }

    renderBannedIps(config.bannedIps);
  }

  function applyStatsToUI(stats) {
    if (!stats) return;
    el.statTotalCalls.textContent = stats.totalCallsMade || 0;
    el.statTotalMessages.textContent = stats.totalMessagesSent || 0;
    el.statTotalVoiceClips.textContent = stats.totalVoiceClips || 0;
    el.statTotalPhotos.textContent = stats.totalPhotosShared || 0;
  }

  function renderUsersTable(users) {
    if (!users || users.length === 0) {
      el.activeUsersTableBody.innerHTML = '<tr><td colspan="5" class="empty-table-msg">No active pigeons online.</td></tr>';
      el.tableUserCount.textContent = '0';
      return;
    }

    el.tableUserCount.textContent = users.length;
    el.activeUsersTableBody.innerHTML = '';

    users.forEach(u => {
      const tr = document.createElement('tr');

      let statusLabel = 'Idle';
      let statusClass = 'idle';
      if (u.status === 'in_call') {
        statusLabel = 'In Call 🎙️';
        statusClass = 'in_call';
      } else if (u.status === 'in_queue') {
        statusLabel = 'Searching...';
        statusClass = 'in_queue';
      }

      tr.innerHTML = `
        <td>
          <div class="user-cell">
            <span>${u.avatar || '🕊️'}</span>
            <strong>${u.nickname}</strong>
          </div>
        </td>
        <td>${u.countryFlag || '🌍'} ${u.country}</td>
        <td><code>${u.ip || '127.0.0.1'}</code></td>
        <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
        <td>
          <button class="btn-kick" data-id="${u.id}" data-name="${u.nickname}">Kick</button>
          <button class="btn-ban" data-ip="${u.ip}">Ban IP</button>
        </td>
      `;

      // Kick Button
      tr.querySelector('.btn-kick').addEventListener('click', (e) => {
        const uid = e.target.getAttribute('data-id');
        const name = e.target.getAttribute('data-name');
        if (confirm(`Kick user "${name}" immediately?`)) {
          socket.emit('admin-kick-user', { userId: uid, reason: 'Disconnected by Administrator.' });
        }
      });

      // Ban IP Button
      tr.querySelector('.btn-ban').addEventListener('click', (e) => {
        const ip = e.target.getAttribute('data-ip');
        if (confirm(`Ban IP "${ip}" permanently?`)) {
          socket.emit('admin-ban-ip', { ip });
        }
      });

      el.activeUsersTableBody.appendChild(tr);
    });
  }

  function renderBannedIps(ips) {
    if (!ips || ips.length === 0) {
      el.bannedIpsList.innerHTML = '<p class="empty-list-text">No banned IP addresses.</p>';
      return;
    }
    el.bannedIpsList.innerHTML = '';
    ips.forEach(ip => {
      const div = document.createElement('div');
      div.className = 'banned-ip-item';
      div.innerHTML = `
        <span>${ip}</span>
        <button class="btn-unban" data-ip="${ip}">Unban</button>
      `;
      div.querySelector('.btn-unban').addEventListener('click', () => {
        socket.emit('admin-unban-ip', { ip });
      });
      el.bannedIpsList.appendChild(div);
    });
  }

  function addIncidentReport(report) {
    const div = document.createElement('div');
    div.className = 'report-item';
    div.innerHTML = `
      <strong>[${report.time}] ${report.reporter}</strong> reported a user:<br>
      <em>"${report.reason}"</em>
    `;
    el.reportsStream.prepend(div);
  }

  window.addEventListener('DOMContentLoaded', initAdmin);

})();
