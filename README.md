# AWS Quiz Master 🚀

Adaptive AWS Developer Associate exam prep platform with AI-generated questions, per-user progress tracking, and a LeetCode-style dashboard.

---

## Features

- **32 AWS Services** — Each with its own quiz page
- **Adaptive Difficulty** — AI adjusts question difficulty based on your performance
  - Foundation → Associate → Advanced → Expert
  - 2 correct in a row → harder questions
  - 2 wrong in a row → easier questions
- **Per-User Accounts** — Every user has isolated progress and dashboard
- **LeetCode-style Dashboard** — Score, accuracy, streaks, service progress
- **Leaderboard** — Compete with other learners
- **10 Questions per Session** — AI generates fresh questions every time

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React + Vite |
| Backend | Node.js + Express |
| Database | Render PostgreSQL |
| AI | Anthropic Claude API |
| Auth | JWT (email + password) |
| Hosting | Render |

---

## Deploy to Render (Step by Step)

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/aws-quiz-app.git
git push -u origin main
```

### 2. Create Render Account

Go to [render.com](https://render.com) and sign up.

### 3. Create PostgreSQL Database

1. Render Dashboard → **New** → **PostgreSQL**
2. Name: `aws-quiz-db`
3. Plan: **Free**
4. Click **Create Database**
5. Copy the **Internal Database URL** — you'll need it

### 4. Create Web Service

1. Render Dashboard → **New** → **Web Service**
2. Connect your GitHub repo
3. Configure:
   - **Name**: `aws-quiz-app`
   - **Environment**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Plan**: Free

### 5. Set Environment Variables

In your Web Service settings → **Environment**:

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | *(paste Internal Database URL from step 3)* |
| `JWT_SECRET` | *(any long random string, e.g. `openssl rand -hex 32`)* |
| `ANTHROPIC_API_KEY` | *(your Anthropic API key from console.anthropic.com)* |

### 6. Deploy

Click **Deploy** — Render will:
1. Install dependencies
2. Build React frontend
3. Start Express server
4. Auto-initialize database tables on first run

Your app will be live at: `https://aws-quiz-app.onrender.com`

---

## Local Development

```bash
# Install all dependencies
npm run install-all

# Copy env file
cp .env.example .env
# Fill in your values in .env

# Run both server and client
npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:5000

---

## Project Structure

```
aws-quiz-app/
├── server/
│   ├── index.js        # Express entry point
│   ├── db.js           # PostgreSQL connection + schema
│   ├── auth.js         # Register/login/JWT routes
│   └── quiz.js         # Adaptive quiz + AI question generation
├── client/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Login.jsx       # Auth page
│   │   │   ├── Dashboard.jsx   # Stats overview
│   │   │   ├── Services.jsx    # All 32 AWS services
│   │   │   ├── Quiz.jsx        # Adaptive quiz engine
│   │   │   └── Leaderboard.jsx # Rankings
│   │   ├── components/
│   │   │   └── Layout.jsx      # Sidebar navigation
│   │   ├── context/
│   │   │   └── AuthContext.jsx # Auth state + axios
│   │   ├── App.jsx
│   │   └── index.css           # Design system
│   ├── index.html
│   └── vite.config.js
├── render.yaml         # One-click Render deploy config
├── .env.example
└── package.json
```

---

## Scoring System

| Difficulty | Points per correct answer |
|---|---|
| Foundation | 10 pts |
| Associate | 20 pts |
| Advanced | 35 pts |
| Expert | 50 pts |

---

## Getting Anthropic API Key

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Sign up / log in
3. **API Keys** → **Create Key**
4. Copy and paste into Render environment variables
