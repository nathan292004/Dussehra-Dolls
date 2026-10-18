CREATE TABLE IF NOT EXISTS chit_payment_intents (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id),
  enrollment_id integer NOT NULL REFERENCES chit_enrollments(id),
  razorpay_order_id text NOT NULL UNIQUE,
  amount_paise integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  razorpay_payment_id text UNIQUE,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS whatsapp_preferences (
  user_id integer PRIMARY KEY REFERENCES users(id),
  order_updates boolean NOT NULL DEFAULT false,
  order_updates_opted_at timestamp,
  marketing boolean NOT NULL DEFAULT false,
  marketing_opted_at timestamp,
  updated_at timestamp NOT NULL DEFAULT now()
);
ALTER TABLE whatsapp_preferences ADD COLUMN IF NOT EXISTS order_updates_opted_at timestamp;
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id),
  kind text NOT NULL,
  dedupe_key text UNIQUE,
  variables jsonb NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  provider_sid text UNIQUE,
  provider_error_code text,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamp NOT NULL DEFAULT now(),
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS whatsapp_messages_ready_idx ON whatsapp_messages(status, next_attempt_at, id);
CREATE INDEX IF NOT EXISTS chit_payment_intents_enrollment_idx ON chit_payment_intents(enrollment_id, status);
