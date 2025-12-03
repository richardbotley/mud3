/**
 * ANSI Escape Code Parser for MUD2
 * Handles color codes, cursor movement, and screen control
 */

class ANSIParser {
  constructor() {
    // Standard ANSI colors (0-7 normal, 8-15 bright)
    this.colors = {
      0: '#000000',  // Black
      1: '#aa0000',  // Red
      2: '#00aa00',  // Green
      3: '#aa5500',  // Yellow/Brown
      4: '#0000aa',  // Blue
      5: '#aa00aa',  // Magenta
      6: '#00aaaa',  // Cyan
      7: '#aaaaaa',  // White
      8: '#555555',  // Bright Black (Gray)
      9: '#ff5555',  // Bright Red
      10: '#55ff55', // Bright Green
      11: '#ffff55', // Bright Yellow
      12: '#5555ff', // Bright Blue
      13: '#ff55ff', // Bright Magenta
      14: '#55ffff', // Bright Cyan
      15: '#ffffff'  // Bright White
    };
    
    // Current text attributes
    this.reset();
  }
  
  reset() {
    this.foreground = 7;  // White
    this.background = 0;  // Black
    this.bold = false;
    this.reverse = false;
  }
  
  getForegroundColor() {
    let fg = this.foreground;
    if (this.bold && fg < 8) {
      fg += 8; // Make bright
    }
    if (this.reverse) {
      return this.colors[this.background] || this.colors[0];
    }
    return this.colors[fg] || this.colors[7];
  }
  
  getBackgroundColor() {
    if (this.reverse) {
      let fg = this.foreground;
      if (this.bold && fg < 8) fg += 8;
      return this.colors[fg] || this.colors[7];
    }
    return this.colors[this.background] || this.colors[0];
  }
  
  /**
   * Parse SGR (Select Graphic Rendition) parameters
   * @param {string} params - Semicolon-separated SGR codes
   */
  parseSGR(params) {
    if (!params || params === '' || params === '0') {
      this.reset();
      return;
    }
    
    const codes = params.split(';').map(n => parseInt(n, 10));
    
    for (const code of codes) {
      if (isNaN(code)) continue;
      
      switch (code) {
        case 0: // Reset
          this.reset();
          break;
        case 1: // Bold
          this.bold = true;
          break;
        case 7: // Reverse
          this.reverse = true;
          break;
        case 22: // Normal intensity
          this.bold = false;
          break;
        case 27: // Reverse off
          this.reverse = false;
          break;
        // Foreground colors
        case 30: this.foreground = 0; break;
        case 31: this.foreground = 1; break;
        case 32: this.foreground = 2; break;
        case 33: this.foreground = 3; break;
        case 34: this.foreground = 4; break;
        case 35: this.foreground = 5; break;
        case 36: this.foreground = 6; break;
        case 37: this.foreground = 7; break;
        case 39: this.foreground = 7; break; // Default
        // Background colors
        case 40: this.background = 0; break;
        case 41: this.background = 1; break;
        case 42: this.background = 2; break;
        case 43: this.background = 3; break;
        case 44: this.background = 4; break;
        case 45: this.background = 5; break;
        case 46: this.background = 6; break;
        case 47: this.background = 7; break;
        case 49: this.background = 0; break; // Default
        // Bright foreground (non-standard but common)
        case 90: this.foreground = 8; break;
        case 91: this.foreground = 9; break;
        case 92: this.foreground = 10; break;
        case 93: this.foreground = 11; break;
        case 94: this.foreground = 12; break;
        case 95: this.foreground = 13; break;
        case 96: this.foreground = 14; break;
        case 97: this.foreground = 15; break;
      }
    }
  }
  
