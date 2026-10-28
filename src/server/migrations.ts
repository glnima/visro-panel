// Append-only. Never edit a migration that has shipped; add a new one.
export const MIGRATIONS: { id: number; sql: string[] }[] = [
  {
    id: 1,
    sql: [
      `create table users (
        id serial primary key,
        username text not null unique,
        display_name text not null,
        password_hash text not null,
        role text not null check (role in ('admin', 'store', 'workshop')),
        active boolean not null default true,
        created_at timestamptz not null default now()
      )`,
      `create table sessions (
        token_hash text primary key,
        user_id int not null references users(id) on delete cascade,
        expires_at timestamptz not null
      )`,
      `create table stations (
        key text primary key check (key in ('carpentry', 'zirkar', 'rangkar', 'tailor', 'ruyekoob', 'final')),
        label text not null,
        capacity int not null check (capacity > 0),
        sort int not null
      )`,
      `insert into stations (key, label, capacity, sort) values
        ('carpentry', 'نجاری', 6, 1),
        ('zirkar', 'زیرکار', 4, 2),
        ('rangkar', 'رنگکار', 4, 3),
        ('tailor', 'خیاط', 4, 4),
        ('ruyekoob', 'رویه‌کوب', 3, 5),
        ('final', 'تحویل نهایی', 8, 6)`,
      `create table categories (
        id serial primary key,
        name text not null unique,
        sort int not null default 0
      )`,
      `insert into categories (name, sort) values
        ('مبل', 1), ('صندلی', 2), ('میز ناهارخوری', 3), ('میز وسط', 4), ('سرویس خواب', 5),
        ('گل میز', 6), ('آباژور', 7), ('چوب لباسی', 8), ('قاب آیینه', 9), ('اکسسوری', 10)`,
      `create table products (
        id serial primary key,
        name text not null,
        category_id int not null references categories(id),
        price bigint not null check (price >= 0),
        active boolean not null default true,
        created_at timestamptz not null default now()
      )`,
      `create table customers (
        id serial primary key,
        name text not null unique,
        phone text not null default '',
        notes text not null default '',
        created_at timestamptz not null default now()
      )`,
      `create sequence order_code_seq start 1001`,
      `create table orders (
        id serial primary key,
        code text not null unique,
        customer_id int not null references customers(id),
        order_date date not null,
        requested date not null,
        registered_at timestamptz not null default now(),
        delivered_at date,
        notes text not null default '',
        version int not null default 1,
        deleted_at timestamptz,
        created_by int references users(id)
      )`,
      `create table order_items (
        id serial primary key,
        order_id int not null references orders(id) on delete cascade,
        position int not null,
        product_id int references products(id),
        product_name text not null,
        unit_price bigint not null check (unit_price >= 0),
        qty int not null check (qty > 0),
        fabric_color text not null default '',
        wood_color text not null default '',
        carpentry boolean not null default false,
        zirkar boolean not null default false,
        rangkar boolean not null default false,
        tailor boolean not null default false,
        ruyekoob boolean not null default false
      )`,
      `create index order_items_order_idx on order_items(order_id)`,
      `create table order_events (
        id bigserial primary key,
        order_id int references orders(id) on delete cascade,
        item_id int references order_items(id) on delete set null,
        kind text not null,
        stage text,
        user_id int references users(id) on delete set null,
        at timestamptz not null default now(),
        details jsonb not null default '{}'
      )`,
      `create index order_events_at_idx on order_events(at)`,
      `create table app_meta (id int primary key default 1 check (id = 1), version bigint not null default 1)`,
      `insert into app_meta default values`,
    ],
  },
  {
    id: 2,
    sql: [
      `create table feedback (
        id serial primary key,
        user_id int references users(id) on delete set null,
        kind text not null check (kind in ('bug', 'idea', 'other')),
        body text not null,
        page text not null default '',
        done boolean not null default false,
        created_at timestamptz not null default now()
      )`,
    ],
  },
  {
    id: 3,
    sql: [
      // station roles: each can only work on its own stage
      `alter table users drop constraint users_role_check`,
      `alter table users add constraint users_role_check
        check (role in ('admin', 'store', 'workshop', 'carpentry', 'zirkar', 'rangkar', 'tailor', 'ruyekoob'))`,
      // when and by whom each stage was finished
      `alter table order_items
        add column carpentry_at timestamptz,
        add column carpentry_by int references users(id) on delete set null,
        add column zirkar_at timestamptz,
        add column zirkar_by int references users(id) on delete set null,
        add column rangkar_at timestamptz,
        add column rangkar_by int references users(id) on delete set null,
        add column tailor_at timestamptz,
        add column tailor_by int references users(id) on delete set null,
        add column ruyekoob_at timestamptz,
        add column ruyekoob_by int references users(id) on delete set null`,
      `create table item_delays (
        id serial primary key,
        item_id int not null references order_items(id) on delete cascade,
        stage text not null check (stage in ('carpentry', 'zirkar', 'rangkar', 'tailor', 'ruyekoob')),
        reason text not null,
        note text not null default '',
        eta date,
        created_by int references users(id) on delete set null,
        created_at timestamptz not null default now(),
        resolved_at timestamptz,
        resolved_by int references users(id) on delete set null
      )`,
      `create index item_delays_open_idx on item_delays(item_id) where resolved_at is null`,
    ],
  },
];
