/**
 * Pterodactyl Panel Integration Helper for Bulk Node
 */

const PANEL_URL = process.env.PTERODACTYL_URL || 'https://clients.bulknodes.xyz';
const APP_KEY = process.env.PTERODACTYL_APP_KEY || 'ptla_wqPia9dkh78BgDKXNCGQmvxAAaNrRgKhQcSrFWKXANX';
const CLIENT_KEY = process.env.PTERODACTYL_CLIENT_KEY || '';

// Supported Nest & Egg Mapping based on panel exploration
const GAME_CONFIGS = {
  "Minecraft": {
    nestId: 1,
    eggId: 2, // Paper
    dockerImage: "ghcr.io/pterodactyl/yolks:java_25",
    startup: "java -Xms128M -XX:MaxRAMPercentage=95.0 -Dterminal.jline=false -Dterminal.ansi=true -jar {{SERVER_JARFILE}}",
    environment: {
      "MINECRAFT_VERSION": "latest",
      "SERVER_JARFILE": "server.jar",
      "DL_PATH": "",
      "BUILD_NUMBER": "latest"
    }
  },
  "Minecraft Bedrock": {
    nestId: 1,
    eggId: 3, // Vanilla Minecraft
    dockerImage: "ghcr.io/pterodactyl/yolks:java_25",
    startup: "java -Xms128M -XX:MaxRAMPercentage=95.0 -jar {{SERVER_JARFILE}}",
    environment: {
      "SERVER_JARFILE": "server.jar",
      "VANILLA_VERSION": "latest"
    }
  },
  "ARK": {
    nestId: 2,
    eggId: 6, // Ark: Survival Evolved
    dockerImage: "ghcr.io/pterodactyl/games:source",
    startup: "rmv() { echo  \"stopping server\"; rcon -t rcon -a 127.0.0.1:${RCON_PORT} -p ${ARK_ADMIN_PASSWORD} saveworld &&rcon -t rcon -a 127.0.0.1:${RCON_PORT} -p ${ARK_ADMIN_PASSWORD} DoExit && wait ${ARK_PID}; echo \"Server Closed\"; exit; }; trap rmv 15 2; cd ShooterGame/Binaries/Linux && ./ShooterGameServer {{SERVER_MAP}}?listen?SessionName=\"{{SESSION_NAME}}\"?ServerPassword={{ARK_PASSWORD}}?ServerAdminPassword={{ARK_ADMIN_PASSWORD}}?Port={{SERVER_PORT}}?RCONPort={{RCON_PORT}}?QueryPort={{QUERY_PORT}}?RCONEnabled=True?MaxPlayers={{MAX_PLAYERS}}?GameModIds={{MOD_ID}}$( [ \"$BATTLE_EYE\" == \"1\" ] || printf %s ' -NoBattlEye' ) -server -automanagedmods {{ARGS}} -log & ARK_PID=$! ; until echo \"waiting for rcon connection...\"; (rcon -t rcon -a 127.0.0.1:${RCON_PORT} -p ${ARK_ADMIN_PASSWORD})<&0 & wait $!; do sleep 5; done",
    environment: {
      "ARK_PASSWORD": "",
      "ARK_ADMIN_PASSWORD": "PleaseChangeMe123!",
      "SERVER_MAP": "TheIsland",
      "SESSION_NAME": "A Pterodactyl Hosted ARK Server",
      "RCON_PORT": "27020",
      "QUERY_PORT": "27015",
      "AUTO_UPDATE": "0",
      "BATTLE_EYE": "1",
      "SRCDS_APPID": "376030",
      "ARGS": "",
      "MOD_ID": "",
      "MAX_PLAYERS": "12"
    }
  },
  "Garry's Mod": {
    nestId: 2,
    eggId: 11, // Garrys Mod
    dockerImage: "ghcr.io/pterodactyl/games:source",
    startup: "./srcds_run -game garrysmod -console -port {{SERVER_PORT}} +ip 0.0.0.0 +host_workshop_collection {{WORKSHOP_ID}} +map {{SRCDS_MAP}} +gamemode {{GAMEMODE}} -strictportbind -norestart +sv_setsteamaccount {{STEAM_ACC}} +maxplayers {{MAX_PLAYERS}}  -tickrate {{TICKRATE}}  $( [ \"$LUA_REFRESH\" == \"1\" ] || printf %s '-disableluarefresh' )",
    environment: {
      "SRCDS_MAP": "gm_flatgrass",
      "STEAM_ACC": "",
      "SRCDS_APPID": "4020",
      "WORKSHOP_ID": "",
      "GAMEMODE": "sandbox",
      "MAX_PLAYERS": "32",
      "TICKRATE": "22",
      "LUA_REFRESH": "0"
    }
  },
  "CS2": {
    nestId: 2,
    eggId: 9, // CS:GO (CS2 fallback)
    dockerImage: "ghcr.io/pterodactyl/games:source",
    startup: "./srcds_run -game csgo -console -port {{SERVER_PORT}} +ip 0.0.0.0 +map {{SRCDS_MAP}} -strictportbind -norestart +sv_setsteamaccount {{STEAM_ACC}}",
    environment: {
      "SRCDS_MAP": "de_dust2",
      "STEAM_ACC": "1234567890abcdef1234567890abcdef", // Required 32 alpha-numeric
      "SRCDS_APPID": "740"
    }
  },
  "Rust": {
    nestId: 4,
    eggId: 14, // Rust
    dockerImage: "ghcr.io/pterodactyl/games:rust",
    startup: "./RustDedicated -batchmode +server.port {{SERVER_PORT}} +server.queryport {{QUERY_PORT}} +server.identity \"rust\" +rcon.port {{RCON_PORT}} +rcon.web true +server.hostname \"{{HOSTNAME}}\" +server.level \"{{LEVEL}}\" +server.description \"{{DESCRIPTION}}\" +server.url \"{{SERVER_URL}}\" +server.headerimage \"{{SERVER_IMG}}\" +server.logoimage \"{{SERVER_LOGO}}\" +server.maxplayers {{MAX_PLAYERS}} +rcon.password \"{{RCON_PASS}}\" +server.saveinterval {{SAVEINTERVAL}} +app.port {{APP_PORT}}  $( [ -z ${MAP_URL} ] && printf %s \"+server.worldsize \\\"{{WORLD_SIZE}}\\\" +server.seed \\\"{{WORLD_SEED}}\\\"\" || printf %s \"+server.levelurl {{MAP_URL}}\" ) {{ADDITIONAL_ARGS}}",
    environment: {
      "HOSTNAME": "A Rust Server",
      "FRAMEWORK": "vanilla",
      "LEVEL": "Procedural Map",
      "DESCRIPTION": "Powered by Pterodactyl",
      "SERVER_URL": "http://pterodactyl.io",
      "WORLD_SIZE": "3000",
      "WORLD_SEED": "",
      "MAX_PLAYERS": "40",
      "SERVER_IMG": "",
      "QUERY_PORT": "27017",
      "RCON_PORT": "28016",
      "RCON_PASS": "SecretRustPassword123",
      "SAVEINTERVAL": "60",
      "ADDITIONAL_ARGS": "",
      "APP_PORT": "28082",
      "SERVER_LOGO": "",
      "MAP_URL": ""
    }
  }
};

