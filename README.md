# 🎵 Raagam — Telugu Music Player

A free, AI-powered Telugu music streaming app with 3,800+ songs spanning 1940–2026.

## 🌐 Live Demo

**[▶ Play Now](https://charanbharathula.github.io/raagam/)**

## ✨ Features

- 🎶 **3,800+ Telugu Songs** — from classic golden era to latest hits
- 🤖 **AI Recommendations** — personalized based on your listening habits
- 📝 **Time-synced Lyrics** — via LRCLib integration
- ❤️ **Liked Songs & Playlists** — all stored locally in your browser
- 🎨 **Beautiful UI** — glassmorphism design, responsive on all devices
- 🔍 **Smart Search** — by song, movie, singer, or music director
- 📊 **Listening Stats** — track your music personality

## 🚀 Getting Started

### Option 1: GitHub Pages (Static)
Just visit the live demo link above. No server needed — everything runs in your browser.

### Option 2: Self-Hosted with Backend
If you want user sync across devices:

```bash
git clone https://github.com/CharanBharathula/raagam.git
cd raagam
python3 server.py
# Open http://localhost:8888
```

**Requirements:** Python 3.7+

## 📁 Project Structure

```
raagam/
├── index.html      # Main HTML
├── app.js          # App logic + auth
├── ai-engine.js    # AI recommendation engine
├── songs-db.js     # Song database (3,800+ songs)
├── style.css       # Styling
├── server.py       # Optional Python backend (user sync)
└── serve.py        # Simple static file server
```

## 🎯 How It Works

- Songs are streamed via embedded YouTube players
- AI engine learns your taste from likes, skips, and listening time
- All user data (likes, history, preferences) stored in browser localStorage
- No account required — just open and play!

## 📱 Mobile Friendly

Works great on phones and tablets. Add to home screen for an app-like experience.

## 🛠 Tech Stack

- **Frontend:** Vanilla HTML/CSS/JS (no frameworks!)
- **AI Engine:** Custom collaborative filtering + content-based recommendations
- **Lyrics:** LRCLib API
- **Streaming:** YouTube IFrame API
- **Hosting:** GitHub Pages (free)

## 📄 License

MIT — free to use, modify, and share.

---

Built with ❤️ for Telugu music lovers
