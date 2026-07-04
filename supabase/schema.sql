create table if not exists public.dishes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  image_url text not null,
  created_by text not null check (created_by in ('哈基工', '哈吉梁')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null check (customer_name in ('哈基工', '哈吉梁')),
  dish_id uuid not null references public.dishes(id),
  dish_name text not null,
  dish_image_url text not null,
  quantity integer not null default 1 check (quantity > 0),
  note text,
  status text not null default '收到' check (status in ('收到', '制作中', '完成')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dishes_created_at_idx on public.dishes (created_at desc);
create index if not exists dishes_is_active_idx on public.dishes (is_active);
create index if not exists orders_created_at_idx on public.orders (created_at desc);
create index if not exists orders_status_idx on public.orders (status);

-- Create a public storage bucket named dish-images in Supabase Dashboard.
-- The app writes through the server-side service role key, so table RLS can stay enabled
-- with no public policies if you do not expose anon database access elsewhere.