/**
 * Perform a generic call to Pterodactyl Application API
 */
async function callApplicationAPI(endpoint, method = 'GET', body = null) {
  const url = `${PANEL_URL}${endpoint}`;
  try {
    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${APP_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };
    if (body) {
      options.body = JSON.stringify(body);
    }

    const res = await fetch(url, options);
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Pterodactyl API error: HTTP ${res.status} - ${errText}`);
    }

    if (res.status === 204) return true; // No Content
    return await res.json();
  } catch (err) {
    console.error(`Error in callApplicationAPI (${method} ${endpoint}):`, err.message);
    throw err;
  }
}

/**
 * Perform a generic call to Pterodactyl Client API
 */
async function callClientAPI(endpoint, method = 'GET', body = null) {
  if (!CLIENT_KEY) {
    throw new Error("Client API Key (PTERODACTYL_CLIENT_KEY) is not configured in .env. Server control is currently in Simulator Mode.");
  }
  const url = `${PANEL_URL}${endpoint}`;
  try {
    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${CLIENT_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };
    if (body) {
      options.body = JSON.stringify(body);
    }

    const res = await fetch(url, options);
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Pterodactyl Client API error: HTTP ${res.status} - ${errText}`);
    }

    if (res.status === 204) return true; // No Content
    return await res.json();
  } catch (err) {
    console.error(`Error in callClientAPI (${method} ${endpoint}):`, err.message);
    throw err;
  }
}

