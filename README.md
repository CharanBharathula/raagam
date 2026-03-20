# 🎵 Raagam — Telugu & Bollywood Music Player

A free, AI-powered music streaming app with 71,000+ blockbuster Telugu & Bollywood hits (1980s–present).

[![Deploy to GitHub Pages](https://github.com/CharanBharathula/raagam/actions/workflows/deploy.yml/badge.svg)](https://github.com/CharanBharathula/raagam/actions/workflows/deploy.yml)

## 🌐 Live Site

**[▶ Play Now → charanbharathula.github.io/raagam](https://charanbharathula.github.io/raagam/)**

*Automatically deployed to GitHub Pages on every push to `main` — changes go live within ~1–2 minutes of merging.*

## ✨ Features

- 🎶 **71,000+ Songs** — Telugu & Bollywood blockbusters from 1980s to today
- 🤖 **AI Recommendations** — personalized based on your listening habits
- 📝 **Time-synced Lyrics** — via LRCLib integration (karaoke mode)
- 🖱️ **Spotify-like Hover Preview** — floating preview card with audio snippet on hover (desktop)
- 🔒 **Lock-Screen Controls** — MediaSession API for iOS/Android media controls
- ❤️ **Liked Songs & History** — all stored locally in your browser
- 🎨 **Beautiful UI** — dark theme, glassmorphism design, responsive on all devices
- 🔍 **Smart Search** — by song, movie, singer, or music director
- 📥 **Offline Download** — cache songs for offline playback
- 📊 **Music Personality** — track your listening stats

## 📁 Project Structure

```
raagam/
├── index.html              # Main HTML shell
├── app.js                  # App logic, player, auth, UI
├── ai-engine.js            # AI recommendation engine
├── songs-db.js             # Telugu song database (23,350+ songs)
├── bollywood-songs-db.js   # Bollywood song database (48,366+ songs)
├── style.css               # Styling
├── sw.js                   # Service worker (offline caching, raagam-v4)
└── .github/workflows/
    └── deploy.yml          # Auto-deploy to GitHub Pages on push to main
```

## 🛠 Tech Stack

- **Frontend:** Vanilla HTML / CSS / JavaScript — no build step
- **AI Engine:** Custom collaborative filtering + content-based recommendations
- **Lyrics:** LRCLib API
- **Streaming:** JioSaavn CDN audio
- **Offline:** Service Worker with Cache API
- **Hosting:** GitHub Pages (auto-deployed via GitHub Actions)

## 📄 License

MIT — free to use, modify, and share.

---

Built with ❤️ for Telugu & Bollywood music lovers