  /**
   * Parse a data buffer and return styled segments
   * @param {Uint8Array|string} data - Raw data from server
   * @returns {Array} Array of {text, fg, bg, clear, newline, bell, cursorMove}
   */
  parse(data) {
    const segments = [];
    let buffer = '';
    let i = 0;
    
    // Convert to string if needed, preserving bytes
    const str = typeof data === 'string' ? data : this.bytesToString(data);
    
    // Pre-filter telnet IAC sequences
    const filtered = this.filterTelnet(str);
    
    while (i < filtered.length) {
      const char = filtered[i];
      const charCode = filtered.charCodeAt(i);
      
      // ESC sequence
      if (charCode === 0x1B) {
        // Flush buffer
        if (buffer) {
          segments.push({
            text: buffer,
            fg: this.getForegroundColor(),
            bg: this.getBackgroundColor()
          });
          buffer = '';
        }
        
        // Check next character
        if (i + 1 < filtered.length) {
          const next = filtered[i + 1];
          
          if (next === '[') {
            // CSI sequence
            let j = i + 2;
            let params = '';
            
            // Collect parameters
            while (j < filtered.length) {
              const c = filtered.charCodeAt(j);
              if (c >= 0x30 && c <= 0x3F) { // 0-9, ;, <, =, >, ?
                params += filtered[j];
                j++;
              } else {
                break;
              }
            }
            
            // Get final byte
            if (j < filtered.length) {
              const finalByte = filtered[j];
              
              switch (finalByte) {
                case 'm': // SGR - colors/attributes
                  this.parseSGR(params);
                  break;
                case 'H': // Cursor position
                case 'f':
                  segments.push({ cursorMove: params || '1;1' });
                  break;
                case 'J': // Clear screen
                  if (params === '' || params === '2') {
                    segments.push({ clear: 'screen' });
                  }
                  break;
                case 'K': // Clear line
                  segments.push({ clear: 'line' });
                  break;
                case 'A': // Cursor up
                case 'B': // Cursor down
                case 'C': // Cursor forward
                case 'D': // Cursor back
                  segments.push({ cursorMove: finalByte + (params || '1') });
                  break;
              }
              
              i = j + 1;
              continue;
            }
          } else if (next === '-') {
            // MUD2 client mode code - handled separately
            // Pass through for MUD2 parser
            buffer += filtered.substring(i, i + 3);
            i += 3;
            continue;
          }
        }
        
        i++;
        continue;
      }
      
      // Bell character
      if (charCode === 0x07) {
        if (buffer) {
          segments.push({
            text: buffer,
            fg: this.getForegroundColor(),
            bg: this.getBackgroundColor()
          });
          buffer = '';
        }
        segments.push({ bell: true });
        i++;
        continue;
      }
      
      // Carriage return
      if (charCode === 0x0D) {
        i++;
        continue; // Skip CR, we handle LF
      }
      
      // Line feed
      if (charCode === 0x0A) {
        if (buffer) {
          segments.push({
            text: buffer,
            fg: this.getForegroundColor(),
            bg: this.getBackgroundColor()
          });
          buffer = '';
        }
        segments.push({ newline: true });
        i++;
        continue;
      }
      
      // Regular printable character
      if (charCode >= 0x20 && charCode < 0x7F) {
        buffer += char;
      } else if (charCode >= 0x80) {
        // High bytes - could be MUD2 client codes or extended chars
        buffer += char;
      }
      
      i++;
    }
    
    // Flush remaining buffer
    if (buffer) {
      segments.push({
        text: buffer,
        fg: this.getForegroundColor(),
        bg: this.getBackgroundColor()
      });
    }
    
    return segments;
  }
  
  /**
   * Filter out telnet IAC (Interpret As Command) sequences
   * IAC = 255 (0xFF), followed by command bytes
   */
  filterTelnet(str) {
    let result = '';
    let i = 0;
    
    while (i < str.length) {
      const charCode = str.charCodeAt(i);
      
      // IAC (255) - start of telnet command
      if (charCode === 255) {
        if (i + 1 < str.length) {
          const cmd = str.charCodeAt(i + 1);
          
          // Double IAC (255 255) = literal 255
          if (cmd === 255) {
            result += str[i];
            i += 2;
            continue;
          }
          
          // DO, DONT, WILL, WONT (2-byte commands)
          if (cmd >= 251 && cmd <= 254) {
            i += 3; // Skip IAC + cmd + option
            continue;
          }
          
          // SB (subnegotiation) - skip until SE
          if (cmd === 250) {
            let j = i + 2;
            while (j < str.length - 1) {
              if (str.charCodeAt(j) === 255 && str.charCodeAt(j + 1) === 240) {
                j += 2;
                break;
              }
              j++;
            }
            i = j;
            continue;
          }
          
          // Other 2-byte commands (GA, EL, EC, AYT, AO, IP, BRK, etc.)
          if (cmd >= 240 && cmd <= 249) {
            i += 2;
            continue;
          }
        }
        
        // Skip single IAC if at end
        i++;
        continue;
      }
      
      // Regular character
      result += str[i];
      i++;
    }
    
    return result;
  }
  
  /**
   * Convert byte array to string, preserving high bytes
   */
  bytesToString(bytes) {
    let str = '';
    for (let i = 0; i < bytes.length; i++) {
      str += String.fromCharCode(bytes[i]);
    }
    return str;
  }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ANSIParser;
}