/**
 * Get or create a Pterodactyl user
 */
async function getOrCreatePterodactylUser(email, name) {
  // 1. Search for user by email
  const searchUrl = `/api/application/users?filter[email]=${encodeURIComponent(email.toLowerCase())}`;
  const usersList = await callApplicationAPI(searchUrl);
  
  if (usersList && usersList.data && usersList.data.length > 0) {
    console.log(`Found existing Pterodactyl user: ${email} (ID: ${usersList.data[0].attributes.id})`);
    return usersList.data[0].attributes.id;
  }

  // 2. Create user if not found
  console.log(`Pterodactyl user not found. Creating user: ${email}`);
  const username = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '') + Math.floor(Math.random() * 100);
  const first = name.split(' ')[0] || 'Client';
  const last = name.split(' ').slice(1).join(' ') || 'User';

  const userPayload = {
    email: email.toLowerCase(),
    username: username,
    first_name: first,
    last_name: last
  };

  const newUser = await callApplicationAPI('/api/application/users', 'POST', userPayload);
  return newUser.attributes.id;
}

/**
 * Finds a free allocation ID on Node 2 (Free-Bharat)
 */
async function findFreeAllocation(nodeId = 2) {
  const allocs = await callApplicationAPI(`/api/application/nodes/${nodeId}/allocations`);
  if (!allocs || !allocs.data) {
    throw new Error(`Failed to retrieve allocations for Node ${nodeId}`);
  }

  const free = allocs.data.filter(a => !a.attributes.assigned);
  if (free.length === 0) {
    throw new Error(`All allocations on Node ${nodeId} are currently assigned. Cannot deploy server.`);
  }

  // Pick first free allocation
  return {
    id: free[0].attributes.id,
    ip: free[0].attributes.ip === '0.0.0.0' ? 'frees.bulknodes.xyz' : free[0].attributes.ip,
    port: free[0].attributes.port
  };
}

/**
 * Deploy a server to Pterodactyl Panel
 */
