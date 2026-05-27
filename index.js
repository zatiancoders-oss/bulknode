require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const {
  deployServerToPterodactyl,
  triggerPteroPowerAction,
  sendPteroConsoleCommand,
  resetPterodactylUserPassword
} = require('./pterodactyl');

const ZenuxsPayments = require('zenuxs-payments');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'bulknode_super_secret_jwt_key_2026';
const DB_PATH = path.join(__dirname, 'data', 'db.json');

app.use(cors());
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

// Serve static assets from root and public directories (for local dev fallback)
app.use(express.static(__dirname));
app.use('/public', express.static(path.join(__dirname, 'public')));

// Initialize Supabase if keys are provided
let supabase = null;
const useSupabase = process.env.SUPABASE_URL && process.env.SUPABASE_KEY;

if (useSupabase) {
  try {
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
    console.log("🚀 Connected to Supabase DB!");
  } catch (err) {
    console.error("Failed to initialize Supabase client. Falling back to local DB.", err);
    supabase = null;
  }
} else {
  console.log("📁 Supabase keys not detected in .env. Using local JSON database (fallback mode).");
}

// Initialize Zenuxs Payments client
const zenuxsClient = new ZenuxsPayments({
  apiKey: process.env.ZENUXS_API_KEY || 'zpk_live_placeholder',
  apiSecret: process.env.ZENUXS_API_SECRET || 'zps_live_placeholder',
  webhookSecret: process.env.ZENUXS_WEBHOOK_SECRET || 'zws_placeholder'
});

// Database Helpers (Local Fallback)
function readDB() {
  try {
    const data = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error("Error reading database file", err);
    return { users: [], servers: [], tickets: [] };
  }
}

// Write Database Helpers (Local Fallback)
function writeDB(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error("Error writing database file", err);
  }
}

// Ensure database file exists
try {
  if (!fs.existsSync(DB_PATH)) {
    fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
    writeDB({ users: [], servers: [], tickets: [] });
  }
} catch (err) {
  console.warn("⚠️ Read-only filesystem detected (Vercel Serverless environment). Local JSON DB persistence will be unavailable. Database operations will use Supabase remote storage.");
}

// --- Middleware: Verify JWT Token ---
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: "Access denied. No token provided." });

  if (token === 'usr_demo') {
    req.user = { id: 'usr_demo', email: 'demo@bulknode.com', name: 'Demo Client' };
    return next();
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Invalid token" });
    req.user = user;
    next();
  });
}

// --- Authentication Endpoints ---

// Register
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: "Please fill in all fields" });
  }

  const hashedPassword = bcrypt.hashSync(password, 10);
  const userId = 'usr_' + Math.random().toString(36).substr(2, 9);
  const newUser = {
    id: userId,
    name,
    email: email.toLowerCase(),
    password: hashedPassword,
    created_at: new Date().toISOString()
  };

  let isLocalRegistered = false;

  if (supabase) {
    try {
      // Check existing email
      const { data: existingUser } = await supabase
        .from('users')
        .select('*')
        .eq('email', email.toLowerCase())
        .maybeSingle();

      if (existingUser) {
        return res.status(400).json({ error: "User already exists with this email" });
      }

      // Insert new user
      const { error } = await supabase.from('users').insert([newUser]);
      if (error) throw error;

    } catch (err) {
      console.error("Supabase Register Error:", err);
      if (err.code === 'PGRST205') {
        console.warn("⚠️ Users table not found in Supabase! Falling back to local JSON database.");
        isLocalRegistered = true;
      } else {
        return res.status(500).json({ error: "Database transaction failed" });
      }
    }
  }

  if (!supabase || isLocalRegistered) {
    // Local JSON
    const db = readDB();
    const existingUser = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (existingUser) {
      return res.status(400).json({ error: "User already exists with this email" });
    }
    db.users.push(newUser);
    writeDB(db);
  }

  const token = jwt.sign({ id: newUser.id, email: newUser.email, name: newUser.name }, JWT_SECRET, { expiresIn: '24h' });
  res.status(201).json({ token, user: { id: newUser.id, name: newUser.name, email: newUser.email } });
});

