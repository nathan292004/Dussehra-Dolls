import { db } from "@workspace/db";
import { cartItemsTable, productsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { toPaise } from "./money";

/** The customer's cart with every price as whole paise, so totals are exact. */
export async function loadCartLines(userId: string) {
  const rows = await db
    .select({ cartItem: cartItemsTable, product: productsTable })
    .from(cartItemsTable)
    .leftJoin(productsTable, eq(cartItemsTable.productId, productsTable.id))
    .where(eq(cartItemsTable.userId, userId));

  return rows
    .filter((r): r is typeof r & { product: NonNullable<typeof r.product> } => !!r.product)
    .map((r) => {
      const pricePaise = toPaise(r.product.price);
      return {
        productId: r.cartItem.productId,
        quantity: r.cartItem.quantity,
        product: r.product,
        pricePaise,
        subtotalPaise: pricePaise * r.cartItem.quantity,
      };
    });
}
