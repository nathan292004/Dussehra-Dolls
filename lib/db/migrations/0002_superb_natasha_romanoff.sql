CREATE TABLE "reseller_commissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"reseller_id" text NOT NULL,
	"order_id" integer NOT NULL,
	"order_total" numeric(10, 2) NOT NULL,
	"commission_rate" numeric(5, 2) DEFAULT '5.00' NOT NULL,
	"commission_amount" numeric(10, 2) NOT NULL,
	"status" text DEFAULT 'credited' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "reseller_code" text;--> statement-breakpoint
ALTER TABLE "chit_plans" ADD COLUMN "cancelled_at" timestamp;--> statement-breakpoint
ALTER TABLE "chit_plans" ADD COLUMN "cancellation_reason" text;--> statement-breakpoint
ALTER TABLE "chit_plans" ADD COLUMN "cancelled_by" text;--> statement-breakpoint
ALTER TABLE "reseller_commissions" ADD CONSTRAINT "reseller_commissions_reseller_id_users_user_id_fk" FOREIGN KEY ("reseller_id") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reseller_commissions" ADD CONSTRAINT "reseller_commissions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reseller_commissions_reseller_idx" ON "reseller_commissions" USING btree ("reseller_id");--> statement-breakpoint
CREATE INDEX "reseller_commissions_order_idx" ON "reseller_commissions" USING btree ("order_id");