// Login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Please enter email and password" });
  }

  // Demo user login logic
  if (email === 'demo@bulknode.com' && password === 'demo123') {
    return res.json({
      token: 'usr_demo',
      user: { id: 'usr_demo', name: 'Demo Client', email: 'demo@bulknode.com' }
    });
  }

  let user = null;
  let useLocalLogin = false;

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', email.toLowerCase())
        .maybeSingle();

      if (error) throw error;
      user = data;
    } catch (err) {
      console.error("Supabase Login Error:", err);
      if (err.code === 'PGRST205') {
        console.warn("⚠️ Users table not found in Supabase! Falling back to local JSON database.");
        useLocalLogin = true;
      } else {
        return res.status(500).json({ error: "Database server error" });
      }
    }
  }

  if (!supabase || useLocalLogin) {
    const db = readDB();
    user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  }

  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(400).json({ error: "Invalid email or password" });
  }

  const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
});

// Helper function to activate server after payment verification
async function activateServer(serverId) {
  console.log(`🔌 Attempting to activate server: ${serverId}`);
  let server = null;
  let useLocal = false;
  
  if (supabase) {
    try {
      const { data, error } = await supabase.from('servers').select('*').eq('id', serverId).maybeSingle();
      if (error) throw error;
      server = data;
    } catch (err) {
      console.error("Supabase fetch failed during activation:", err);
      useLocal = true;
    }
  }
  
  if (!supabase || useLocal) {
    const db = readDB();
    server = db.servers.find(s => s.id === serverId);
  }
  
  if (!server) {
    console.error(`Activation failed: Server ${serverId} not found.`);
    return;
  }
  
  // If already activated, return
  if (server.status !== 'pending_payment') {
    console.log(`Server ${serverId} is already activated. Status: ${server.status || server.status}`);
    return;
  }
  
  // Run provisioning
  const isVps = server.type.toLowerCase() === 'vps';
  const supportedGames = ["minecraft", "minecraft bedrock", "ark", "garry's mod", "cs2", "rust"];
  const isSupportedByPtero = supportedGames.includes(server.game.toLowerCase()) && !isVps;
  
  let ip = server.ip;
  let location = server.location;
  let status = "online";
  
  if (isSupportedByPtero) {
    try {
      // Find the user email and name from database
      let user = null;
      if (supabase && !useLocal) {
        const { data } = await supabase.from('users').select('*').eq('id', server.user_id).maybeSingle();
        user = data;
      } else {
        const db = readDB();
        user = db.users.find(u => u.id === server.user_id);
      }
      
      const email = user ? user.email : 'demo@bulknode.com';
      const userName = user ? user.name : 'Client User';
      
      const pteroServer = await deployServerToPterodactyl({
        name: server.name,
        email: email,
        userName: userName,
        plan: server.plan,
        gameName: server.game,
        ramMb: server.ram_max || server.ramMax || 4096,
        diskGb: server.disk_max || server.diskMax || 40
      });
      
      ip = pteroServer.ip;
      location = pteroServer.location;
      status = "installing";
    } catch (err) {
      console.error(`❌ Async Pterodactyl Deployment Failed for server ${serverId}:`, err.message);
      status = "suspended";
    }
  }
  
  // Save updated server status
  if (supabase && !useLocal) {
    try {
      await supabase.from('servers').update({ status, ip, location }).eq('id', serverId);
    } catch (err) {
      console.error("Failed to update server activation in Supabase:", err);
    }
  } else {
    const db = readDB();
    const serverIndex = db.servers.findIndex(s => s.id === serverId);
    if (serverIndex !== -1) {
      db.servers[serverIndex].status = status;
      db.servers[serverIndex].ip = ip;
      db.servers[serverIndex].location = location;
      writeDB(db);
    }
  }
  console.log(`✅ Server ${serverId} has been activated successfully! Status: ${status}`);
}

// --- Server Management Endpoints ---

