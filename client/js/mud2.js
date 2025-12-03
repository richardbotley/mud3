/**
 * MUD2 Protocol Handler
 * Parses MUD2-specific client mode codes and extracts game state
 */

class MUD2Protocol {
  constructor() {
    // Player stats
    this.stats = {
      stamina: 0,
      maxStamina: 0,
      dexterity: 0,
      maxDexterity: 0,
      strength: 0,
      maxStrength: 0,
      magic: 0,
      maxMagic: 0,
      score: 0,
      weather: '',
      blind: false,
      deaf: false,
      crippled: false,
      dumb: false
    };
    
    // Account info
    this.account = {
      id: '',
      licence: '',
      privs: 0
    };
    
    // Dreamword
    this.dreamword = '';
    
    // Connection mode
    this.mode = 'TELNET'; // TELNET, CLIENT, GAME
    
    // Event callbacks
    this.onStatsUpdate = null;
    this.onModeChange = null;
    this.onDreamword = null;
    
    // MUD2 client code bytes (from Clio source)
    this.C = {};
    for (let i = 0; i <= 21; i++) {
      this.C[i] = 155 + i; // C00 = 155 (0x9B), C01 = 156, etc.
    }
    this.C[89] = 244; // 0xF4
    this.C[90] = 245; // 0xF5
    this.C[94] = 249; // 0xF9
    this.C[95] = 250; // 0xFA
    this.C[96] = 251; // 0xFB
    this.C[97] = 252; // 0xFC
    this.C[98] = 253; // 0xFD
    this.C[99] = 254; // 0xFE
    this.C[255] = 255; // 0xFF - terminator
  }
  
  /**
   * Parse raw data for MUD2 client codes
   * @param {Uint8Array} data - Raw bytes from server
   * @returns {Object} { cleanData: Uint8Array, commands: Array }
   */
  parse(data) {
    const commands = [];
    const cleanBytes = [];
    let i = 0;
    
    while (i < data.length) {
      const byte = data[i];
      
      // Check for MUD2 client codes (0x9B - 0xFE range)
      if (byte >= 155 && byte <= 254) {
        // Try to parse client code sequence
        const result = this.parseClientCode(data, i);
        if (result) {
          if (result.command) {
            commands.push(result.command);
          }
          i = result.nextIndex;
          continue;
        }
      }
      
      // Check for ESC - client mode codes
      if (byte === 0x1B && i + 2 < data.length && data[i + 1] === 0x2D) { // ESC -
        const code = data[i + 2];
        switch (code) {
          case 0x43: // C - Clear screen, enter client mode
            commands.push({ type: 'clear' });
            this.setMode('CLIENT');
            i += 3;
            continue;
          case 0x52: // R - Reverse on
            commands.push({ type: 'reverse', value: true });
            i += 3;
            continue;
          case 0x72: // r - Reverse off
            commands.push({ type: 'reverse', value: false });
            i += 3;
            continue;
          case 0x4B: // K - Clear to end of line
            commands.push({ type: 'clearLine' });
            i += 3;
            continue;
          case 0x54: // T - Text mode
            i += 3;
            continue;
        }
      }
      
      cleanBytes.push(byte);
      i++;
    }
    
    return {
      cleanData: new Uint8Array(cleanBytes),
      commands
    };
  }
  
  /**
   * Parse a MUD2 client code sequence
   */
  parseClientCode(data, start) {
    const byte = data[start];
    
    // Look for terminator (0xFF)
    let end = start + 1;
    while (end < data.length && data[end] !== 255) {
      end++;
      if (end - start > 20) break; // Safety limit
    }
    
    if (end >= data.length || data[end] !== 255) {
      return null; // No valid terminator found
    }
    
    // Extract the sequence
    const seq = data.slice(start, end + 1);
    const command = this.interpretClientCode(seq);
    
    return {
      command,
      nextIndex: end + 1
    };
  }
  
  /**
   * Interpret a client code sequence
   */
  interpretClientCode(seq) {
    if (seq.length < 2) return null;
    
    const first = seq[0];
    
    // C00 (155) - Start of game prompt/status
    if (first === 155) {
      return { type: 'promptStart' };
    }
    
    // C01 (156) - Prompt colors (blue)
    if (first === 156) {
      return { type: 'color', fg: 'blue' };
    }
    
    // C02 (157) - Game mode / green colors
    if (first === 157) {
      if (seq.length > 1 && seq[1] === 156) { // C02 C01
        this.setMode('GAME');
        return { type: 'color', fg: 'lightgreen' };
      }
      return { type: 'color', fg: 'green' };
    }
    
    // C03 (158) - Cyan colors
    if (first === 158) {
      return { type: 'color', fg: 'cyan' };
    }
    
    // C04 (159) - Magenta colors
    if (first === 159) {
      return { type: 'color', fg: 'magenta' };
    }
    
    // C05 (160) - Red colors
    if (first === 160) {
      return { type: 'color', fg: 'red' };
    }
    
    // C06 (161) - Magic events (blue)
    if (first === 161) {
      return { type: 'magic', fg: 'lightblue' };
    }
    
    // C07 (162) - Combat/damage (red)
    if (first === 162) {
      return { type: 'combat', fg: 'red' };
    }
    
    // C08 (163) - Various (death, etc.)
    if (first === 163) {
      return { type: 'event', fg: 'red' };
    }
    
    // C09 (164) - Yellow colors
    if (first === 164) {
      return { type: 'color', fg: 'yellow' };
    }
    
    // C12 (167) - FES (Front End Score) data
    if (first === 167 && seq.length > 2) {
      if (seq[1] === 163 && seq[2] === 156) { // C12 C08 C01
        // This is followed by stats data
        return { type: 'fesStart' };
      }
      return { type: 'color', fg: 'white' };
    }
    
    // C15 (170) - Dreamword
    if (first === 170) {
      return { type: 'dreamword', fg: 'black', bg: 'cyan' };
    }
    
    // C95 (250) - Client mode start with account info
    if (first === 250) {
      return { type: 'clientModeStart' };
    }
    
    // C99 (254) - Direct color codes
    if (first === 254) {
      if (seq.length >= 3) {
        const fg = seq[1] - 155;
        const bg = seq[2] - 155;
        return { type: 'colorDirect', fg, bg };
      }
    }
    
    return { type: 'unknown', code: first };
  }
  
