create table if not exists questions (
  id text not null,
  user_id text not null,
  text text not null,
  sort_order integer not null,
  image_ids text not null default '[]',
  primary key (user_id, id)
);

create index if not exists questions_user_idx on questions (user_id, sort_order);

create table if not exists question_images (
  id text primary key,
  user_id text not null,
  mime text not null,
  caption text not null default '',
  bytes bytea not null
);

create index if not exists question_images_user_idx on question_images (user_id);

create table if not exists memories (
  id text primary key,
  user_id text not null,
  question_id text not null,
  question_text text not null,
  created_at timestamptz not null default now(),
  duration_ms integer not null,
  mime text not null,
  audio bytea not null,
  transcript text
);

create index if not exists memories_user_idx on memories (user_id, created_at desc);

create table if not exists story_state (
  user_id text primary key,
  skipped_ids text not null default '[]'
);

create table if not exists story_themes (
  user_id text primary key,
  body text not null,
  updated_at timestamptz not null default now()
);
