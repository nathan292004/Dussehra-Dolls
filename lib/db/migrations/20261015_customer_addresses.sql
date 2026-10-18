CREATE TABLE IF NOT EXISTS customer_addresses (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'Home',
  recipient_name text NOT NULL,
  phone text NOT NULL,
  formatted_address text NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_addresses_user_idx ON customer_addresses(user_id, is_default);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS address_latitude double precision;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS address_longitude double precision;
