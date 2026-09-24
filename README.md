# Fruitful Journey Backend

The backend REST API for **Fruitful Journey Employment & Talent Platform**, built with [NestJS](https://nestjs.com/) and TypeScript.

Fruitful Journey connects young job seekers with employers through verified profiles, portfolios, and a two-way discovery model — job seekers apply to posted vacancies, and employers can search the talent directory directly.

---

## 🎯 MVP Objectives

- **Reusable Identity:** Give job seekers a lasting professional profile, CV, and portfolio instead of a one-time document upload.
- **Two-Way Hiring:** Enable employers to either post vacancies or discover verified candidates via a searchable talent directory.
- **Focused Scope:** Deliver a lean, dependable MVP to validate the core hiring workflow with an initial pilot group.

---

## 👥 Users & Roles

| Role | Responsibilities |
| :--- | :--- |
| **Job Seeker** | Registers, builds a profile and portfolio, searches and applies for jobs, tracks application status. |
| **Employer** | Registers an organization, requests verification, posts jobs, searches the talent directory, and manages applicants. |
| **Admin** | Verifies employer organizations, moderates job listings and platform content, manages users, and monitors platform activity. |

---

## 📦 MVP Scope

### Included in MVP
- Authentication & role-based access control (Job Seeker, Employer, Admin)
- Job Seeker profiles, CV data, and portfolio showcases
- Employer organization profiles and admin verification workflow
- Job vacancy posting, management, and candidate search filters
- Job application submission and status tracking pipeline
- Searchable talent directory with filters (skills, experience, availability)
- Admin dashboard endpoints for moderation and user management
- In-app and transactional email notifications

### Deferred to Future Phases (Out of Scope)
- Real-time instant messaging / chat
- Subscription tiers and paid plans
- AI-assisted candidate matching
- Dedicated native mobile applications

---

## 🛠️ Tech Stack

- **Framework:** [NestJS](https://nestjs.com/) (Node.js & TypeScript)
- **Language:** TypeScript
- **Database:** PostgreSQL (with TypeORM / Prisma)
- **Authentication:** Passport.js / JWT with Role Guards
- **Validation:** `class-validator` & `class-transformer`

---

## 🚀 Getting Started

### Prerequisites

Ensure you have the following installed on your machine:
- [Node.js](https://nodejs.org/) (v18 or higher)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/) / [pnpm](https://pnpm.io/)
- [PostgreSQL](https://www.postgresql.org/)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-org/fruitful-journey-backend.git
   cd fruitful-journey-backend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   Copy the example environment file and update credentials accordingly:
   ```bash
   cp .env.example .env
   ```

4. **Run database migrations:**
   ```bash
   npm run migration:run
   ```

5. **Start the development server:**
   ```bash
   npm run start:dev
   ```

The API will be available at `http://localhost:3000`.

---

## 📜 Available Scripts

| Script | Purpose |
| :--- | :--- |
| `npm run start:dev` | Start the server in hot-reload watch mode |
| `npm run build` | Compile the TypeScript project to `/dist` |
| `npm run start:prod` | Run the compiled production build |
| `npm run test` | Execute unit tests via Jest |
| `npm run test:e2e` | Run end-to-end integration tests |
| `npm run lint` | Run ESLint to check code style |

---

## 📁 Project Structure

```text
src/
├── common/             # Global filters, interceptors, and guards (Auth/Roles)
├── config/             # Environment and application configuration
├── modules/
│   ├── auth/           # Authentication, JWT, and password hashing
│   ├── users/          # Base user accounts and role definitions
│   ├── profiles/       # Candidate profile, CV, and portfolio management
│   ├── employers/      # Company profiles and verification states
│   ├── jobs/           # Vacancy management and listing queries
│   ├── applications/   # Application submissions and status lifecycles
│   ├── directory/      # Talent directory search and filtering
│   ├── admin/          # Admin moderation and review actions
│   └── notifications/  # Email and in-app event dispatches
├── app.module.ts       # Root application module
└── main.ts             # Application entrypoint
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).