// Get User's Servers
app.get('/api/servers', authenticateToken, async (req, res) => {
  let userServers = null;
  let useLocalServers = false;

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('servers')
        .select('*')
        .eq('user_id', req.user.id);

      if (error) throw error;
      
      // Convert database snake_case keys to camelCase for front-end compatibility
      userServers = data.map(s => ({
        id: s.id,
        userId: s.user_id,
        name: s.name,
        type: s.type,
        game: s.game,
        plan: s.plan,
        ip: s.ip,
        location: s.location,
        status: s.status,
        cpu: s.cpu,
        ram: s.ram,
        ramMax: s.ram_max,
        disk: Number(s.disk),
        diskMax: s.disk_max,
        uptime: s.uptime
      }));
    } catch (err) {
      console.error("Supabase Servers List Error:", err);
      if (err.code === 'PGRST205') {
        console.warn("⚠️ Servers table not found in Supabase! Falling back to local JSON database.");
        useLocalServers = true;
      } else {
        return res.status(500).json({ error: "Failed to fetch servers" });
      }
    }
  }

  if (!supabase || useLocalServers) {
    const db = readDB();
    userServers = db.servers.filter(s => s.userId === req.user.id);
  }

  res.json(userServers);
});

// Order/Deploy Server instance
app.post('/api/servers', authenticateToken, async (req, res) => {
  const { name, plan, type, game } = req.body;
  if (!name || !plan || !type) {
    return res.status(400).json({ error: "Missing required parameters" });
  }

  const isVps = type.toLowerCase() === 'vps';
  let ramMax = 4096, diskMax = 40;
  let price = 0;
  
  if (plan === 'Free Plan' || plan === 'Free') { ramMax = 6144; diskMax = 7; price = 0; }
  else if (plan === 'Starter') { ramMax = 2048; diskMax = 20; price = 249; }
  else if (plan === 'Pro') { ramMax = 6144; diskMax = 50; price = 599; }
  else if (plan === 'Elite') { ramMax = 16384; diskMax = 100; price = 1499; }
  else if (plan === 'Nano VPS') { ramMax = 2048; diskMax = 30; price = 199; }
  else if (plan === 'Pro VPS') { ramMax = 8192; diskMax = 80; price = 499; }
  else if (plan === 'Ultra VPS') { ramMax = 16384; diskMax = 200; price = 999; }

  const selectedGame = game || (isVps ? "Ubuntu 22.04 LTS" : "Minecraft");
  const supportedGames = ["minecraft", "minecraft bedrock", "ark", "garry's mod", "cs2", "rust"];
  const isSupportedByPtero = supportedGames.includes(selectedGame.toLowerCase()) && !isVps;

  // Free plan deploys immediately
  if (price === 0) {
    let ip = `103.150.186.${Math.floor(Math.random() * 240) + 10}${isVps ? "" : ":25565"}`;
    let location = "Mumbai, India";
    let pteroId = null;
    let pteroUuid = null;
    let pteroIdentifier = null;

    if (isSupportedByPtero) {
      try {
        const pteroServer = await deployServerToPterodactyl({
          name,
          email: req.user.email,
          userName: req.user.name,
          plan,
          gameName: selectedGame,
          ramMb: ramMax,
          diskGb: diskMax
        });
        ip = pteroServer.ip;
        location = pteroServer.location;
        pteroId = pteroServer.pteroId;
        pteroUuid = pteroServer.pteroUuid;
        pteroIdentifier = pteroServer.pteroIdentifier;
      } catch (err) {
        console.error("❌ Pterodactyl Deployment Failed:", err.message);
        return res.status(500).json({ error: `Pterodactyl Panel Deployment Failed: ${err.message}` });
      }
    }

    const serverId = pteroIdentifier ? pteroIdentifier : 'srv_' + Math.random().toString(36).substr(2, 9);
    
    const newServerData = {
      id: serverId,
      name,
      type,
      game: selectedGame,
      plan,
      ip,
      location,
      status: isSupportedByPtero ? "installing" : "online",
      cpu: 0,
      ram: 0,
      uptime: "0s"
    };

    let useLocalCreation = false;

    if (supabase) {
      try {
        const dbInsert = {
          id: serverId,
          user_id: req.user.id,
          name: newServerData.name,
          type: newServerData.type,
          game: newServerData.game,
          plan: newServerData.plan,
          ip: newServerData.ip,
          location: newServerData.location,
          status: newServerData.status,
          cpu: newServerData.cpu,
          ram: newServerData.ram,
          ram_max: ramMax,
          disk: 0.1,
          disk_max: diskMax,
          uptime: newServerData.uptime
        };
        
        const { error } = await supabase.from('servers').insert([dbInsert]);
        if (error) throw error;

        return res.status(201).json({ ...newServerData, userId: req.user.id, ramMax, disk: 0.1, diskMax });
      } catch (err) {
        console.error("Supabase Server Creation Error:", err);
        if (err.code === 'PGRST205') {
          console.warn("⚠️ Servers table not found in Supabase! Falling back to local JSON database.");
          useLocalCreation = true;
        } else {
          return res.status(500).json({ error: "Failed to create server node in remote database" });
        }
      }
    }

    if (!supabase || useLocalCreation) {
      const db = readDB();
      const localServer = {
        ...newServerData,
        userId: req.user.id,
        ramMax,
        disk: 0.1,
        diskMax
      };
      db.servers.push(localServer);
      writeDB(db);
      return res.status(201).json(localServer);
    }
  }

  // Paid plans go into pending_payment
  const serverId = 'srv_' + Math.random().toString(36).substr(2, 9);
  const newServerData = {
    id: serverId,
    name,
    type,
    game: selectedGame,
    plan,
    ip: "Pending Payment",
    location: "Pending Payment",
    status: "pending_payment",
    cpu: 0,
    ram: 0,
    uptime: "0s"
  };

  let useLocalCreation = false;

  if (supabase) {
    try {
      const dbInsert = {
        id: serverId,
        user_id: req.user.id,
        name: newServerData.name,
        type: newServerData.type,
        game: newServerData.game,
        plan: newServerData.plan,
        ip: newServerData.ip,
        location: newServerData.location,
        status: newServerData.status,
        cpu: newServerData.cpu,
        ram: newServerData.ram,
        ram_max: ramMax,
        disk: 0.1,
        disk_max: diskMax,
        uptime: newServerData.uptime
      };
      
      const { error } = await supabase.from('servers').insert([dbInsert]);
      if (error) throw error;
    } catch (err) {
      console.error("Supabase Server Creation Error (paid):", err);
      if (err.code === 'PGRST205') {
        useLocalCreation = true;
      } else {
        return res.status(500).json({ error: "Failed to create server node in remote database" });
      }
    }
  }

  if (!supabase || useLocalCreation) {
    const db = readDB();
    const localServer = {
      ...newServerData,
      userId: req.user.id,
      ramMax,
      disk: 0.1,
      diskMax
    };
    db.servers.push(localServer);
    writeDB(db);
  }

  // Create payment via Zenuxs Payments
  const hasZenuxsConfig = process.env.ZENUXS_API_KEY && 
                           !process.env.ZENUXS_API_KEY.includes('xxxx') && 
                           !process.env.ZENUXS_API_KEY.includes('placeholder');
  
  if (hasZenuxsConfig) {
    try {
      const order = await zenuxsClient.createPayment({
        amount: price,
        purpose: `BulkNode ${plan} Server`,
        payerName: req.user.name,
        payerEmail: req.user.email,
        note: `serverId:${serverId}`
      });
      
      const paymentUrl = order.paymentLink || (order.data && order.data.paymentLink) || 
                         order.url || (order.data && order.data.url) || 
                         order.checkoutUrl || (order.data && order.data.checkoutUrl);
      
      if (paymentUrl) {
        return res.status(201).json({
          success: true,
          paymentRequired: true,
          paymentUrl: paymentUrl,
          serverId: serverId
        });
      } else if (order.orderId || (order.data && order.data.orderId)) {
        return res.status(201).json({
          success: true,
          paymentRequired: true,
          orderId: order.orderId || order.data.orderId,
          keyId: order.keyId || order.data.keyId,
          amount: order.amount || order.data.amount,
          serverId: serverId
        });
      } else {
        throw new Error("Invalid response payload from Zenuxs Payments Gateway");
      }
    } catch (err) {
      console.error("❌ Zenuxs Payment Creation Failed:", err.message);
      return res.status(500).json({ error: `Payment gateway error: ${err.message}` });
    }
  } else {
    // Simulator Mode Fallback
    const paymentUrl = `/public/simulator-payment.html?serverId=${serverId}&price=${price}&plan=${encodeURIComponent(plan)}`;
    return res.status(201).json({
      success: true,
      paymentRequired: true,
      paymentUrl: paymentUrl,
      serverId: serverId
    });
  }
});

