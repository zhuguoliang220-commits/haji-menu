create table if not exists public.dish_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by text not null check (created_by in ('哈基工', '哈吉梁')),
  created_at timestamptz not null default now(),
  unique (name, created_by)
);

create table if not exists public.dishes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  image_url text not null,
  created_by text not null check (created_by in ('哈基工', '哈吉梁')),
  category_id uuid references public.dish_categories(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null check (customer_name in ('哈基工', '哈吉梁')),
  dish_id uuid not null references public.dishes(id),
  dish_name text not null,
  dish_image_url text not null,
  quantity integer not null default 1 check (quantity > 0),
  note text,
  status text not null default '未完成' check (status in ('未完成', '已完成', '已拒绝')),
  meal_date date not null default ((now() at time zone 'Asia/Shanghai')::date),
  meal_period text not null default '午饭' check (meal_period in ('早餐', '午饭', '晚饭', '夜宵')),
  completed_at timestamptz,
  rejected_at timestamptz,
  rating integer check (rating between 1 and 5),
  rated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.dishes add column if not exists category_id uuid references public.dish_categories(id);
alter table public.dishes add column if not exists deleted_at timestamptz;
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add column if not exists meal_date date default ((now() at time zone 'Asia/Shanghai')::date);
alter table public.orders add column if not exists meal_period text default '午饭';
alter table public.orders add column if not exists completed_at timestamptz;
alter table public.orders add column if not exists rejected_at timestamptz;
alter table public.orders add column if not exists rating integer check (rating between 1 and 5);
alter table public.orders add column if not exists rated_at timestamptz;

alter table public.orders alter column meal_date set not null;
alter table public.orders alter column meal_period set not null;

insert into public.dish_categories (name, created_by)
select '未分类', person
from unnest(array['哈基工', '哈吉梁']) as person
on conflict (name, created_by) do nothing;

update public.dishes d
set category_id = c.id
from public.dish_categories c
where d.category_id is null
  and c.name = '未分类'
  and c.created_by = d.created_by;

update public.orders
set status = case
  when status in ('收到', '制作中') then '未完成'
  when status = '完成' then '已完成'
  else status
end
where status in ('收到', '制作中', '完成');

update public.orders
set meal_date = (created_at at time zone 'Asia/Shanghai')::date
where meal_date is null;

update public.orders
set meal_period = case
  when extract(hour from created_at at time zone 'Asia/Shanghai') between 5 and 10 then '早餐'
  when extract(hour from created_at at time zone 'Asia/Shanghai') between 11 and 15 then '午饭'
  when extract(hour from created_at at time zone 'Asia/Shanghai') between 16 and 21 then '晚饭'
  else '夜宵'
end
where meal_period is null;

alter table public.orders add constraint orders_status_check check (status in ('未完成', '已完成', '已拒绝'));
alter table public.orders drop constraint if exists orders_meal_period_check;
alter table public.orders add constraint orders_meal_period_check check (meal_period in ('早餐', '午饭', '晚饭', '夜宵'));

create index if not exists dish_categories_created_by_idx on public.dish_categories (created_by, created_at desc);
create index if not exists dishes_created_at_idx on public.dishes (created_at desc);
create index if not exists dishes_is_active_idx on public.dishes (is_active);
create index if not exists dishes_category_id_idx on public.dishes (category_id);
create index if not exists dishes_deleted_at_idx on public.dishes (deleted_at);
create index if not exists orders_created_at_idx on public.orders (created_at desc);
create index if not exists orders_status_idx on public.orders (status);
create index if not exists orders_meal_idx on public.orders (meal_date, meal_period, status);

-- Create a public storage bucket named dish-images in Supabase Dashboard.
-- The app writes through the server-side service role key, so table RLS can stay enabled
-- with no public policies if you do not expose anon database access elsewhere.
