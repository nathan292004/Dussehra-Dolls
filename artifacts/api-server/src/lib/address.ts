import { eq, and, desc } from "drizzle-orm";
import { usersTable, customerAddressesTable } from "@workspace/db/schema";
import type { db } from "@workspace/db";

type Executor = Pick<typeof db, "select" | "update">;

interface AddressParts {
  flatNumber?: string | null;
  building?: string | null;
  street?: string | null;
  locality?: string | null;
  landmark?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
}

/** The delivery address as one readable line: "12B, Lotus Apartments, MG Road, Indiranagar, Near Metro, Bengaluru, Karnataka - 560038". */
export function buildFormattedAddress(a: AddressParts): string {
  const area = [a.flatNumber, a.building, a.street, a.locality, a.landmark ? `Near ${a.landmark}` : null, a.city]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(", ");
  const region = [a.state?.trim(), a.pincode?.trim()].filter(Boolean).join(" - ");
  return [area, region].filter(Boolean).join(", ");
}

/** A link that opens the pin in Google Maps (app or browser). */
export function mapsLink(latitude: number, longitude: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${latitude.toFixed(6)},${longitude.toFixed(6)}`;
}

/**
 * Keeps users.address and users.address_link in step with the customer's default saved address
 * (or clears them when there is none). Call inside the same transaction that changed the addresses.
 */
export async function syncUserAddress(tx: Executor, userId: string): Promise<void> {
  const [def] = await tx
    .select()
    .from(customerAddressesTable)
    .where(and(eq(customerAddressesTable.userId, userId), eq(customerAddressesTable.isDefault, true)))
    .orderBy(desc(customerAddressesTable.updatedAt))
    .limit(1);
  await tx
    .update(usersTable)
    .set({ address: def?.formattedAddress ?? null, addressLink: def?.addressLink ?? null })
    .where(eq(usersTable.userId, userId));
}
