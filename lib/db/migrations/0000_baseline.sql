CREATE TABLE "users" (
	"user_id" text PRIMARY KEY NOT NULL,
	"index" serial NOT NULL,
	"fname" text NOT NULL,
	"lname" text,
	"phone" text NOT NULL,
	"address" text,
	"registered_at" timestamp DEFAULT now() NOT NULL,
	"is_reseller" boolean DEFAULT false NOT NULL,
	"reseller_code" text,
	"password_hash" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp,
	"deletion_reason" text,
	"failed_login_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp,
	CONSTRAINT "users_index_unique" UNIQUE("index"),
	CONSTRAINT "users_reseller_code_unique" UNIQUE("reseller_code")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price" numeric(10, 2) NOT NULL,
	"original_price" numeric(10, 2),
	"category" text NOT NULL,
	"image_url" text,
	"stock" integer DEFAULT 0 NOT NULL,
	"reserved_stock" integer DEFAULT 0 NOT NULL,
	"rating" numeric(3, 2) DEFAULT '0',
	"review_count" integer DEFAULT 0 NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"is_listed" boolean DEFAULT true NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"serial_number" text,
	"location" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "products_stock_not_negative" CHECK ("products"."stock" >= 0),
	CONSTRAINT "products_reserved_within_stock" CHECK ("products"."reserved_stock" >= 0 AND "products"."reserved_stock" <= "products"."stock")
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payment_status" text DEFAULT 'pending' NOT NULL,
	"razorpay_order_id" text,
	"items" jsonb NOT NULL,
	"total" numeric(10, 2) NOT NULL,
	"wallet_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"stock_reserved" boolean DEFAULT false NOT NULL,
	"address" text,
	"payment_method" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "orders_razorpay_order_id_unique" UNIQUE("razorpay_order_id")
);
--> statement-breakpoint
CREATE TABLE "chit_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"chits" integer NOT NULL,
	"monthly_amount" numeric(10, 2) NOT NULL,
	"total_amount" numeric(10, 2) NOT NULL,
	"bonus_points" integer NOT NULL,
	"duration_months" integer DEFAULT 11 NOT NULL,
	"cycle_start_year" integer NOT NULL,
	"amount_paid" numeric(10, 2) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"is_approved" boolean DEFAULT false NOT NULL,
	"is_rejected" boolean DEFAULT false NOT NULL,
	"rejection_reason" text,
	"reviewed_by" integer,
	"reviewed_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chit_plans_not_approved_and_rejected" CHECK (NOT ("chit_plans"."is_approved" AND "chit_plans"."is_rejected"))
);
--> statement-breakpoint
CREATE TABLE "chit_reminder_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"chit_plan_id" integer NOT NULL,
	"kind" text NOT NULL,
	"period_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"amount_due" numeric(10, 2),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"sent_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"razorpay_payment_id" text,
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_razorpay_payment_id_unique" UNIQUE("razorpay_payment_id")
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"balance" numeric(10, 2) DEFAULT '0' NOT NULL,
	"chit_locked_balance" numeric(10, 2) DEFAULT '0' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "wallets_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "wallets_balance_not_negative" CHECK ("wallets"."balance" >= 0 AND "wallets"."chit_locked_balance" >= 0)
);
--> statement-breakpoint
CREATE TABLE "cart_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"product_id" integer NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otp_verifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"otp" text NOT NULL,
	"purpose" text DEFAULT 'register' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"contact" text,
	"email" text,
	"phone" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"failed_login_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp,
	"last_login_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "admin_users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "notification_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"phone" text NOT NULL,
	"channel" text NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"related_type" text,
	"related_id" integer,
	"provider_id" text,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chit_plans" ADD CONSTRAINT "chit_plans_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chit_plans" ADD CONSTRAINT "chit_plans_reviewed_by_admin_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chit_reminder_log" ADD CONSTRAINT "chit_reminder_log_chit_plan_id_chit_plans_id_fk" FOREIGN KEY ("chit_plan_id") REFERENCES "public"."chit_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "users_active_phone_unique" ON "users" USING btree ("phone") WHERE "users"."is_deleted" = false;--> statement-breakpoint
CREATE INDEX "orders_user_idx" ON "orders" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status","payment_status");--> statement-breakpoint
CREATE UNIQUE INDEX "chit_plans_one_per_user_per_year" ON "chit_plans" USING btree ("user_id","cycle_start_year") WHERE "chit_plans"."is_rejected" = false AND "chit_plans"."status" <> 'cancelled';--> statement-breakpoint
CREATE INDEX "chit_plans_user_idx" ON "chit_plans" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "chit_plans_review_idx" ON "chit_plans" USING btree ("is_approved","is_rejected");--> statement-breakpoint
CREATE UNIQUE INDEX "chit_reminder_unique" ON "chit_reminder_log" USING btree ("chit_plan_id","kind","period_key");--> statement-breakpoint
CREATE INDEX "transactions_user_idx" ON "transactions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cart_items_user_product_unique" ON "cart_items" USING btree ("user_id","product_id");--> statement-breakpoint
CREATE INDEX "otp_phone_created_idx" ON "otp_verifications" USING btree ("phone","created_at");--> statement-breakpoint
CREATE INDEX "notification_log_created_idx" ON "notification_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "notification_log_kind_idx" ON "notification_log" USING btree ("kind","status");--> statement-breakpoint
CREATE INDEX "notification_log_user_idx" ON "notification_log" USING btree ("user_id");