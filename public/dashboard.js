// ---- Bulk Node Dashboard Interactivity ----

const token = localStorage.getItem('token');
const userStr = localStorage.getItem('user');

if (!token || !userStr) {
  window.location.href = '/public/auth.html';
}

const user = JSON.parse(userStr);

// Populate Profile Details
document.getElementById('profile-name').textContent = user.name;
document.getElementById('profile-email').textContent = user.email;
document.getElementById('avatar-char').textContent = user.name[0].toUpperCase();

// Logout
document.getElementById('btn-logout').addEventListener('click', () => {
  localStorage.clear();
  window.location.href = '/public/auth.html';
});

// View Navigation elements
const viewList = document.getElementById('view-servers-list');
const viewDetail = document.getElementById('view-server-detail');
const serversContainer = document.getElementById('servers-grid-container');
const btnBackList = document.getElementById('btn-back-list');
const pageTitle = document.getElementById('page-title');
const pageSubtitle = document.getElementById('page-subtitle');

// Active Server Context
let currentServer = null;
let statsInterval = null;

// Back to list button handler
btnBackList.addEventListener('click', () => {
  viewDetail.style.display = 'none';
  viewList.style.display = 'block';
  pageTitle.textContent = "Active Server Containers";
  pageSubtitle.style.display = 'block';
  
  // Clear running stats simulation
  if (statsInterval) {
    clearInterval(statsInterval);
    statsInterval = null;
  }
  loadServers();
});

