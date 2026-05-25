-- Bulk Node SQL Database Schema for Supabase
-- Paste these commands into the Supabase SQL Editor to initialize tables.

-- 1. Create Users Table
CREATE TABLE IF NOT EXISTS public.users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Disable RLS to allow easy development testing (or write policies as needed)
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;

-- 2. Create Servers Table
CREATE TABLE IF NOT EXISTS public.servers (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    game TEXT NOT NULL,
    plan TEXT NOT NULL,
    ip TEXT NOT NULL,
    location TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'online',
    cpu INTEGER DEFAULT 0,
    ram INTEGER DEFAULT 0,
    ram_max INTEGER DEFAULT 4096,
    disk NUMERIC DEFAULT 0.1,
    disk_max INTEGER DEFAULT 40,
    uptime TEXT DEFAULT '0s'
);

ALTER TABLE public.servers DISABLE ROW LEVEL SECURITY;

-- 3. Create Tickets Table
CREATE TABLE IF NOT EXISTS public.tickets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    messages JSONB NOT NULL DEFAULT '[]'::jsonb
);

ALTER TABLE public.tickets DISABLE ROW LEVEL SECURITY;
