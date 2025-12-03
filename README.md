# MUD3 - Browser Client for MUDII

A modern, browser-based telnet client for [MUDII](http://www.mudii.co.uk/) - the world's first MUD, running since 1985!

![Fantasy Theme](docs/screenshot-fantasy.png)

## Features

- 🏰 **Fantasy Theme** - Rich medieval aesthetic (default)
- 🌙 **Dark Theme** - Clean, modern alternative
- 🧭 **Quick Commands** - Navigation buttons including Swamp direction
- 📊 **Status Bar** - Real-time player stats (Stamina, Dex, Str, Mag, Points)
- 🎨 **Full ANSI Color Support** - All MUD2 colors rendered correctly
- ⌨️ **Command History** - Arrow keys to recall previous commands
- 📱 **Responsive Design** - Works on desktop and mobile
- 🔄 **Auto-Reconnect** - Automatically reconnects if disconnected

## Architecture

```
MUD3/
├── client/                  # Frontend (static files for Netlify)
│   ├── index.html
│   ├── css/
│   │   ├── main.css
│   │   └── themes/
│   │       ├── fantasy.css
│   │       └── dark.css
│   └── js/
│       ├── app.js           # Main application
│       ├── terminal.js      # Terminal emulator
│       ├── ansi.js          # ANSI color parser
│       └── mud2.js          # MUD2 protocol handler
│
└── server/                  # Backend (Node.js WebSocket proxy)
    ├── server.js
    └── package.json
```

## Quick Start

### 1. Start the WebSocket Proxy

```bash
cd server
npm install
npm start
```

The proxy will start on `ws://localhost:8080` by default.

### 2. Open the Client

Simply open `client/index.html` in your browser, or serve it with any static file server:

```bash
cd client
npx serve .
```

Then navigate to `http://localhost:3000`

## Deployment

### Client (Netlify)

1. Fork/clone this repo to your GitHub
2. Connect to Netlify
3. Set build settings:
   - **Base directory:** `client`
   - **Build command:** (none needed)
   - **Publish directory:** `client`

4. Update `MUD3_CONFIG.wsUrl` in `index.html` to point to your proxy server

### Proxy Server (Hostinger/VPS)

#### Option A: Direct Node.js

```bash
# On your server
cd server
npm install
PORT=8080 node server.js
```

Use PM2 for production:

```bash
npm install -g pm2
pm2 start server.js --name mud3-proxy
pm2 save
pm2 startup
```

#### Option B: Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY server/package*.json ./
RUN npm install --production
COPY server/server.js .
EXPOSE 8080
CMD ["node", "server.js"]
```

#### Option C: Railway/Render/Fly.io

1. Push the `server` folder to a new repo (or use monorepo deploy)
2. Set environment variable `PORT` to the platform's assigned port
3. Deploy!

### Environment Variables (Proxy)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | WebSocket server port |
| `MUD_HOST` | `mudii.co.uk` | MUD server hostname |
| `MUD_PORT` | `23` | MUD server telnet port |
| `ALLOWED_ORIGINS` | (all) | Comma-separated allowed origins |

## Configuration

Edit `client/index.html` to set your proxy URL:

```javascript
window.MUD3_CONFIG = {
  wsUrl: 'wss://your-proxy-server.com'  // Use wss:// for HTTPS sites
};
```

Or pass it as a URL parameter:

```
https://your-client.netlify.app/?ws=wss://your-proxy.com
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Enter` | Send command (or connect if disconnected) |
| `↑` / `↓` | Navigate command history |
| `Escape` | Clear input |

## Command Buttons

### Navigation
- **N, S, E, W** - Cardinal directions
- **NW, NE, SW, SE** - Diagonal directions
- **Up, Down** - Vertical movement
- **In, Out** - Enter/exit locations
- **Swamp** - The special swampward direction!

### Actions
- **Look** - Examine surroundings
- **Inventory** - Check your possessions
- **Score** - View your score
- **Help** - Get help
- **Who** - See who's online
- **Quit** - Leave the game

### Combat
- **Kill** - Attack (type target name after)
- **Flee** - Run away!

## Themes

Toggle between themes using the moon/castle button in the header:

- 🏰 **Fantasy** - Medieval aesthetic with gold accents, parchment-like feel
- 🌙 **Dark** - Modern, minimal, high-contrast

## Credits

- **MUD2** created by Richard Bartle and Roy Trubshaw (1985)
- **MUDII.co.uk** - The longest-running online game in existence
- **Clio Client** - Reference implementation by Ian Peattie

## Links

- [MUDII Official Site](http://www.mudii.co.uk/)
- [MUD2 Wikipedia](https://en.wikipedia.org/wiki/MUD2)
- [Richard Bartle's Site](https://mud.co.uk/)

## License

MIT License - Feel free to modify and distribute!

---

*You haven't lived until you've died in MUDII!* 🐉