// Load servers from API
async function loadServers() {
  try {
    const res = await fetch('/api/servers', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error("Unauthorized or database read failed");
    const servers = await res.json();

    serversContainer.innerHTML = '';

    if (servers.length === 0) {
      serversContainer.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; color: var(--text-secondary); padding: 40px; border: 1px dashed var(--border); border-radius: var(--radius-md);">
          <h3>No active servers deployed yet</h3>
          <p style="margin-top: 8px;">Navigate back to our home page to deploy your first container or VPS.</p>
          <a href="/#pricing" class="btn-primary-sm" style="display: inline-block; margin-top: 16px; text-decoration: none;">Order Plan Now</a>
        </div>
      `;
      return;
    }

    servers.forEach(server => {
      const isOnline = server.status === 'online';
      const typeIcon = server.type.toLowerCase() === 'vps' ? 'fa-server' : 'fa-gamepad';
      
      const card = document.createElement('div');
      card.className = 'dash-server-card';
      card.innerHTML = `
        <div class="card-header">
          <div class="server-icon-title">
            <div class="server-card-icon"><i class="fas ${typeIcon}"></i></div>
            <div class="server-card-details">
              <h4>${server.name}</h4>
              <span>${server.plan} • ${server.game}</span>
            </div>
          </div>
          <span class="status-badge ${server.status}">${server.status}</span>
        </div>

        <div class="server-card-stats">
          <div class="card-stat">
            <div class="card-stat-label">CPU</div>
            <div class="card-stat-value">${isOnline ? Math.floor(Math.random() * 20) + 10 + '%' : '0%'}</div>
          </div>
          <div class="card-stat">
            <div class="card-stat-label">RAM</div>
            <div class="card-stat-value">${isOnline ? Math.round((server.ramMax * 0.45)) + ' MB' : '0 MB'}</div>
          </div>
          <div class="card-stat">
            <div class="card-stat-label">Disk</div>
            <div class="card-stat-value">${server.disk} GB</div>
          </div>
        </div>

        <div class="server-card-footer">
          <div class="server-card-ip">
            <i class="fas fa-network-wired"></i>
            <span>${server.ip}</span>
          </div>
          <button class="btn-manage" onclick="manageServer('${server.id}')">Manage <i class="fas fa-cog"></i></button>
        </div>
      `;
      serversContainer.appendChild(card);
    });
  } catch (err) {
    console.error(err);
    localStorage.clear();
    window.location.href = '/public/auth.html';
  }
}

// Manage detailed server view
async function manageServer(serverId) {
  try {
    const res = await fetch('/api/servers', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const servers = await res.json();
    const server = servers.find(s => s.id === serverId);

    if (!server) return;
    currentServer = server;

    // Swap view
    viewList.style.display = 'none';
    viewDetail.style.display = 'block';
    pageTitle.textContent = "Server Console";
    pageSubtitle.style.display = 'none';

    // Populate Details elements
    document.getElementById('detail-server-name').textContent = server.name;
    document.getElementById('detail-server-ip').innerHTML = `<i class="fas fa-network-wired"></i> IP Endpoint: ${server.ip}`;
    document.getElementById('detail-server-id').textContent = server.id;
    document.getElementById('detail-server-game').textContent = server.game;

    updateServerStatusUI(server);
    startTerminalLogSim(server);
    startStatsSimulation(server);

  } catch (err) {
    console.error(err);
  }
}

// Update status details
function updateServerStatusUI(server) {
  const badge = document.getElementById('detail-server-status');
  badge.textContent = server.status;
  badge.className = `status-badge ${server.status}`;

  document.getElementById('detail-server-uptime').textContent = server.status === 'online' ? (server.uptime || '5m 12s') : '0s';

  // Toggle Actions active states based on status
  document.getElementById('action-start').disabled = server.status === 'online';
  document.getElementById('action-restart').disabled = server.status !== 'online';
  document.getElementById('action-stop').disabled = server.status !== 'online';
}

// Streaming logs simulation
function startTerminalLogSim(server) {
  const terminal = document.getElementById('console-terminal-log');
  terminal.innerHTML = '';

  if (server.status === 'offline') {
    terminal.innerHTML = `[Console System]: Server container is stopped. Click START above to power up node.`;
    return;
  }

  const messages = [
    `[INFO] Booting server container on Node-Mumbai-4...`,
    `[INFO] Loading container resources... OK`,
    `[INFO] Attaching virtual port routing rules for IP ${server.ip}`,
    `[INFO] Launching game software engine: ${server.game}`,
    `[INFO] Loading world and custom mod plugins...`,
    `[INFO] Server query protocol initialized on port 25565`,
    `[INFO] Server started successfully in 2.341 seconds! Ready for connections.`
  ];

  let line = 0;
  function addLine() {
    if (line < messages.length) {
      terminal.innerHTML += messages[line] + '\n';
      terminal.scrollTop = terminal.scrollHeight;
      line++;
      setTimeout(addLine, 200 + Math.random() * 300);
    }
  }
  addLine();
}

// Dynamic resource meter updater
function startStatsSimulation(server) {
  if (statsInterval) clearInterval(statsInterval);

  const cpuText = document.getElementById('metric-cpu-text');
  const cpuFill = document.getElementById('metric-cpu-fill');
  
  const ramText = document.getElementById('metric-ram-text');
  const ramFill = document.getElementById('metric-ram-fill');

  const diskText = document.getElementById('metric-disk-text');
  const diskFill = document.getElementById('metric-disk-fill');

  // Static disk space
  const diskPct = (server.disk / server.diskMax) * 100;
  diskText.textContent = `${server.disk.toFixed(1)} GB / ${server.diskMax} GB`;
  diskFill.style.width = `${diskPct}%`;

  function update() {
    if (server.status !== 'online') {
      cpuText.textContent = `0%`;
      cpuFill.style.width = `0%`;
      ramText.textContent = `0 MB / ${server.ramMax} MB`;
      ramFill.style.width = `0%`;
      return;
    }

    const cpuVal = Math.floor(Math.random() * 25) + 8; // 8% - 33% CPU
    const ramOffset = Math.floor(Math.random() * 300) - 150;
    const ramVal = Math.round(server.ramMax * 0.48) + ramOffset; // ~48% RAM usage
    const ramPct = (ramVal / server.ramMax) * 100;

    cpuText.textContent = `${cpuVal}%`;
    cpuFill.style.width = `${cpuVal}%`;

    ramText.textContent = `${ramVal} MB / ${server.ramMax} MB`;
    ramFill.style.width = `${ramPct}%`;
  }

  update();
  statsInterval = setInterval(update, 2000);
}

// Server power buttons action triggers
async function triggerServerAction(action) {
  if (!currentServer) return;

  const terminal = document.getElementById('console-terminal-log');
  terminal.innerHTML += `\n[Console Action Request]: Sending container ${action.toUpperCase()} command...\n`;
  terminal.scrollTop = terminal.scrollHeight;

  try {
    const res = await fetch(`/api/servers/${currentServer.id}/action`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ action })
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || "Action trigger failed");

    currentServer.status = data.server.status;
    updateServerStatusUI(currentServer);
    startStatsSimulation(currentServer);

    if (action === 'start') {
      terminal.innerHTML += `\n[INFO] Starting node container container services...\n`;
      setTimeout(() => startTerminalLogSim(currentServer), 500);
    } else if (action === 'restart') {
      terminal.innerHTML += `\n[INFO] Initializing server reboot daemon...\n`;
      setTimeout(() => startTerminalLogSim(currentServer), 500);
    } else if (action === 'stop') {
      terminal.innerHTML += `\n[INFO] Sending SIGTERM to core threads. Saving server configuration.\n[INFO] Container offline. Uptime reset.\n`;
    }
    terminal.scrollTop = terminal.scrollHeight;
  } catch (err) {
    terminal.innerHTML += `[Console Error]: ${err.message}\n`;
    terminal.scrollTop = terminal.scrollHeight;
  }
}

document.getElementById('action-start').addEventListener('click', () => triggerServerAction('start'));
document.getElementById('action-restart').addEventListener('click', () => triggerServerAction('restart'));
document.getElementById('action-stop').addEventListener('click', () => triggerServerAction('stop'));

// Command Form Submission
document.getElementById('form-console-cmd').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('console-cmd-input');
  const command = input.value.trim();
  if (!command) return;

  const terminal = document.getElementById('console-terminal-log');
  terminal.innerHTML += `> ${command}\n`;
  terminal.scrollTop = terminal.scrollHeight;
  input.value = '';

  try {
    const res = await fetch(`/api/servers/${currentServer.id}/command`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ command })
    });
    const data = await res.json();
    
    terminal.innerHTML += `${data.response}\n`;
    terminal.scrollTop = terminal.scrollHeight;
  } catch (err) {
    terminal.innerHTML += `[Console Error]: Failed to send command.\n`;
    terminal.scrollTop = terminal.scrollHeight;
  }
});

// Expose managing function globally
window.manageServer = manageServer;

// Load lists on boot
loadServers();
