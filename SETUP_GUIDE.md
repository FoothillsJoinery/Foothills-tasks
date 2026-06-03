# Foothills Joinery Task Tracker — Setup Guide

## What you have
- A complete web app ready to deploy
- Your Supabase database (fdaqspcusvirljyjffqr)
- A Vercel account for hosting
- Your domain: foothillsjoinery.com

---

## Step 1 — Set up the database (5 minutes)

1. Go to supabase.com and open your "Foothills Joinery Tasks" project
2. In the left sidebar, click **SQL Editor**
3. Click **New query**
4. Open the file called SETUP_DATABASE.sql from the files I gave you
5. Copy the entire contents and paste it into the SQL editor
6. Click **Run** (green button)
7. You should see "Success" — your database tables are created

---

## Step 2 — Create your admin account (2 minutes)

1. Still in Supabase, click **Authentication** in the left sidebar
2. Click **Users**
3. Click **Add user** → **Create new user**
4. Enter: matt@foothillsjoinery.com and choose a password
5. Click **Create user**

This is how you'll log in to the app as admin.

---

## Step 3 — Deploy to Vercel (5 minutes)

1. Go to github.com and create a free account if you don't have one
2. Create a new repository called "foothills-tasks" (click the + icon top right → New repository)
3. Upload all the app files I gave you into that repository
   - Click "uploading an existing file" on the repository page
   - Drag all the files in — keep the folder structure intact
4. Go to vercel.com and click **Add New Project**
5. Connect your GitHub account and select the "foothills-tasks" repository
6. Click **Deploy** — Vercel will build it automatically
7. In about 2 minutes you'll get a URL like foothills-tasks.vercel.app

---

## Step 4 — Connect your domain (5 minutes)

1. In Vercel, go to your project → **Settings** → **Domains**
2. Type: tasks.foothillsjoinery.com and click Add
3. Vercel will show you a CNAME record to add — copy it
4. Go to GoDaddy → your domain → **DNS** → **Add New Record**
   - Type: CNAME
   - Name: tasks
   - Value: (paste what Vercel gave you)
   - TTL: 1 hour
5. Save it — DNS takes 15–30 minutes to kick in
6. After that, your app is live at tasks.foothillsjoinery.com

---

## How it works day to day

**You (admin):**
- Go to tasks.foothillsjoinery.com, sign in with your email/password
- Create jobs, add sections (Floor 1, Kitchen, etc.), add tasks
- To share with a carpenter: open the job, tap "Copy link" next to Carpenter
  - Send that link via text — they tap it, enter their name, they're in
- To share with a client: same thing, use the Client link

**Carpenters:**
- Tap the link you sent, enter their name once
- See only that job, can add/edit tasks and sections, check things off

**Clients / Site Supers:**
- Tap the link, enter their name
- Can view everything and add requests

---

## Need help?

Come back to this Claude conversation and describe what you're stuck on.
I can walk you through any step in more detail.