// Server Power Action
app.post('/api/servers/:id/action', authenticateToken, async (req, res) => {
  const { action } = req.body;
  const { id } = req.params;

  if (!['start', 'stop', 'restart'].includes(action)) {
    return res.status(400).json({ error: "Invalid action" });
  }

  let server = null;
  const isPtero = !id.startsWith('srv_');
  let useLocalAction = false;

  // Verify ownership
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('servers')
        .select('*')
        .eq('id', id)
        .eq('user_id', req.user.id)
        .maybeSingle();
      if (error) throw error;
      server = data;
    } catch (err) {
      console.error("Supabase ownership query failed:", err);
      if (err.code === 'PGRST205') {
        console.warn("⚠️ Servers table not found in Supabase! Falling back to local JSON database.");
        useLocalAction = true;
      } else {
        return res.status(500).json({ error: "Database query failed" });
      }
    }
  }

  if (!supabase || useLocalAction) {
    const db = readDB();
    server = db.servers.find(s => s.id === id && s.userId === req.user.id);
  }

  if (!server) {
    return res.status(404).json({ error: "Server not found or access denied" });
  }

  let status = action === 'stop' ? 'offline' : 'online';
  let cpu = action === 'stop' ? 0 : 15;
  let ramMaxVal = server.ram_max || server.ramMax || 4096;
  let ram = action === 'stop' ? 0 : Math.round(ramMaxVal * 0.45);
  let uptime = action === 'stop' ? '0s' : '1m';

  if (isPtero) {
    try {
      await triggerPteroPowerAction(id, action);
    } catch (err) {
      // If client key is not configured, we return a fallback warning but let the simulator succeed so they don't get stuck
      if (err.message.includes("Client API Key")) {
        console.warn(`⚠️ Client power actions are in simulator mode: ${err.message}`);
      } else {
        return res.status(500).json({ error: `Pterodactyl power action failed: ${err.message}` });
      }
    }
  }

  let useLocalUpdate = useLocalAction;

  if (supabase && !useLocalUpdate) {
    try {
      const { data, error } = await supabase
        .from('servers')
        .update({ status, cpu, ram, uptime })
        .eq('id', id)
        .eq('user_id', req.user.id)
        .select()
        .maybeSingle();

      if (error) throw error;
      res.json({
        success: true,
        server: {
          id: data.id,
          userId: data.user_id,
          name: data.name,
          type: data.type,
          game: data.game,
          plan: data.plan,
          ip: data.ip,
          location: data.location,
          status: data.status,
          cpu: data.cpu,
          ram: data.ram,
          ramMax: data.ram_max,
          disk: Number(data.disk),
          diskMax: data.disk_max,
          uptime: data.uptime
        }
      });
    } catch (err) {
      console.error("Supabase action update failed:", err);
      if (err.code === 'PGRST205') {
        useLocalUpdate = true;
      } else {
        res.status(500).json({ error: "Failed to update action state in remote database" });
      }
    }
  }

  if (!supabase || useLocalUpdate) {
    const db = readDB();
    const serverIndex = db.servers.findIndex(s => s.id === id && s.userId === req.user.id);
    if (serverIndex === -1) return res.status(404).json({ error: "Server not found" });
    const srv = db.servers[serverIndex];
    srv.status = status;
    srv.cpu = cpu;
    srv.ram = ram;
    srv.uptime = uptime;
    db.servers[serverIndex] = srv;
    writeDB(db);
    res.json({ success: true, server: srv });
  }
});

