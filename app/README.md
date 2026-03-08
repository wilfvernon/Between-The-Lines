# Between the Lines - D&D Campaign Manager

A Progressive Web App (PWA) for managing D&D campaign materials with Supabase backend.

## Features

- 📱 **PWA Support** - Install on mobile devices, works offline
- 🔐 **Authentication** - Secure user login with Supabase
- 📝 **Character Sheet** - Track your D&D character (coming soon)
- 📚 **Bookshelf** - Campaign bookshelf (coming soon)
- 🎨 **Galatea Fine Art** - Magic items shop gallery with modal details
- 📝 **Notes** - Campaign notes management (coming soon)
- 👑 **Admin Dashboard** - Admin tools (coming soon)

## Tech Stack

- **Frontend**: React 18 + Vite
- **Routing**: React Router v6
- **Backend**: Supabase (Auth + Database)
- **Styling**: Custom CSS
- **PWA**: vite-plugin-pwa

## Setup

### 1. Install Dependencies

```bash
cd app
npm install
```

### 2. Configure Supabase

1. Create a Supabase project at [supabase.com](https://supabase.com)
2. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
3. Add your Supabase credentials to `.env`:
   ```
   VITE_SUPABASE_URL=your-project-url
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

### 3. Run Development Server

```bash
npm run dev
```

Visit `http://localhost:5173`

### 3.5 Database Tables for Admin Book Tools

Run this SQL in Supabase SQL Editor:

```sql
create table if not exists public.books (
   id uuid primary key default gen_random_uuid(),
   title text not null,
   author text not null,
   cover_image_url text,
   created_at timestamptz not null default now()
);

alter table public.books
add column if not exists cover_image_url text;

create table if not exists public.chapters (
   id uuid primary key default gen_random_uuid(),
   book_id uuid not null references public.books(id) on delete cascade,
   title text not null,
   body text not null,
   created_at timestamptz not null default now()
);

alter table public.books enable row level security;
alter table public.chapters enable row level security;

create policy "admin can insert books"
on public.books
for insert
to authenticated
with check (auth.jwt() ->> 'email' = 'admin@candlekeep.sc');

create policy "admin can update books"
on public.books
for update
to authenticated
using (auth.jwt() ->> 'email' = 'admin@candlekeep.sc')
with check (auth.jwt() ->> 'email' = 'admin@candlekeep.sc');

create policy "admin can delete books"
on public.books
for delete
to authenticated
using (auth.jwt() ->> 'email' = 'admin@candlekeep.sc');

create policy "admin can insert chapters"
on public.chapters
for insert
to authenticated
with check (auth.jwt() ->> 'email' = 'admin@candlekeep.sc');

create policy "admin can update chapters"
on public.chapters
for update
to authenticated
using (auth.jwt() ->> 'email' = 'admin@candlekeep.sc')
with check (auth.jwt() ->> 'email' = 'admin@candlekeep.sc');

create policy "admin can delete chapters"
on public.chapters
for delete
to authenticated
using (auth.jwt() ->> 'email' = 'admin@candlekeep.sc');

create policy "authenticated can read books"
on public.books
for select
to authenticated
using (true);

create policy "authenticated can read chapters"
on public.chapters
for select
to authenticated
using (true);
```

### 4. Build for Production

```bash
npm run build
npm run preview
```

## Deploy (Recommended)

This app is a static Vite build, so Vercel and Netlify both work well.

### Option A: Vercel (quickest)

1. Push this repo to GitHub.
2. In Vercel, click **Add New Project** and import the repo.
3. Set these project settings:
   - Root Directory: `app`
   - Build Command: `npm run build`
   - Output Directory: `dist`
4. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Deploy.

`vercel.json` is included to handle client-side routes with `BrowserRouter`.

### Option B: Netlify

1. In Netlify, create a new site from your GitHub repo.
2. Set build settings:
   - Base directory: `app`
   - Build command: `npm run build`
   - Publish directory: `app/dist`
3. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy.

`public/_redirects` is included so route refreshes do not 404.

### Share with Friends

After deploy, send them the site URL. Because this is a PWA, they can install it:
- Mobile: browser menu -> **Add to Home Screen**
- Desktop: use browser install prompt/icon

## Project Structure

```
app/
├── public/
│   └── items.json          # Magic items data
├── src/
│   ├── components/
│   │   ├── Gallery.jsx     # Items gallery grid
│   │   ├── Layout.jsx      # App layout with navigation
│   │   ├── Modal.jsx       # Item detail modal
│   │   └── ProtectedRoute.jsx
│   ├── context/
│   │   └── AuthContext.jsx # Authentication state
│   ├── lib/
│   │   └── supabase.js     # Supabase client config
│   ├── pages/
│   │   ├── AdminDashboard.jsx
│   │   ├── Bookshelf.jsx   # Campaign bookshelf
│   │   ├── CharacterSheet.jsx
│   │   ├── GalateaFineArt.jsx # Magic items shop
│   │   ├── Login.jsx       # Authentication page
│   │   └── Notes.jsx
│   ├── App.jsx             # Main app with routing
│   └── main.jsx            # Entry point
└── vite.config.js          # Vite + PWA config
```

## Authentication

The app requires login to access any content. Pre-created user accounts are managed through Supabase Auth.

## PWA Installation

### On Mobile (iOS/Android):
1. Open the app in your browser
2. Tap Share (iOS) or Menu (Android)
3. Select "Add to Home Screen"

### On Desktop:
1. Look for the install icon in your browser's address bar
2. Click to install as a desktop app

## Next Steps

- [ ] Set up Supabase credentials in `.env`
- [ ] Migrate items from JSON to Supabase database
- [ ] Implement character sheet functionality
- [ ] Add notes editor
- [ ] Build admin dashboard

