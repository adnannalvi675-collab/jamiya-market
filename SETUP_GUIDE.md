# Jameya Marketplace: Local Setup Guide

Follow this guide to get the Jameya Marketplace backend running on your local machine.

---

## 🛠 Prerequisites

Before starting, ensure you have the following installed on your system:

### 1. Node.js (v18 or higher)
- We recommend using Node.js v22 (LTS).
- Check your version: `node -v`

### 2. Docker & Docker Compose
Because the application relies heavily on PostgreSQL and Redis (for distributed locks and caching), Docker is the easiest way to run these locally without cluttering your system.

---

## 🍏 Setup for macOS

1. **Install Node.js & Docker (if not installed):**
   The easiest way on macOS is via Homebrew:
   ```bash
   brew install node
   brew install --cask docker
   ```
   *Note: Open Docker Desktop after installing to ensure the Docker daemon is running.*

2. **Clone/Navigate to the project:**
   ```bash
   cd /path/to/jameya-marketplace
   ```

---

## 🪟 Setup for Windows

1. **Enable WSL2 (Windows Subsystem for Linux):**
   For the best development experience with Node and Docker on Windows, use WSL2.
   - Open PowerShell as Administrator and run: `wsl --install`
   - Restart your computer if prompted.

2. **Install Docker Desktop for Windows:**
   - Download and install [Docker Desktop](https://www.docker.com/products/docker-desktop).
   - In Docker Desktop settings, ensure **"Use the WSL 2 based engine"** is checked.

3. **Install Node.js:**
   - Download the Windows installer from [nodejs.org](https://nodejs.org/) OR use a version manager like `nvm-windows`.

4. **Navigate to the project (preferably inside your WSL2 terminal):**
   ```bash
   cd /path/to/jameya-marketplace
   ```

---

## 🚀 Step-by-Step Installation

Once your prerequisites are handled (for either OS), the steps to start the application are identical.

### Step 1: Environment Variables
The project contains a `.env` file at the root. If it doesn't exist, create one and paste the following baseline configuration:

```env
# Server
PORT=3000

# Database (Matches the docker-compose settings)
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/jameya?schema=public"

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Stripe (Simulated for dev)
STRIPE_SECRET_KEY=sk_test_simulated_key_123
STRIPE_WEBHOOK_SECRET=whsec_simulated_secret_456
```

### Step 2: Start the Databases (Docker)
We use Docker Compose to spin up exactly what we need for PostgreSQL and Redis.
```bash
docker compose up -d
```
*Wait a few seconds for the databases to initialize.*

### Step 3: Install Dependencies
```bash
npm install
```

### Step 4: Initialize the Database (Prisma)
Generate the Prisma Client and push our schema to the PostgreSQL database.
```bash
npx prisma generate
npx prisma migrate dev --name init
```

### Step 5: Seed the Database
We provided a seed script to populate realistic data (Users, Jameyas, and Seats).
```bash
npm run prisma:seed
```

### Step 6: Start the Server
Start the NestJS application in "watch" mode (auto-reloads on file saves).
```bash
npm run start:dev
```

---

## ✅ Verification

If everything started correctly, you will see output like this in your terminal:
```text
[NestApplication] Nest application successfully started
🚀 Jameya Marketplace running on http://localhost:3000
📚 Swagger UI at http://localhost:3000/api/docs
```

1. **Check the API:** Open your browser and navigate to `http://localhost:3000/api/docs` to see the complete Swagger UI.
2. **Check the API JSON:** `http://localhost:3000/api/docs-json`
3. **Test the Marketplace:** Make a GET request to `http://localhost:3000/api/jameyas/marketplace` to see the algorithm returning seeded Jameyas!

---

## 🛠 Troubleshooting Common Issues

**1. "Prisma client throws connection refused error"**
- **Cause:** PostgreSQL isn't fully running yet.
- **Fix:** Ensure Docker is running. Run `docker ps` to verify the `jameya-postgres` container is active. Wait 5 seconds and try again.

**2. "Address already in use (Port 3000)"**
- **Cause:** Another application is using port 3000.
- **Fix:** Open `.env` and change `PORT=3000` to `PORT=4000`.

**3. "Windows: Docker command not found"**
- **Cause:** Docker Desktop isn't running or isn't integrated with your WSL terminal.
- **Fix:** Open Docker Desktop, go to Settings > Resources > WSL Integration, and ensure your specific WSL distro is toggled ON.
