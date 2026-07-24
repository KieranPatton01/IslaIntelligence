# Isla Intelligence 💝

A hyper-personalised AI companion PWA powered by **Gemini 2.0 Flash**, styled in the *Ethereal Peony* design language.

---

## Architecture

```
GitHub Pages (frontend) → Cloudflare Worker (proxy) → Gemini 2.0 Flash
                                  ↕
                    Firebase Auth · Firestore · Storage
```

## Quick Start (Local Dev)

### 1. Clone & install
```bash
git clone https://github.com/KieranPatton01/IslaIntelligence.git
cd IslaIntelligence/frontend
npm install
```

### 2. Set up environment
```bash
cp .env.example .env.local
# Fill in your Firebase config and Cloudflare Worker URL
```

### 3. Run locally
```bash
npm run dev
# → http://localhost:5173/IslaIntelligence/
```

---

## Cloudflare Worker Setup

```bash
cd worker
npm install -g wrangler    # if not installed
wrangler login
wrangler secret put GEMINI_API_KEY
# → paste your Google AI Studio API key

wrangler deploy
# → deploys to https://isla-intelligence-proxy.YOUR_SUBDOMAIN.workers.dev
```

### Local Worker dev
Create `worker/.dev.vars`:
```
GEMINI_API_KEY=your_actual_key
ALLOWED_ORIGIN=http://localhost:5173
```
Then: `wrangler dev`

---

## Firebase Setup

1. Create a Firebase project at https://console.firebase.google.com
2. Enable **Authentication** → Email/Password provider
3. Enable **Firestore** (production mode) then deploy rules:
   ```bash
   firebase deploy --only firestore:rules
   ```
4. Enable **Storage** then deploy rules:
   ```bash
   firebase deploy --only storage
   ```
5. Copy your `firebaseConfig` object values into `.env.local`

---

## GitHub Pages Deployment

1. Push to `main` branch
2. In GitHub repo → **Settings → Pages → Source → GitHub Actions**
3. Add the following as **GitHub Secrets** (Settings → Secrets → Actions):
   - `VITE_WORKER_URL`
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
4. Push any commit to `main` — GitHub Actions builds and deploys automatically

Live URL: `https://kieranpatton01.github.io/IslaIntelligence/`

---

## Features

- 🎚️ **Dynamic Tone Slider** — Ragebait → Princess (7 distinct tiers)
- 💬 **Streaming AI responses** — real-time character-by-character rendering
- 🖼️ **Image uploads** — Firebase Storage + Gemini multimodal analysis
- 🔒 **Secure API proxy** — API key only in Cloudflare Worker
- 📱 **Installable PWA** — offline shell, add to home screen
- 💾 **Persistent history** — Firestore chat timeline per user

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vite 5 + Tailwind CSS v3 |
| PWA | `vite-plugin-pwa` + Workbox |
| Auth | Firebase Auth (email/password) |
| Database | Cloud Firestore |
| Storage | Firebase Storage |
| AI Proxy | Cloudflare Workers |
| AI Model | Gemini 2.0 Flash |
| Hosting | GitHub Pages |
| CI/CD | GitHub Actions |
