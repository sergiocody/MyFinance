# MyFinance - Personal Finance Tracker

A modern personal finance application built with **Next.js**, **Supabase**, and **Google Gemini AI** for smart bank CSV imports.

## Features

- **Authentication** — Email/password sign-in with Supabase Auth
- **Dashboard** — Overview with balance, income/expense charts, category breakdown
- **Accounts** — Track multiple bank accounts (checking, savings, credit card, etc.)
- **Transactions** — Full CRUD with filtering by account, category, type, and date range
- **Categories** — Organize transactions (Groceries, Transport, Salary, etc.)
- **Labels** — Tag transactions with custom labels (Essential, Recurring, etc.)
- **Smart Import** — Drop a bank CSV file, let AI categorize transactions, and automatically skip duplicates

## Tech Stack

- **Frontend**: Next.js 16 (App Router), React 19, TypeScript
- **Styling**: Tailwind CSS 4
- **Database**: Supabase (PostgreSQL)
- **Charts**: Recharts
- **AI**: Google Gemini 2.0 Flash
- **Icons**: Lucide React

## Setup

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Go to **Authentication > Providers** and enable **Email**
3. In **Authentication > URL Configuration**, set your local URL to `http://localhost:3000`
4. Go to **SQL Editor** and run these migrations in order:
	- `supabase/migrations/001_initial_schema.sql`
	- `supabase/migrations/002_auth_and_duplicates.sql`
5. Copy your project URL and anon key from **Settings > API**

### 2. Get a Gemini API Key

Go to [Google AI Studio](https://aistudio.google.com/apikey) and create an API key

### 3. Configure Environment

```bash
cp .env.local.example .env.local
# Edit .env.local with your Supabase URL, anon key, and Gemini API key
```

### 4. Install and Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Deploy to Vercel

1. Push code to GitHub
2. Import in [Vercel](https://vercel.com)
3. Add these environment variables in the Vercel project settings:
	- `NEXT_PUBLIC_SUPABASE_URL`
	- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
	- `GEMINI_API_KEY`
4. In Supabase **Authentication > URL Configuration**, add your Vercel production URL as the site URL and redirect URL
5. Deploy

## Notes

- Duplicate protection is enforced in two places: the import review screen and the database unique index on `(account_id, transaction_hash)`.
- If Supabase email confirmation is enabled, new users must confirm their email before they can sign in.
