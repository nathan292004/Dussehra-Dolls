CREATE TABLE "reseller_stock_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"vendor_id" integer NOT NULL,
	"product_id" integer,
	"product_name" text NOT NULL,
	"kind" text NOT NULL,
	"quantity" integer NOT NULL,
	"note" text,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reseller_stock_quantity_positive" CHECK ("reseller_stock_entries"."quantity" > 0),
	CONSTRAINT "reseller_stock_kind" CHECK ("reseller_stock_entries"."kind" IN ('received', 'returned'))
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "vendor_id" integer;--> statement-breakpoint
ALTER TABLE "chit_plans" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "chit_plans" ADD COLUMN "cancellation_reason" text;--> statement-breakpoint
ALTER TABLE "chit_plans" ADD COLUMN "released_amount" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "reseller_stock_entries" ADD CONSTRAINT "reseller_stock_entries_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reseller_stock_entries" ADD CONSTRAINT "reseller_stock_entries_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reseller_stock_entries" ADD CONSTRAINT "reseller_stock_entries_created_by_admin_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reseller_stock_vendor_idx" ON "reseller_stock_entries" USING btree ("vendor_id","created_at");--> statement-breakpoint
CREATE INDEX "reseller_stock_product_idx" ON "reseller_stock_entries" USING btree ("product_id");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "products_vendor_idx" ON "products" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "products_listing_idx" ON "products" USING btree ("is_listed","category","created_at");--> statement-breakpoint
CREATE INDEX "orders_created_idx" ON "orders" USING btree ("created_at");