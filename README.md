# Merchant Management System - Backend

Backend project scaffold for merchant onboarding, authentication, KYB workflows, and webhook processing.

## Folder structure

```
src/
  app.js         Express app configuration
  server.js      Application startup entrypoint
  routes/       URL endpoints (e.g. /merchants or /auth/login)
  controllers/  Request handlers for each endpoint
  services/     Business logic, i.e KYB rules, webhook handling, etc...
  middleware/   Auth checks, validation, error handling
  db/           DB connection and query helpers
migrations/     SQL migration files
tests/          Automated tests
.env.example    Required env vars (with dummy values)
README.md       Setup and usage instructions
```

## Quick start

1. Copy `.env.example` to `.env`.
2. Run `npm install`.
3. Run `npm run dev` for development or `npm start` to start the server.
4. Check `GET /health` to confirm the app is running.
