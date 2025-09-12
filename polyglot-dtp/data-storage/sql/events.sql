-- Minimal events table for platform-wide events/alarms
create table if not exists event_log (
  id bigserial primary key,
  ts timestamptz not null default now(),
  severity int not null default 0, -- 0=info,1=warn,2=error,3=critical
  source text, -- twin/service id
  body jsonb not null default '{}'
);
create index if not exists event_ts_desc on event_log (ts desc);

