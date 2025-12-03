/**
 * MUD3 - Browser-based MUD2 Client
 * Main Application
 */

class MUD3Client {
  constructor(options = {}) {
    this.options = {
      wsUrl: options.wsUrl || 'ws://localhost:8080',
      autoReconnect: options.autoReconnect !== false,
      reconnectDelay: options.reconnectDelay || 3000,
      ...options
    };
    
    this.ws = null;
    this.connected = false;
    this.reconnectTimer = null;
    
    // Components
    this.terminal = null;
    this.ansiParser = new ANSIParser();
    this.mud2 = new MUD2Protocol();
    
    // UI elements
    this.elements = {};
    
    // Command history
    this.history = [];
    this.historyIndex = -1;
    this.maxHistory = 100;
    
    // Settings
    this.settings = {
      theme: 'fantasy',
      showButtons: true,
      localEcho: false,
      fontSize: 14
    };
    
    this.loadSettings();
    this.init();
  }
  
  init() {
    // Get DOM elements
    this.elements = {
      terminal: document.getElementById('terminal'),
      input: document.getElementById('command-input'),
      sendBtn: document.getElementById('send-btn'),
      connectBtn: document.getElementById('connect-btn'),
      statusBar: document.getElementById('status-bar'),
      buttonPanel: document.getElementById('button-panel'),
      themeToggle: document.getElementById('theme-toggle'),
      buttonsToggle: document.getElementById('buttons-toggle'),
      connectionStatus: document.getElementById('connection-status'),
      // Stats elements
      statSta: document.getElementById('stat-sta'),
      statDex: document.getElementById('stat-dex'),
      statStr: document.getElementById('stat-str'),
      statMag: document.getElementById('stat-mag'),
      statPts: document.getElementById('stat-pts'),
      statWeather: document.getElementById('stat-weather')
    };
    
    // Initialize terminal
    this.terminal = new Terminal(this.elements.terminal, {
      fontSize: this.settings.fontSize + 'px'
    });
    
    // Set up MUD2 callbacks
    this.mud2.onStatsUpdate = (stats) => this.updateStatsDisplay(stats);
    this.mud2.onModeChange = (mode) => this.onModeChange(mode);
    
    // Bind events
    this.bindEvents();
    
    // Apply settings
    this.applyTheme(this.settings.theme);
    this.applyButtonVisibility(this.settings.showButtons);
    
    // Welcome message
    this.terminal.writeSystem('🏰 MUD3 Client - Welcome to The Land!');
    this.terminal.writeSystem('Click "Connect" or press Enter to connect to MUDII.');
  }
  