async function deployServerToPterodactyl({ name, email, userName, plan, gameName, ramMb, diskGb }) {
  console.log(`🚀 Starting Pterodactyl deployment for server: ${name} (${gameName})`);
  
  // 1. Map game to panel nest/egg configuration
  const configKey = Object.keys(GAME_CONFIGS).find(k => k.toLowerCase() === gameName.toLowerCase()) || "Minecraft";
  const gameConfig = GAME_CONFIGS[configKey];

  // 2. Find or create Pterodactyl user
  const pteroUserId = await getOrCreatePterodactylUser(email, userName);

  // 3. Find free allocation on Node 2
  const allocation = await findFreeAllocation(2);

  // 4. Build Server Creation payload
  const payload = {
    name: name,
    user: pteroUserId,
    egg: gameConfig.eggId,
    docker_image: gameConfig.dockerImage,
    startup: gameConfig.startup,
    environment: gameConfig.environment,
    limits: {
      memory: ramMb,
      swap: 0,
      disk: diskGb * 1024, // Convert GB to MB for Pterodactyl
      io: 500,
      cpu: 100
    },
    feature_limits: {
      databases: 0,
      allocations: 0,
      backups: 0
    },
    allocation: {
      default: allocation.id,
      additional: []
    }
  };

  // 5. POST to Pterodactyl Application API
  const serverRes = await callApplicationAPI('/api/application/servers', 'POST', payload);
  
  if (!serverRes || !serverRes.attributes) {
    throw new Error("Failed to deploy server - invalid API response payload");
  }

  const attr = serverRes.attributes;
  console.log(`✅ Server deployed successfully! ID: ${attr.id} | Identifier: ${attr.identifier}`);

  return {
    pteroId: attr.id,
    pteroUuid: attr.uuid,
    pteroIdentifier: attr.identifier,
    ip: `${allocation.ip}:${allocation.port}`,
    location: "Mumbai, India (Node: Free-Bharat)",
  };
}

/**
 * Trigger Client Power Actions on Pterodactyl Server
 */
async function triggerPteroPowerAction(serverIdentifier, action) {
  console.log(`Sending client power signal [${action}] to server: ${serverIdentifier}`);
  
  const signal = action === 'start' ? 'start' : action === 'stop' ? 'stop' : 'restart';
  const url = `/api/client/servers/${serverIdentifier}/power`;
  
  await callClientAPI(url, 'POST', { signal });
  return true;
}

/**
 * Send Console Commands to Pterodactyl Server
 */
async function sendPteroConsoleCommand(serverIdentifier, command) {
  console.log(`Sending console command [${command}] to server: ${serverIdentifier}`);
  
  const url = `/api/client/servers/${serverIdentifier}/command`;
  
  await callClientAPI(url, 'POST', { command });
  return `[Pterodactyl Panel]: Command sent successfully.`;
}

/**
 * Reset Pterodactyl user password using a generated strong password
 */
async function resetPterodactylUserPassword(email, name) {
  // 1. Search for user by email
  const searchUrl = `/api/application/users?filter[email]=${encodeURIComponent(email.toLowerCase())}`;
  const usersList = await callApplicationAPI(searchUrl);
  
  let userDetails = null;
  
  if (usersList && usersList.data && usersList.data.length > 0) {
    userDetails = usersList.data[0].attributes;
  } else {
    // If not found, let's create the user first
    const newUserId = await getOrCreatePterodactylUser(email, name);
    // Fetch details
    const newUser = await callApplicationAPI(`/api/application/users/${newUserId}`);
    userDetails = newUser.attributes;
  }
  
  // 2. Generate a strong password according to Pterodactyl rules
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const digits = "0123456789";
  const specials = "!@#$^*()_+-=";
  
  let password = "";
  password += upper[Math.floor(Math.random() * upper.length)];
  password += lower[Math.floor(Math.random() * lower.length)];
  password += digits[Math.floor(Math.random() * digits.length)];
  password += specials[Math.floor(Math.random() * specials.length)];
  
  const allChars = upper + lower + digits + specials;
  for (let i = 0; i < 12; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }
  password = password.split('').sort(() => 0.5 - Math.random()).join('');
  password = "Bn_" + password;
  
  // 3. PATCH the password
  const updatePayload = {
    email: userDetails.email,
    username: userDetails.username,
    first_name: userDetails.first_name,
    last_name: userDetails.last_name,
    password: password
  };
  
  await callApplicationAPI(`/api/application/users/${userDetails.id}`, 'PATCH', updatePayload);
  
  return password;
}

module.exports = {
  deployServerToPterodactyl,
  triggerPteroPowerAction,
  sendPteroConsoleCommand,
  resetPterodactylUserPassword
};