// Server Command Console Simulator
app.post('/api/servers/:id/command', authenticateToken, async (req, res) => {
  const { command } = req.body;
  const { id } = req.params;

  if (!command) return res.status(400).json({ error: "Command required" });

  let server = null;

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('servers')
        .select('*')
        .eq('id', id)
        .eq('user_id', req.user.id)
        .maybeSingle();

      if (error) throw error;
      server = data;
    } catch (err) {
      console.error(err);
    }
  } else {
    const db = readDB();
    server = db.servers.find(s => s.id === id && s.userId === req.user.id);
  }

  if (!server) return res.status(404).json({ error: "Server not found" });

  const isPtero = !id.startsWith('srv_');
  let responseText = '';

  if (isPtero) {
    try {
      responseText = await sendPteroConsoleCommand(id, command);
      return res.json({ response: responseText });
    } catch (err) {
      if (err.message.includes("Client API Key")) {
        console.warn(`⚠️ Client console commands are in simulator mode: ${err.message}`);
      } else {
        return res.status(500).json({ error: `Pterodactyl command failed: ${err.message}` });
      }
    }
  }

  // Simulator Fallback
  responseText = `[Simulator Command Executed]: ${command}\n`;
  if (server.status !== 'online') {
    responseText += `[Error]: Cannot run commands. Server is offline.`;
    return res.json({ response: responseText });
  }

  const cmd = command.toLowerCase().trim();
  if (cmd.startsWith('help')) {
    responseText += `Available Commands: \n- help : show this list\n- op <player> : grant admin permissions\n- say <msg> : broadcast alert to all players\n- status : view technical health diagnostics\n- version : view engine version`;
  } else if (cmd.startsWith('op ')) {
    const player = command.split(' ')[1] || 'Player';
    responseText += `[Info]: Made ${player} a server operator.`;
  } else if (cmd.startsWith('say ')) {
    const msg = command.substring(4);
    responseText += `[Broadcast] [Admin]: ${msg}`;
  } else if (cmd === 'status') {
    const maxRam = server.ram_max || server.ramMax || 4096;
    const maxDisk = server.disk_max || server.diskMax || 40;
    responseText += `Memory usage: ${server.ram || 0}/${maxRam}MB\nDisk space: ${server.disk || 0.1}/${maxDisk}GB\nNetwork load: 45.2 KB/s`;
  } else if (cmd === 'version') {
    responseText += `Running: ${server.game} Engine (v1.20.4 Patch-2)`;
  } else {
    responseText += `[Console]: Command parsed successfully. Engine: OK.`;
  }

  res.json({ response: responseText });
});