  bindEvents() {
    // Input handling
    this.elements.input.addEventListener('keydown', (e) => this.handleInputKey(e));
    this.elements.sendBtn?.addEventListener('click', () => this.sendCommand());
    this.elements.connectBtn?.addEventListener('click', () => this.toggleConnection());
    
    // Quick command buttons
    document.querySelectorAll('[data-cmd]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const cmd = e.target.closest('[data-cmd]').dataset.cmd;
        this.sendCommand(cmd);
      });
    });
    
    // Theme toggle
    this.elements.themeToggle?.addEventListener('click', () => {
      this.settings.theme = this.settings.theme === 'fantasy' ? 'dark' : 'fantasy';
      this.applyTheme(this.settings.theme);
      this.saveSettings();
    });
    
    // Buttons toggle
    this.elements.buttonsToggle?.addEventListener('click', () => {
      this.settings.showButtons = !this.settings.showButtons;
      this.applyButtonVisibility(this.settings.showButtons);
      this.saveSettings();
    });
    
    // Focus input on terminal click
    this.elements.terminal.addEventListener('click', () => {
      this.elements.input.focus();
    });
    
    // Handle paste
    this.elements.input.addEventListener('paste', (e) => {
      // Allow paste but trim newlines
      setTimeout(() => {
        this.elements.input.value = this.elements.input.value.replace(/[\r\n]/g, '');
      }, 0);
    });
  }
  
  handleInputKey(e) {
    switch (e.key) {
      case 'Enter':
        e.preventDefault();
        if (!this.connected) {
          this.connect();
        } else {
          this.sendCommand();
        }
        break;
        
      case 'ArrowUp':
        e.preventDefault();
        this.navigateHistory(-1);
        break;
        
      case 'ArrowDown':
        e.preventDefault();
        this.navigateHistory(1);
        break;
        
      case 'Escape':
        this.elements.input.value = '';
        this.historyIndex = -1;
        break;
    }
  }
  
  navigateHistory(direction) {
    if (this.history.length === 0) return;
    
    this.historyIndex += direction;
    
    if (this.historyIndex < 0) {
      this.historyIndex = -1;
      this.elements.input.value = '';
      return;
    }
    
    if (this.historyIndex >= this.history.length) {
      this.historyIndex = this.history.length - 1;
    }
    
    this.elements.input.value = this.history[this.history.length - 1 - this.historyIndex];
    
    // Move cursor to end
    setTimeout(() => {
      this.elements.input.selectionStart = this.elements.input.value.length;
    }, 0);
  }
  
  addToHistory(cmd) {
    if (!cmd.trim()) return;
    
    // Don't add duplicates
    if (this.history[this.history.length - 1] !== cmd) {
      this.history.push(cmd);
      if (this.history.length > this.maxHistory) {
        this.history.shift();
      }
    }
    this.historyIndex = -1;
  }
  
  // ==================== Connection ====================
  
  connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }
    
    this.terminal.writeSystem(`Connecting to ${this.options.wsUrl}...`);
    this.setConnectionStatus('connecting');
    
    try {
      this.ws = new WebSocket(this.options.wsUrl);
      this.ws.binaryType = 'arraybuffer';
      
      this.ws.onopen = () => this.onOpen();
      this.ws.onmessage = (e) => this.onMessage(e);
      this.ws.onclose = (e) => this.onClose(e);
      this.ws.onerror = (e) => this.onError(e);
    } catch (err) {
      this.terminal.writeSystem(`Connection error: ${err.message}`);
      this.setConnectionStatus('disconnected');
    }
  }
  
  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.connected = false;
    this.setConnectionStatus('disconnected');
  }
  
  toggleConnection() {
    if (this.connected) {
      this.disconnect();
    } else {
      this.connect();
    }
  }
  
  onOpen() {
    this.connected = true;
    this.terminal.writeSystem('Connected to proxy server.');
    this.setConnectionStatus('connected');
    this.elements.input.focus();
  }
  
  onMessage(event) {
    // Check if it's a status message (JSON)
    if (typeof event.data === 'string') {
      try {
        const msg = JSON.parse(event.data);
        this.handleStatusMessage(msg);
        return;
      } catch {
        // Not JSON, treat as text
      }
    }
    
    // Binary data from MUD
    const data = new Uint8Array(event.data);
    
    // Process through MUD2 protocol handler
    const { cleanData, commands } = this.mud2.parse(data);
    
    // Handle MUD2 commands
    for (const cmd of commands) {
      this.handleMUD2Command(cmd);
    }
    
    // Parse ANSI and display
    const segments = this.ansiParser.parse(cleanData);
    this.terminal.writeSegments(segments);
    
    // Try to parse stats from visible text
    const text = this.ansiParser.bytesToString(cleanData);
    this.mud2.parseVisibleStats(text);
  }
  
  handleStatusMessage(msg) {
    switch (msg.status) {
      case 'connected':
        this.terminal.writeSystem(`Connected to MUD server: ${msg.host}`);
        // Send terminal type and window size
        this.sendRaw(MUD2Protocol.getTerminalType('ansi'));
        this.sendRaw(MUD2Protocol.getNAWS(80, 24));
        break;
        
      case 'disconnected':
        this.terminal.writeSystem('Disconnected from MUD server.');
        this.connected = false;
        this.setConnectionStatus('disconnected');
        this.scheduleReconnect();
        break;
        
      case 'error':
        this.terminal.writeSystem(`Error: ${msg.message}`);
        break;
    }
  }
  
  handleMUD2Command(cmd) {
    switch (cmd.type) {
      case 'clear':
        this.terminal.clear();
        break;
      case 'fesStart':
        // Next line will be FES data
        break;
      case 'dreamword':
        // Dreamword incoming
        break;
    }
  }
  
  onClose(event) {
    this.connected = false;
    this.terminal.writeSystem('Connection closed.');
    this.setConnectionStatus('disconnected');
    
    if (this.options.autoReconnect && !event.wasClean) {
      this.scheduleReconnect();
    }
  }
  
  onError(event) {
    this.terminal.writeSystem('Connection error occurred.');
    console.error('WebSocket error:', event);
  }
  
  scheduleReconnect() {
    if (this.reconnectTimer) return;
    
    this.terminal.writeSystem(`Reconnecting in ${this.options.reconnectDelay / 1000} seconds...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.options.reconnectDelay);
  }
  
  // ==================== Sending ====================
  
  sendCommand(cmd = null) {
    const command = cmd || this.elements.input.value;
    
    if (!this.connected) {
      this.terminal.writeSystem('Not connected. Press Enter to connect.');
      return;
    }
    
    // Add to history
    this.addToHistory(command);
    
    // Local echo (optional)
    if (this.settings.localEcho) {
      this.terminal.write(command + '\n', 'local-echo');
    }
    
    // Send to server with CRLF
    this.send(command + '\r\n');
    
    // Clear input
    this.elements.input.value = '';
    this.elements.input.focus();
  }
  
  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
  }
  
  sendRaw(bytes) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(bytes);
    }
  }
  
  // ==================== UI Updates ====================
  
  setConnectionStatus(status) {
    const el = this.elements.connectionStatus;
    const btn = this.elements.connectBtn;
    
    if (el) {
      el.className = 'status-indicator ' + status;
      el.textContent = status.charAt(0).toUpperCase() + status.slice(1);
    }
    
    if (btn) {
      btn.textContent = status === 'connected' ? 'Disconnect' : 'Connect';
      btn.className = status === 'connected' ? 'btn-disconnect' : 'btn-connect';
    }
  }
  
  updateStatsDisplay(stats) {
    const { statSta, statDex, statStr, statMag, statPts, statWeather } = this.elements;
    
    if (statSta) {
      statSta.textContent = `${stats.stamina}/${stats.maxStamina}`;
      statSta.className = this.getStatClass(stats.stamina, stats.maxStamina);
    }
    if (statDex) {
      statDex.textContent = `${stats.dexterity}/${stats.maxDexterity}`;
    }
    if (statStr) {
      statStr.textContent = `${stats.strength}/${stats.maxStrength}`;
    }
    if (statMag) {
      statMag.textContent = stats.magic;
    }
    if (statPts) {
      statPts.textContent = stats.score.toLocaleString();
    }
    if (statWeather) {
      statWeather.textContent = stats.weather || '—';
      statWeather.className = 'weather-' + (stats.weather || 'unknown');
    }
  }
  
  getStatClass(current, max) {
    const ratio = current / max;
    if (ratio <= 0.25) return 'stat-critical';
    if (ratio <= 0.5) return 'stat-low';
    if (ratio <= 0.75) return 'stat-medium';
    return 'stat-good';
  }
  
  onModeChange(mode) {
    this.terminal.writeSystem(`[Mode: ${mode}]`);
    
    // Show/hide game-specific UI based on mode
    if (mode === 'GAME') {
      document.body.classList.add('in-game');
    } else {
      document.body.classList.remove('in-game');
    }
  }
  
  // ==================== Settings ====================
  
  applyTheme(theme) {
    document.body.setAttribute('data-theme', theme);
    
    const icon = this.elements.themeToggle?.querySelector('.theme-icon');
    if (icon) {
      icon.textContent = theme === 'fantasy' ? '🌙' : '🏰';
    }
  }
  
  applyButtonVisibility(show) {
    if (this.elements.buttonPanel) {
      this.elements.buttonPanel.classList.toggle('hidden', !show);
    }
    
    const icon = this.elements.buttonsToggle?.querySelector('.toggle-icon');
    if (icon) {
      icon.textContent = show ? '◀' : '▶';
    }
  }
  
  loadSettings() {
    try {
      const saved = localStorage.getItem('mud3-settings');
      if (saved) {
        Object.assign(this.settings, JSON.parse(saved));
      }
    } catch (e) {
      console.warn('Failed to load settings:', e);
    }
  }
  
  saveSettings() {
    try {
      localStorage.setItem('mud3-settings', JSON.stringify(this.settings));
    } catch (e) {
      console.warn('Failed to save settings:', e);
    }
  }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  // Get WebSocket URL from config or URL params
  const params = new URLSearchParams(window.location.search);
  const wsUrl = params.get('ws') || window.MUD3_CONFIG?.wsUrl || 'ws://localhost:8080';
  
  window.mud3 = new MUD3Client({ wsUrl });
});

