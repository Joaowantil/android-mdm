# Arezzo Device Manager

A complete Mobile Device Management solution for Android devices, similar to ManageEngine MDM.

## Features

- **Device Enrollment**: Token-based enrollment with QR code support
- **App Policies**: Allowlist/blocklist apps on managed devices
- **Kiosk Mode**: Lock devices to specific apps
- **Remote Control**: Lock, wipe, locate devices remotely
- **Dashboard**: Real-time device monitoring and management

## Architecture

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────────┐
│  React Frontend │────▶│  FastAPI      │────▶│  Android Agent  │
│  (Dashboard)    │◀────│  Backend      │◀────│  (on devices)   │
└─────────────────┘     └──────────────┘     └─────────────────┘
                              │
                              ▼
                        ┌──────────────┐
                        │  PostgreSQL   │
                        │  / SQLite     │
                        └──────────────┘
```

## Tech Stack

- **Backend**: Python 3.11+ / FastAPI / SQLAlchemy / Alembic
- **Frontend**: React 18 / TypeScript / Vite / Material UI
- **Agent**: Kotlin / Android SDK (Device Admin API / Device Owner)
- **Database**: SQLite (dev) / PostgreSQL (prod)
- **Push**: Firebase Cloud Messaging (FCM)

## Quick Start

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Backend runs on http://localhost:8000 (Swagger docs at /docs)

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on http://localhost:5173

### Default Admin Credentials

- Email: admin@mdm.local
- Password: admin123 (change on first login)

## Project Structure

```
android-mdm/
├── backend/              # FastAPI backend
│   ├── app/
│   │   ├── api/         # API routes
│   │   ├── core/        # Config, security, database
│   │   ├── models/      # SQLAlchemy models
│   │   ├── schemas/     # Pydantic schemas
│   │   └── services/    # Business logic
│   └── requirements.txt
├── frontend/            # React dashboard
│   ├── src/
│   │   ├── components/  # Reusable UI components
│   │   ├── pages/       # Page components
│   │   ├── services/    # API client
│   │   └── types/       # TypeScript types
│   └── package.json
└── android-agent/       # Arezzo Device Manager agent app (Android)
    └── app/src/main/
        └── java/com/mdm/agent/
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/login | Admin login |
| GET | /api/devices | List all devices |
| POST | /api/devices/enroll | Enroll a new device |
| GET | /api/devices/{id} | Device details |
| POST | /api/devices/{id}/lock | Lock device |
| POST | /api/devices/{id}/wipe | Wipe device |
| POST | /api/devices/{id}/locate | Request location |
| GET | /api/policies | List policies |
| POST | /api/policies | Create policy |
| PUT | /api/policies/{id} | Update policy |
| POST | /api/policies/{id}/assign | Assign to devices |

## License

MIT
