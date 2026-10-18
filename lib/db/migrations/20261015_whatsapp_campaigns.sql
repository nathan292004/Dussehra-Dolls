BEGIN;
CREATE TABLE IF NOT EXISTS whatsapp_campaigns (
  id text PRIMARY KEY,
  title text NOT NULL,
  offer text NOT NULL,
  audience text NOT NULL,
  template_name text NOT NULL,
  template_language text NOT NULL,
  template_body text NOT NULL,
  recipient_count integer NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS campaign_id text REFERENCES whatsapp_campaigns(id);
CREATE INDEX IF NOT EXISTS whatsapp_messages_campaign_idx ON whatsapp_messages(campaign_id, status);
COMMIT;
