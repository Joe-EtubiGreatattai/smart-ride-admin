# Smart Ride Admin

Web console for Smart Ride operations.

## Run

```bash
npm install
npm run dev
```

The panel reads `NEXT_PUBLIC_API_URL`; when it is not set it uses:

```bash
http://localhost:3002/api
```

## Admin Login

The backend accepts admin credentials from:

```bash
ADMIN_EMAIL
ADMIN_PASSWORD
```

In development, the fallback login is:

```bash
admin@smartride.local
admin12345
```

Set real values before production.

## Features

- Operations overview
- Driver application review
- Approve and reject driver applications
- Rider directory
- Driver directory by application status
- Ride history and active ride status
- Report review queue
- Promo campaign creation and activation toggle
- Payment transaction log
# smart-ride-admin
