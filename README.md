# NT DeskAI — Intelligent Customer Support & Ticket Escalation Desk (Backend API)

[![Node.js](https://img.shields.io/badge/Node.js-22-1F6F5F?style=for-the-badge&logo=node.js)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.21-2FA084?style=for-the-badge&logo=express)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas%20Mongoose-6FCF97?style=for-the-badge&logo=mongodb)](https://www.mongodb.com/)
[![Vitest](https://img.shields.io/badge/Vitest-3%20Passed-1F6F5F?style=for-the-badge&logo=vitest)](https://vitest.dev/)
[![Vercel](https://img.shields.io/badge/Vercel-Serverless%20Ready-black?style=for-the-badge&logo=vercel)](https://vercel.com/)

Enterprise Express REST API with MongoDB Atlas, Google Gemini 3.8 Flash, Groq redundancy, Inactivity Auto-Switch Watchdog, and Dynamic SLA Escalation Engine.

---

## 🚀 Key Backend Capabilities
- **Dynamic SLA Calculation**:
  - `URGENT`: 2 Hours | `HIGH`: 8 Hours | `MEDIUM`: 24 Hours | `LOW`: 48 Hours.
  - Live status evaluation (`SAFE`, `WARNING`, `BREACHED`, `RESOLVED_WITHIN_SLA`, `RESOLVED_BREACHED`).
- **AI Multimodal Triage**:
  - Google Gemini 1.5/3.8 Flash + Groq redundancy + offline fallback NLP heuristic classifier.
  - Computes sentiment classification, continuous sentiment score (`-1.0` to `+1.0`), urgency score (`0` to `100`), priority, and empathy draft response.
- **Smart Agent Auto-Assignment**:
  - Automatically routes tickets to available agents with lowest active workload. Supports multi-agent co-assignment.
- **15-Minute Inactivity Auto-Switch Watchdog**:
  - Background service checks for unreplied assigned tickets every 30s. Automatically reassigns after 15m with audit logging (`🔄 AI Auto-Switched`).
- **Resolved Ticket Security Guard**:
  - Rejects comments on `RESOLVED` / `CLOSED` tickets with `400 Bad Request` unless reopened first.
- **AI Agent Performance Leaderboard**:
  - Aggregate metrics across resolutions, SLA compliance, ratings, and incident penalties.
- **Vercel Serverless Ready**:
  - Pre-configured with `vercel.json`, connection caching, and flexible CORS.

---

## 🛠️ Local Setup
```bash
npm install
cp .env.example .env
# Edit MONGODB_URI and JWT_SECRET
npm run dev
# Starts on http://localhost:5001
```

## 🧪 Tests
```bash
npm test
```

## ☁️ Vercel Deployment
Deploy as a Node.js project using `vercel.json` with environment variables:
`MONGODB_URI`, `JWT_SECRET`, `FRONTEND_URL`
