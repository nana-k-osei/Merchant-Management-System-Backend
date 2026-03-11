# Merchant Management System - Backend

Backend service for operator authentication, merchant onboarding, KYB review, status management, and webhook delivery.

## Setup

1. Copy `.env.example` to `.env`.
2. Install dependencies with `npm install`.
3. Start PostgreSQL locally or with Docker.
4. Run `npm run migrate`.
5. Start the API with `npm run dev`.

Useful commands:

- `npm start` - start the server
- `npm run migrate` - run SQL migrations
- `npm test -- --runInBand` - run the test suite

## Environment variables

The main variables are:

- `DATABASE_URL`
- `JWT_SECRET`
- `REFRESH_TOKEN_SECRET`
- `ACCESS_TOKEN_EXPIRY`
- `REFRESH_TOKEN_EXPIRY`
- `MAX_FAILED_LOGIN_ATTEMPTS`
- `ACCOUNT_LOCK_DURATION_MINUTES`

See `.env.example` for the full local-development template.

## Architecture

The project uses a layered structure:

- `routes` define HTTP endpoints
- `controllers` validate requests and call services
- `services` contain business logic such as KYB rules, status transitions, and webhook delivery
- `migrations` define the database schema

## API overview

- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `POST /merchants`
- `GET /merchants`
- `GET /merchants/:id`
- `PATCH /merchants/:id`
- `POST /merchants/:id/documents`
- `PATCH /documents/:id`
- `PATCH /merchants/:id/status`
- `POST /webhooks`

## Tests

Integration tests cover authentication, merchant creation, merchant read/update endpoints, KYB document upload and review, merchant status transitions, and webhook delivery.

## Merchant lifecycle

Merchant statuses (Ones I proposed - can be changed very easily):

- `PENDING_KYB`
- `DOCUMENTS_SUBMITTED`
- `UNDER_REVIEW`
- `ACTIVE`
- `REJECTED`
- `SUSPENDED`

Typical flow:

- Merchant created -> `PENDING_KYB`
- First document upload -> `DOCUMENTS_SUBMITTED`
- Review starts -> `UNDER_REVIEW`
- Approved -> `ACTIVE`
- Invalid or failed review -> `REJECTED`

All merchant status changes are written to `merchant_status_history`.

## KYB document review

Documents are uploaded through `POST /merchants/:id/documents`.

Operators review documents through `PATCH /documents/:id`. Only `PENDING` documents can be reviewed, and a document can be marked `VERIFIED` or `REJECTED`.

A merchant cannot become `ACTIVE` unless all of its documents are `VERIFIED`.

## Webhooks

Webhook subscriptions are created through `POST /webhooks` with a `targetUrl` and an `eventTypes` array. The service stores one subscription row per event type.

The server:

- stores one subscription row per event type
- signs each payload with HMAC SHA-256 using the subscription secret
- retries delivery up to 3 times
- sends webhooks in the background after the merchant status change is committed

Example payload:

```json
{
  "event": "merchant.activated",
  "merchantId": "uuid",
  "status": "ACTIVE",
  "timestamp": "2026-03-11T12:00:00Z"
}
```
