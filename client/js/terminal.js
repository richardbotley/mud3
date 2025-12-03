/**
 * Terminal Emulator for MUD3
 * Renders text with ANSI colors and provides scrollback
 */

class Terminal {
  constructor(container, options = {}) {
    this.container = typeof container === 'string' 
      ? document.querySelector(container) 
      : container;
    
    this.options = {
      maxLines: options.maxLines || 2000,
      fontSize: options.fontSize || '14px',
      fontFamily: options.fontFamily || "'Cascadia Mono', 'Fira Code', 'Consolas', monospace",
      ...options
    };
    
    this.lines = [];
    this.currentLine = null;
    this.scrollbackBuffer = [];
    
    this.init();
  }
  
  init() {
    // Create terminal structure
    this.element = document.createElement('div');
    this.element.className = 'terminal';
    this.element.style.cssText = `
      font-family: ${this.options.fontFamily};
      font-size: ${this.options.fontSize};
      line-height: 1.4;
      overflow-y: auto;
      overflow-x: hidden;
      white-space: pre-wrap;
      word-wrap: break-word;
      padding: 8px;
      height: 100%;
      box-sizing: border-box;
    `;
    
    this.content = document.createElement('div');
    this.content.className = 'terminal-content';
    this.element.appendChild(this.content);
    
    this.container.appendChild(this.element);
    
    // Start first line
    this.newLine();
    
    // Auto-scroll behavior
    this.autoScroll = true;
    this.element.addEventListener('scroll', () => {
      const atBottom = this.element.scrollHeight - this.element.scrollTop <= this.element.clientHeight + 50;
      this.autoScroll = atBottom;
    });
  }
  
  /**
   * Create a new line element
   */
  newLine() {
    const line = document.createElement('div');
    line.className = 'terminal-line';
    this.content.appendChild(line);
    this.currentLine = line;
    this.lines.push(line);
    
    // Trim old lines if exceeding max
    while (this.lines.length > this.options.maxLines) {
      const oldLine = this.lines.shift();
      oldLine.remove();
    }
    
    return line;
  }
  
  /**
   * Write styled text segment to terminal
   */
  writeSegment(text, fg, bg) {
    if (!text) return;
    
    const span = document.createElement('span');
    span.textContent = text;
    
    if (fg && fg !== '#aaaaaa') {
      span.style.color = fg;
    }
    if (bg && bg !== '#000000') {
      span.style.backgroundColor = bg;
    }
    
    this.currentLine.appendChild(span);
  }
  
  /**
   * Write parsed segments to terminal
   * @param {Array} segments - Array from ANSIParser.parse()
   */
  writeSegments(segments) {
    for (const seg of segments) {
      if (seg.text) {
        this.writeSegment(seg.text, seg.fg, seg.bg);
      } else if (seg.newline) {
        this.newLine();
      } else if (seg.clear === 'screen') {
        this.clear();
      } else if (seg.clear === 'line') {
        this.currentLine.innerHTML = '';
      } else if (seg.bell) {
        this.bell();
      }
    }
    
    this.scrollToBottom();
  }
  
  /**
   * Write raw text (for local echo)
   */
  write(text, className = '') {
    const span = document.createElement('span');
    span.textContent = text;
    if (className) {
      span.className = className;
    }
    this.currentLine.appendChild(span);
    this.scrollToBottom();
  }
  
  /**
   * Write a line with specific styling
   */
  writeLine(text, fg = null, bg = null) {
    this.writeSegment(text, fg, bg);
    this.newLine();
    this.scrollToBottom();
  }
  
  /**
   * Write system message
   */
  writeSystem(text) {
    const span = document.createElement('span');
    span.className = 'system-message';
    span.textContent = text;
    this.currentLine.appendChild(span);
    this.newLine();
    this.scrollToBottom();
  }
  
  /**
   * Clear the terminal
   */
  clear() {
    this.content.innerHTML = '';
    this.lines = [];
    this.newLine();
  }
  
  /**
   * Scroll to bottom
   */
  scrollToBottom() {
    if (this.autoScroll) {
      requestAnimationFrame(() => {
        this.element.scrollTop = this.element.scrollHeight;
      });
    }
  }
  
  /**
   * Play bell sound
   */
  bell() {
    // Visual bell - flash the terminal briefly
    this.element.classList.add('bell');
    setTimeout(() => {
      this.element.classList.remove('bell');
    }, 100);
    
    // Could also play audio
    // const audio = new Audio('data:audio/wav;base64,...');
    // audio.play();
  }
  
  /**
   * Focus the terminal
   */
  focus() {
    this.element.focus();
  }
  
  /**
   * Get all text content (for logging)
   */
  getText() {
    return this.content.textContent;
  }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Terminal;
}