// Reset Pterodactyl Password for current logged in user
app.post('/api/user/reset-panel-password', authenticateToken, async (req, res) => {
  try {
    const password = await resetPterodactylUserPassword(req.user.email, req.user.name);
    res.json({ success: true, password });
  } catch (err) {
    console.error("❌ Pterodactyl Password Reset Failed:", err.message);
    res.status(500).json({ error: `Pterodactyl Password Reset Failed: ${err.message}` });
  }
});

// Zenuxs Payments Webhook Receiver
app.post('/api/payments/webhook', async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  const hasWebhookSecret = process.env.ZENUXS_WEBHOOK_SECRET && 
                           !process.env.ZENUXS_WEBHOOK_SECRET.includes('xxxx') && 
                           !process.env.ZENUXS_WEBHOOK_SECRET.includes('placeholder');
  
  if (hasWebhookSecret && signature) {
    try {
      const isValid = zenuxsClient.verifyWebhookSignature(req.rawBody, signature);
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid webhook signature' });
      }
      
      const event = JSON.parse(req.rawBody.toString('utf8'));
      if (event.event === 'payment.captured') {
        const paymentEntity = event.payload.payment.entity;
        const notes = paymentEntity.notes || {};
        
        let serverId = notes.serverId;
        if (!serverId && paymentEntity.description) {
          const match = paymentEntity.description.match(/srv_[a-z0-9]+/i);
          if (match) serverId = match[0];
        }
        
        if (serverId) {
          console.log(`💳 Webhook captured payment for Server: ${serverId}`);
          await activateServer(serverId);
        }
      }
      return res.json({ received: true });
    } catch (err) {
      console.error("Webhook processing error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  } else {
    // Return 200 to prevent Zenuxs from retrying if unconfigured, but log a warning
    console.warn("⚠️ Webhook received but credentials or signature headers are missing in env.");
    return res.status(200).json({ warning: "Webhooks unconfigured or invalid headers" });
  }
});