  /**
   * Parse FES (Front End Score) line
   * Format: Sta cur max Str cur max Dex cur max Mag cur max Score Blind Deaf Crip Dumb Reset Weather
   */
  parseFES(text) {
    const parts = text.trim().split(/\s+/);
    
    if (parts.length >= 10) {
      this.stats.stamina = parseInt(parts[0]) || 0;
      this.stats.maxStamina = parseInt(parts[1]) || 0;
      this.stats.strength = parseInt(parts[2]) || 0;
      this.stats.maxStrength = parseInt(parts[3]) || 0;
      this.stats.dexterity = parseInt(parts[4]) || 0;
      this.stats.maxDexterity = parseInt(parts[5]) || 0;
      this.stats.magic = parseInt(parts[6]) || 0;
      this.stats.maxMagic = parseInt(parts[7]) || 0;
      this.stats.score = parseInt(parts[8]) || 0;
      
      if (parts.length > 9) this.stats.blind = parts[9] === 'Y';
      if (parts.length > 10) this.stats.deaf = parts[10] === 'Y';
      if (parts.length > 11) this.stats.crippled = parts[11] === 'Y';
      if (parts.length > 12) this.stats.dumb = parts[12] === 'Y';
      if (parts.length > 14) this.stats.weather = parts[14] || '';
      
      if (this.onStatsUpdate) {
        this.onStatsUpdate(this.stats);
      }
    }
  }
  
  /**
   * Try to parse stats from visible text (fallback)
   * Matches: "Sta:120/120 Dex:200/200 Str:200/200 Mag:120"
   */
  parseVisibleStats(text) {
    // Pattern for status line
    const staMatch = text.match(/Sta[:\s]*(\d+)[\/](\d+)/i);
    const dexMatch = text.match(/Dex[:\s]*(\d+)[\/](\d+)/i);
    const strMatch = text.match(/Str[:\s]*(\d+)[\/](\d+)/i);
    const magMatch = text.match(/Mag[:\s]*(\d+)/i);
    const ptsMatch = text.match(/Pts[:\s]*(\d+)/i);
    const weatherMatch = text.match(/(sunny|cloudy|raining|snowing|foggy|stormy)/i);
    
    let updated = false;
    
    if (staMatch) {
      this.stats.stamina = parseInt(staMatch[1]);
      this.stats.maxStamina = parseInt(staMatch[2]);
      updated = true;
    }
    if (dexMatch) {
      this.stats.dexterity = parseInt(dexMatch[1]);
      this.stats.maxDexterity = parseInt(dexMatch[2]);
      updated = true;
    }
    if (strMatch) {
      this.stats.strength = parseInt(strMatch[1]);
      this.stats.maxStrength = parseInt(strMatch[2]);
      updated = true;
    }
    if (magMatch) {
      this.stats.magic = parseInt(magMatch[1]);
      updated = true;
    }
    if (ptsMatch) {
      this.stats.score = parseInt(ptsMatch[1]);
      updated = true;
    }
    if (weatherMatch) {
      this.stats.weather = weatherMatch[1].toLowerCase();
      updated = true;
    }
    
    if (updated && this.onStatsUpdate) {
      this.onStatsUpdate(this.stats);
    }
    
    return updated;
  }
  
  /**
   * Set connection mode
   */
  setMode(mode) {
    if (this.mode !== mode) {
      this.mode = mode;
      if (this.onModeChange) {
        this.onModeChange(mode);
      }
    }
  }
  
  /**
   * Get current stats
   */
  getStats() {
    return { ...this.stats };
  }
  
  /**
   * Generate telnet negotiation responses
   */
  static getTelnetNegotiations() {
    // IAC WILL TERMINAL-TYPE
    // IAC WILL NAWS
    // IAC DO SUPPRESS-GO-AHEAD
    return new Uint8Array([
      255, 251, 24,  // IAC WILL TERMINAL-TYPE
      255, 251, 31,  // IAC WILL NAWS
      255, 253, 3    // IAC DO SUPPRESS-GO-AHEAD
    ]);
  }
  
  /**
   * Generate NAWS (window size) response
   */
  static getNAWS(width, height) {
    return new Uint8Array([
      255, 250, 31,           // IAC SB NAWS
      0, width & 0xFF,        // Width (high byte 0 for < 256)
      0, height & 0xFF,       // Height
      255, 240                // IAC SE
    ]);
  }
  
  /**
   * Generate terminal type response
   */
  static getTerminalType(type = 'ansi') {
    const bytes = [255, 250, 24, 0]; // IAC SB TERMINAL-TYPE IS
    for (let i = 0; i < type.length; i++) {
      bytes.push(type.charCodeAt(i));
    }
    bytes.push(255, 240); // IAC SE
    return new Uint8Array(bytes);
  }
  
  /**
   * Request client mode from MUD2
   */
  static getClientModeRequest() {
    // ESC ^F ESC - T
    return new Uint8Array([0x1B, 0x06, 0x1B, 0x2D, 0x54]);
  }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MUD2Protocol;
}

