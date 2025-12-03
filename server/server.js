/**
 * MUD3 WebSocket-to-Telnet Proxy
 * Bridges browser WebSocket connections to MUD2 telnet server
 */

const WebSocket = require('ws');
const net = require('net');

// Configuration
const WS_PORT = process.env.PORT || 8080;
const MUD_HOST = process.env.MUD_HOST || 'mudii.co.uk';
const MUD_PORT = parseInt(process.env.MUD_PORT) || 23;
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',') 
  : null;

// Create WebSocket server
const wss = new WebSocket.Server({ 
  port: WS_PORT,
  verifyClient: (info, callback) => {
    // If no origins specified, allow all (development mode)
    if (!ALLOWED_ORIGINS) {
      callback(true);
      return;
    }
    
    const origin = info.origin || info.req.headers.origin;
    const allowed = ALLOWED_ORIGINS.some(o => origin?.startsWith(o.trim()));
    callback(allowed);
  }
});

console.log(`🎮 MUD3 Proxy starting...`);
console.log(`📡 WebSocket server listening on port ${WS_PORT}`);
console.log(`🏰 Target MUD server: ${MUD_HOST}:${MUD_PORT}`);

// Telnet command constants
const IAC = 255, DO = 253, DONT = 254, WILL = 251, WONT = 252;
const SB = 250, SE = 240;
const ECHO = 1, SUPPRESS_GA = 3, TERMINAL_TYPE = 24, NAWS = 31;

/**
 * Handle telnet negotiation commands and generate responses
 */
function handleTelnetNegotiation(data) {
  const responses = [];
  let i = 0;
  
  while (i < data.length) {
    if (data[i] === IAC && i + 2 < data.length) {
      const cmd = data[i + 1];
      const opt = data[i + 2];
      
      if (cmd === DO) {
        switch (opt) {
          case TERMINAL_TYPE:
            // Respond: WILL TERMINAL-TYPE
            responses.push(IAC, WILL, TERMINAL_TYPE);
            break;
          case NAWS:
            // Respond: WILL NAWS, then send window size
            responses.push(IAC, WILL, NAWS);
            // Send NAWS subnegotiation: 80x24
            responses.push(IAC, SB, NAWS, 0, 80, 0, 24, IAC, SE);
            break;
          case ECHO:
            // Respond: WONT ECHO (server should echo)
            responses.push(IAC, WONT, ECHO);
            break;
          default:
            // Respond: WONT for unsupported options
            responses.push(IAC, WONT, opt);
        }
        i += 3;
        continue;
      }
      
      if (cmd === WILL) {
        switch (opt) {
          case SUPPRESS_GA:
            // Respond: DO SUPPRESS-GO-AHEAD
            responses.push(IAC, DO, SUPPRESS_GA);
            break;
          case ECHO:
            // Respond: DO ECHO (let server echo)
            responses.push(IAC, DO, ECHO);
            break;
          default:
            // Respond: DONT for unsupported options
            responses.push(IAC, DONT, opt);
        }
        i += 3;
        continue;
      }
      
      // Handle SB (subnegotiation)
      if (cmd === SB) {
        // Find SE
        let j = i + 3;
        while (j < data.length - 1) {
          if (data[j] === IAC && data[j + 1] === SE) {
            break;
          }
          j++;
        }
        
        // Terminal type request
        if (opt === TERMINAL_TYPE && data[i + 3] === 1) { // SEND
          // Respond with terminal type "ansi"
          responses.push(IAC, SB, TERMINAL_TYPE, 0); // IS
          responses.push(97, 110, 115, 105); // "ansi"
          responses.push(IAC, SE);
        }
        
        i = j + 2;
        continue;
      }
    }
    i++;
  }
  
  return responses;
}

// Track active connections
let connectionCount = 0;

wss.on('connection', (ws, req) => {
  const clientId = ++connectionCount;
  const clientIP = req.socket.remoteAddress;
  console.log(`[${clientId}] New WebSocket connection from ${clientIP}`);
  
  // Create TCP connection to MUD server
  const mudSocket = net.createConnection({
    host: MUD_HOST,
    port: MUD_PORT
  });
  
  // Track connection state
  let connected = false;
  
  mudSocket.on('connect', () => {
    connected = true;
    console.log(`[${clientId}] Connected to MUD server`);
    
    // Notify client of successful connection
    ws.send(JSON.stringify({ 
      type: 'status', 
      status: 'connected',
      host: MUD_HOST 
    }));
  });
  
  // Relay data from MUD to WebSocket (as binary/arraybuffer)
  mudSocket.on('data', (data) => {
    // Handle telnet negotiation automatically
    const response = handleTelnetNegotiation(data);
    if (response && response.length > 0) {
      mudSocket.write(Buffer.from(response));
    }
    
    if (ws.readyState === WebSocket.OPEN) {
      // Send as binary to preserve all byte values
      ws.send(data);
    }
  });
  
  mudSocket.on('error', (err) => {
    console.log(`[${clientId}] MUD socket error:`, err.message);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ 
        type: 'status', 
        status: 'error', 
        message: err.message 
      }));
    }
  });
  
  mudSocket.on('close', () => {
    console.log(`[${clientId}] MUD connection closed`);
    connected = false;
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ 
        type: 'status', 
        status: 'disconnected' 
      }));
      ws.close();
    }
  });
  
  // Relay data from WebSocket to MUD
  ws.on('message', (message) => {
    if (!connected) {
      console.log(`[${clientId}] Ignoring message - not connected to MUD`);
      return;
    }
    
    // Handle both string and binary messages
    if (Buffer.isBuffer(message)) {
      mudSocket.write(message);
    } else {
      // Parse JSON commands from client
      try {
        const cmd = JSON.parse(message);
        if (cmd.type === 'data') {
          mudSocket.write(cmd.data);
        } else if (cmd.type === 'raw') {
          // Raw bytes as array
          mudSocket.write(Buffer.from(cmd.bytes));
        }
      } catch {
        // Plain text command - send directly
        mudSocket.write(message);
      }
    }
  });
  
  ws.on('close', () => {
    console.log(`[${clientId}] WebSocket closed`);
    if (connected) {
      mudSocket.end();
    }
  });
  
  ws.on('error', (err) => {
    console.log(`[${clientId}] WebSocket error:`, err.message);
    if (connected) {
      mudSocket.end();
    }
  });
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down proxy...');
  wss.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  wss.close(() => process.exit(0));
});
