-- Run this once in your Supabase project's SQL editor
-- (left sidebar: "SQL Editor" -> "New query" -> paste this -> Run).

create table if not exists shop_data (
  id text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- Row Level Security: on by default in Supabase. This app has no
-- server-side login of its own (it uses the in-app PIN screen only), so
-- we allow the app's anon key to read and write this one table. Anyone
-- who has your app's web address and the anon key embedded in it can
-- read and write shop data; there is no way around that with this simple
-- a setup. Do not put anything more sensitive than shop transactions in
-- this table, and do not reuse this Supabase project for anything else.
alter table shop_data enable row level security;

create policy "Allow anon read" on shop_data
  for select using (true);

create policy "Allow anon write" on shop_data
  for insert with check (true);

create policy "Allow anon update" on shop_data
  for update using (true);

-- Enable realtime so changes on one phone push to the other live.
alter publication supabase_realtime add table shop_data;

-- Storage bucket for receipt/expense photo and PDF attachments.
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', true)
on conflict (id) do nothing;

create policy "Allow anon upload to receipts" on storage.objects
  for insert with check (bucket_id = 'receipts');

create policy "Allow anon read receipts" on storage.objects
  for select using (bucket_id = 'receipts');

create policy "Allow anon update receipts" on storage.objects
  for update using (bucket_id = 'receipts');