// Simulate Payment Success Sandbox Route
app.post('/api/payments/simulate-success', async (req, res) => {
  const { serverId } = req.body;
  if (!serverId) return res.status(400).json({ error: "Server ID required" });
  
  try {
    await activateServer(serverId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Support Ticket Endpoints ---

// Get Support Tickets
app.get('/api/tickets', authenticateToken, async (req, res) => {
  let userTickets = null;
  let useLocalTickets = false;

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .eq('user_id', req.user.id);

      if (error) throw error;
      
      userTickets = data.map(t => ({
        id: t.id,
        userId: t.user_id,
        title: t.title,
        category: t.category,
        status: t.status,
        createdAt: t.created_at,
        messages: t.messages
      }));
    } catch (err) {
      console.error("Supabase Tickets List Error:", err);
      if (err.code === 'PGRST205') {
        console.warn("⚠️ Tickets table not found in Supabase! Falling back to local JSON database.");
        useLocalTickets = true;
      } else {
        return res.status(500).json({ error: "Failed to fetch tickets" });
      }
    }
  }

  if (!supabase || useLocalTickets) {
    const db = readDB();
    userTickets = db.tickets.filter(t => t.userId === req.user.id);
  }

  res.json(userTickets);
});

// Create Support Ticket
app.post('/api/tickets', authenticateToken, async (req, res) => {
  const { title, category, message } = req.body;
  if (!title || !category || !message) {
    return res.status(400).json({ error: "All fields are required" });
  }

  const ticketId = 'tkt_' + Math.floor(Math.random() * 1000 + 1000);
  const newTicketData = {
    id: ticketId,
    title,
    category,
    status: 'open',
    createdAt: new Date().toISOString(),
    messages: [
      {
        sender: 'user',
        message: message,
        time: new Date().toISOString()
      }
    ]
  };

  let useLocalCreateTicket = false;

  if (supabase) {
    try {
      const dbInsert = {
        id: ticketId,
        user_id: req.user.id,
        title,
        category,
        status: 'open',
        created_at: newTicketData.createdAt,
        messages: newTicketData.messages
      };

      const { error } = await supabase.from('tickets').insert([dbInsert]);
      if (error) throw error;

      return res.status(201).json(newTicketData);
    } catch (err) {
      console.error("Supabase Ticket Creation Error:", err);
      if (err.code === 'PGRST205') {
        console.warn("⚠️ Tickets table not found in Supabase! Falling back to local JSON database.");
        useLocalCreateTicket = true;
      } else {
        return res.status(500).json({ error: "Failed to file ticket" });
      }
    }
  }

  if (!supabase || useLocalCreateTicket) {
    const db = readDB();
    const localTicket = {
      ...newTicketData,
      userId: req.user.id
    };
    db.tickets.push(localTicket);
    writeDB(db);
    res.status(201).json(localTicket);
  }
});

// Reply to Ticket
app.post('/api/tickets/:id/reply', authenticateToken, async (req, res) => {
  const { message } = req.body;
  const { id } = req.params;

  if (!message) return res.status(400).json({ error: "Message is required" });

  let useLocalReplyTicket = false;

  if (supabase) {
    try {
      // Get existing ticket messages
      const { data: ticket, error: getErr } = await supabase
        .from('tickets')
        .select('*')
        .eq('id', id)
        .eq('user_id', req.user.id)
        .maybeSingle();

      if (getErr) throw getErr;
      if (!ticket) return res.status(404).json({ error: "Ticket not found" });

      const updatedMessages = [...ticket.messages, {
        sender: 'user',
        message,
        time: new Date().toISOString()
      }];

      const { data, error: updateErr } = await supabase
        .from('tickets')
        .update({ messages: updatedMessages, status: 'open' })
        .eq('id', id)
        .eq('user_id', req.user.id)
        .select()
        .maybeSingle();

      if (updateErr) throw updateErr;

      return res.json({
        id: data.id,
        userId: data.user_id,
        title: data.title,
        category: data.category,
        status: data.status,
        createdAt: data.created_at,
        messages: data.messages
      });
    } catch (err) {
      console.error("Supabase Ticket Reply Error:", err);
      if (err.code === 'PGRST205') {
        console.warn("⚠️ Tickets table not found in Supabase! Falling back to local JSON database.");
        useLocalReplyTicket = true;
      } else {
        return res.status(500).json({ error: "Failed to reply to ticket" });
      }
    }
  }

  if (!supabase || useLocalReplyTicket) {
    const db = readDB();
    const ticketIndex = db.tickets.findIndex(t => t.id === id && t.userId === req.user.id);
    if (ticketIndex === -1) return res.status(404).json({ error: "Ticket not found" });

    const ticket = db.tickets[ticketIndex];
    ticket.messages.push({
      sender: 'user',
      message,
      time: new Date().toISOString()
    });
    ticket.status = 'open';

    db.tickets[ticketIndex] = ticket;
    writeDB(db);
    res.json(ticket);
  }
});

// Catch-all to serve index.html for UI refresh (for local testing runs)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});

module.exports = app;
