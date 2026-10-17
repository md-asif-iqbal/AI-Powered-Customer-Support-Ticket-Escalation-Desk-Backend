# AI-Powered-Customer-Support-Ticket-Escalation-Desk-Backend

Enterprise Node.js & Express REST API with MongoDB Atlas, Google Gemini 3.8 Flash, Groq AI, and Dynamic SLA Auto-Escalation Engine.

## Tech Stack
- **Runtime**: Node.js & Express.js (TypeScript)
- **Database**: MongoDB Atlas via Mongoose
- **AI Engine**: Google Gemini 3.8 Flash & Groq (`openai/gpt-oss-20b`) with local heuristic fallback
- **Authentication**: Custom JWT + Firebase Auth Sync
- **Testing**: Vitest

## Setup & Running
1. `npm install`
2. Create `.env` (copy from `.env.example`)
3. Run tests: `npm test`
4. Run dev: `npm run dev`
5. Seed database: `npm run seed`
