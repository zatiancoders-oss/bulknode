require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'bulknode_super_secret_jwt_key_2026';
const DB_PATH = path.join(__dirname, 'data', 'db.json');

app.use(cors());
app.use(express.json());

// Serve static assets from root and public directories
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

function writeDB(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error("Error writing database file", err);
  }
}

// Ensure database file exists
if (!fs.existsSync(DB_PATH)) {
  fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
  writeDB({ users: [], servers: [], tickets: [] });
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
      return res.status(500).json({ error: "Database transaction failed" });
    }
  } else {
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
      return res.status(500).json({ error: "Database server error" });
    }
  } else {
    const db = readDB();
    user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  }

  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(400).json({ error: "Invalid email or password" });
  }

  const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
});

// --- Server Management Endpoints ---

// Get User's Servers
app.get('/api/servers', authenticateToken, async (req, res) => {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('servers')
        .select('*')
        .eq('user_id', req.user.id);

      if (error) throw error;
      
      // Convert database snake_case keys to camelCase for front-end compatibility
      const formatted = data.map(s => ({
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
      res.json(formatted);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch servers" });
    }
  } else {
    const db = readDB();
    const userServers = db.servers.filter(s => s.userId === req.user.id);
    res.json(userServers);
  }
});

// Order/Deploy Server instance
app.post('/api/servers', authenticateToken, async (req, res) => {
  const { name, plan, type, game } = req.body;
  if (!name || !plan || !type) {
    return res.status(400).json({ error: "Missing required parameters" });
  }

  const isVps = type.toLowerCase() === 'vps';
  let ramMax = 4096, diskMax = 40;
  if (plan === 'Starter') { ramMax = 2048; diskMax = 20; }
  else if (plan === 'Pro') { ramMax = 6144; diskMax = 50; }
  else if (plan === 'Elite') { ramMax = 16384; diskMax = 100; }
  else if (plan === 'Nano VPS') { ramMax = 2048; diskMax = 30; }
  else if (plan === 'Pro VPS') { ramMax = 8192; diskMax = 80; }
  else if (plan === 'Ultra VPS') { ramMax = 16384; diskMax = 200; }

  const serverId = 'srv_' + Math.random().toString(36).substr(2, 9);
  const newServerData = {
    id: serverId,
    name,
    type,
    game: game || (isVps ? "Ubuntu 22.04 LTS" : "Minecraft"),
    plan,
    ip: `103.150.186.${Math.floor(Math.random() * 240) + 10}${isVps ? "" : ":25565"}`,
    location: "Mumbai, India",
    status: "online",
    cpu: 0,
    ram: 0,
    uptime: "0s"
  };

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

      res.status(201).json({ ...newServerData, userId: req.user.id, ramMax, disk: 0.1, diskMax });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to create server node in remote database" });
    }
  } else {
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
    res.status(201).json(localServer);
  }
});

// Server Power Action
app.post('/api/servers/:id/action', authenticateToken, async (req, res) => {
  const { action } = req.body;
  const { id } = req.params;

  if (!['start', 'stop', 'restart'].includes(action)) {
    return res.status(400).json({ error: "Invalid action" });
  }

  let status = 'online';
  let cpu = 0;
  let ram = 0;
  let uptime = '0s';

  if (action === 'stop') {
    status = 'offline';
  } else if (action === 'start') {
    uptime = '10s';
  } else if (action === 'restart') {
    uptime = '5s';
  }

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('servers')
        .update({ status, cpu, ram, uptime })
        .eq('id', id)
        .eq('user_id', req.user.id)
        .select()
        .maybeSingle();

      if (error) throw error;
      if (!data) return res.status(404).json({ error: "Server not found" });

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
      console.error(err);
      res.status(500).json({ error: "Failed to update action" });
    }
  } else {
    const db = readDB();
    const serverIndex = db.servers.findIndex(s => s.id === id && s.userId === req.user.id);
    if (serverIndex === -1) return res.status(404).json({ error: "Server not found" });

    const server = db.servers[serverIndex];
    server.status = status;
    server.cpu = cpu;
    server.ram = ram;
    server.uptime = uptime;

    db.servers[serverIndex] = server;
    writeDB(db);
    res.json({ success: true, server });
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

  let responseText = `[Command Executed]: ${command}\n`;

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
    responseText += `Memory usage: ${server.ram || 0}/${server.ram_max || server.ramMax}MB\nDisk space: ${server.disk}/${server.disk_max || server.diskMax}GB\nNetwork load: 45.2 KB/s`;
  } else if (cmd === 'version') {
    responseText += `Running: ${server.game} Engine (v1.20.4 Patch-2)`;
  } else {
    responseText += `[Console]: Command parsed successfully. Engine: OK.`;
  }

  res.json({ response: responseText });
});

// --- Support Ticket Endpoints ---

// Get Support Tickets
app.get('/api/tickets', authenticateToken, async (req, res) => {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .eq('user_id', req.user.id);

      if (error) throw error;
      
      const formatted = data.map(t => ({
        id: t.id,
        userId: t.user_id,
        title: t.title,
        category: t.category,
        status: t.status,
        createdAt: t.created_at,
        messages: t.messages
      }));
      res.json(formatted);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch tickets" });
    }
  } else {
    const db = readDB();
    const userTickets = db.tickets.filter(t => t.userId === req.user.id);
    res.json(userTickets);
  }
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

      res.status(201).json(newTicketData);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to file ticket" });
    }
  } else {
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

      res.json({
        id: data.id,
        userId: data.user_id,
        title: data.title,
        category: data.category,
        status: data.status,
        createdAt: data.created_at,
        messages: data.messages
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to reply to ticket" });
    }
  } else {
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

// Catch-all to serve index.html for UI refresh
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
