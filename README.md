# ThoughtSwap

ThoughtSwap is a real-time classroom discussion tool that facilitates anonymous peer review of short answers ("thoughts") using Canvas for authentication.

- **Client**: React (Vite) + Tailwind CSS
- **Server**: Node.js (Express) + Socket.io + Prisma (PostgreSQL)

## Prerequisites

- **Node.js** (v18+ recommended)
- **npm**
- **Docker & Docker Compose**
- A **Canvas LMS** instance (or a Free-for-Teacher account) for developer keys.

---

## 🚀 Docker Quickstart

The easiest way to build and deploy ThoughtSwap locally is using Docker Compose. This spins up the Postgres database, API server, and Client UI automatically.

1.  **Configure Environment:**
    Copy the example environment file to `.env`:

    ```bash
    cp env.example .env
    ```

    Open `.env` and populate the **Canvas Configuration** section (Client ID, Secret, URL). You can generally leave the Database and Port configurations at their defaults.

2.  **Start the Application:**
    Run the following command to build the images and start the services:

    ```bash
    docker-compose up --build
    ```

    _Note: The server container will automatically apply database migrations upon startup._

3.  **Access:**
    - **Client:** [http://localhost:5173](http://localhost:5173)
    - **Server:** [http://localhost:8000](http://localhost:8000)

4.  **Optional: Seed Data**
    To create the "Dev Teacher" account without a real Canvas login, run the seed command inside the running server container:

    ```bash
    docker-compose exec server npx prisma db seed
    ```

---

## 🛠️ Manual Setup & Development

If you prefer to run the Node applications directly on your host machine (while using Docker for the database), follow these steps.

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/victor-hugo-dc/thoughtswap-ts.git
    cd thoughtswap-ts
    ```

2.  **Install dependencies:**
    This will install dependencies for the root, client, and server workspaces.

    ```bash
    npm install
    ```

3.  **Environment Configuration:**
    Create a `.env` file in the root directory (or `packages/server/.env` depending on your preference, but the docker setup expects it at root or server level).

    ```env
    # Server Configuration
    PORT=8000
    DATABASE_URL="postgresql://user:password@localhost:5432/thoughtswap?schema=public"
    FRONTEND_URL="http://localhost:5173"

    # Canvas OAuth Configuration
    # Obtain these from Canvas Admin -> Developer Keys
    CANVAS_CLIENT_ID="your_client_id"
    CANVAS_CLIENT_SECRET="your_client_secret"
    CANVAS_BASE_URL="https://<your-canvas-instance>.instructure.com"

    # IMPORTANT: Must match exactly what is configured in Canvas
    CANVAS_REDIRECT_URI="http://localhost:8000/accounts/canvas/login/callback/"
    ```

### 4. Start the Database

Use Docker to spin up the PostgreSQL database defined in `docker-compose.yml`.

```bash
docker-compose up -d postgres
```

### 5. Run Migrations & Seed

Apply the Prisma schema to your database and seed the initial dev user.

```bash
# Run from the root
npm run dev --workspace=packages/server
# OR specifically for migrations:
cd packages/server
npx prisma migrate dev
npx prisma db seed
```

The seed command creates a "Dev Teacher" account (teacher@dev.com) which allows you to test teacher features without a real Canvas login.

### 6. Start the Application

Run both the client and server concurrently from the root directory.

```bash
npm run dev
```

- Client: http://localhost:5173
- Server: http://localhost:8000
