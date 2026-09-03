# 🕊️ The Pigeon Diary - Voice, Chat & Admin Control Platform

An exclusive, anonymous voice and chat platform with automatic IP location detection, WebRTC calling, voice notes, photo sharing, carrier pigeon letter animations, and a real-time Master Admin Control Room!

---

## 🌟 Key Features
- **Strict User Capacity:** Dynamic online room capacity controlled directly from Admin Panel (Default: 10).
- **📍 Automatic IP Country Detection:** Auto-detects each visitor's real country from their IP address (with Cloudflare / GeoIP support) with an "IP Verified" badge.
- **🎙️ Crystal-Clear 1-on-1 Voice Calling:** WebRTC peer-to-peer audio calling with live canvas audio visualizer, mute/unmute, hangup confirmation, and auto-call switch.
- **💌 Carrier Pigeon Letter Animation:** When sending/receiving messages, an animated pigeon carrying a letter (`🕊️💌`) flaps across the screen with stardust sparkles!
- **🎙️ Voice Clips & 📷 Photo Sharing:** Record microphone audio clips with inline audio waveform players; upload photos with fullscreen lightbox zoom.
- **🛡️ Master Admin Panel (`/admin.html`):**
  - **Live Theme Switcher:** 6 stunning themes (Midnight Navy, Cyberpunk Neon Purple, Emerald Forest, Blood Moon Ruby, Ocean Sunset, Pitch Black OLED) synced live to all users!
  - **Live Broadcast Announcement:** Broadcast urgent alerts across all user screens in real-time.
  - **Active User Management:** Real-time table of connected users with Nicknames, IP Addresses, Countries, and instant "Kick" & "Ban IP" buttons.
  - **Master Feature Toggles:** Enable/disable Voice Calls, Voice Clips, Photos, Bot Companion, or Maintenance Mode with one click.
  - **Live Analytics Dashboard:** Total calls made, messages sent, voice clips, and photos exchanged.

---

## 🛡️ Admin Panel Access
- **URL:** `https://your-domain.com/admin.html` (or `http://localhost:3000/admin.html`)
- **Default Master Security PIN:** `pigeon@2026` *(Can be changed anytime inside the Admin Panel)*

---

## 🚀 How to Run Locally

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the server:
   ```bash
   node server.js
   ```

3. Open in your browser:
   - Main User Website: `http://localhost:3000`
   - Admin Panel: `http://localhost:3000/admin.html`

---

## 🌐 How to Deploy for Free (Render.com)

1. Upload all files to a GitHub repository (e.g. `the-pigeon-diary`).
2. Go to [Render.com](https://render.com) and click **"New +" -> "Web Service"**.
3. Select your GitHub repository.
4. Set:
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Plan:** `Free ($0)`
5. Click **Deploy Web Service** — your app & admin panel are live on HTTPS in 2 minutes!
