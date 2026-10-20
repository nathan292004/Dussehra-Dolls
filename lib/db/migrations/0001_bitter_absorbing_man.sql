CREATE TABLE "whatsapp_campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"offer" text NOT NULL,
	"audience" text NOT NULL,
	"template_name" text NOT NULL,
	"template_language" text NOT NULL,
	"template_body" text NOT NULL,
	"recipient_count" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"campaign_id" text,
	"kind" text NOT NULL,
	"dedupe_key" text,
	"variables" jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"provider_sid" text,
	"provider_error_code" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_messages_dedupe_key_unique" UNIQUE("dedupe_key"),
	CONSTRAINT "whatsapp_messages_provider_sid_unique" UNIQUE("provider_sid")
);
--> statement-breakpoint
CREATE TABLE "whatsapp_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"order_updates" boolean DEFAULT false NOT NULL,
	"order_updates_opted_at" timestamp,
	"marketing" boolean DEFAULT false NOT NULL,
	"marketing_opted_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_addresses" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"label" text DEFAULT 'Home' NOT NULL,
	"recipient_name" text NOT NULL,
	"phone" text NOT NULL,
	"formatted_address" text NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "address_latitude" double precision;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "address_longitude" double precision;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_campaign_id_whatsapp_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."whatsapp_campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_preferences" ADD CONSTRAINT "whatsapp_preferences_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "whatsapp_messages_ready_idx" ON "whatsapp_messages" USING btree ("status","next_attempt_at","id");--> statement-breakpoint
CREATE INDEX "whatsapp_messages_campaign_idx" ON "whatsapp_messages" USING btree ("campaign_id","status");--> statement-breakpoint
CREATE INDEX "customer_addresses_user_idx" ON "customer_addresses" USING btree ("user_id","is_default");