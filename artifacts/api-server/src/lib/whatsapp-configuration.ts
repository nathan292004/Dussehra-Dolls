export type PromotionalTemplate = {
  name: string;
  language: string;
  status: string;
  category: string;
  body: string;
  header: string;
  footer: string;
  buttons: string[];
};

const required = [
  ["META_WHATSAPP_ACCESS_TOKEN", "Meta access token"],
  ["META_WHATSAPP_PHONE_NUMBER_ID", "WhatsApp phone number ID"],
  ["META_WHATSAPP_BUSINESS_ACCOUNT_ID", "WhatsApp Business Account ID"],
  ["META_APP_SECRET", "Meta app secret"],
  ["META_WHATSAPP_VERIFY_TOKEN", "Webhook verify token"],
  ["META_WHATSAPP_PROMO_TEMPLATE_NAME", "Approved marketing template name"],
] as const;

export type WhatsAppConfiguration = {
  ready: boolean;
  checks: { label: string; configured: boolean }[];
  message: string;
  template: PromotionalTemplate | null;
};

let cached:
  | { key: string; expires: number; result: WhatsAppConfiguration }
  | undefined;

export async function getWhatsAppConfiguration(
  refresh = false,
): Promise<WhatsAppConfiguration> {
  const checks = required.map(([key, label]) => ({
    label,
    configured: Boolean(process.env[key]?.trim()),
  }));
  const base = { ready: false, checks, template: null };
  if (checks.some((check) => !check.configured))
    return {
      ...base,
      message:
        "Connect your Meta business account to enable WhatsApp promotions.",
    };
  const token = process.env.META_WHATSAPP_ACCESS_TOKEN!.trim();
  const phoneId = process.env.META_WHATSAPP_PHONE_NUMBER_ID!.trim();
  const businessId = process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID!.trim();
  const name = process.env.META_WHATSAPP_PROMO_TEMPLATE_NAME!.trim();
  const language = process.env.META_WHATSAPP_TEMPLATE_LANGUAGE || "en_US";
  const version = process.env.META_GRAPH_API_VERSION || "v26.0";
  if (
    !/^\d+$/.test(phoneId) ||
    !/^\d+$/.test(businessId) ||
    !/^[a-z0-9_]+$/.test(name) ||
    !/^v\d+\.\d+$/.test(version)
  ) {
    return {
      ...base,
      message:
        "The Meta account ID, phone number ID, API version or template name is invalid.",
    };
  }
  const key = JSON.stringify([
    token,
    phoneId,
    businessId,
    name,
    language,
    version,
  ]);
  if (!refresh && cached?.key === key && cached.expires > Date.now())
    return cached.result;
  let result: WhatsAppConfiguration;
  try {
    const query = new URLSearchParams({
      name,
      fields: "name,language,status,category,components",
      limit: "100",
    });
    const response = await fetch(
      `https://graph.facebook.com/${version}/${businessId}/message_templates?${query}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!response.ok) {
      result = {
        ...base,
        message:
          "Meta could not verify the template. Check the access token, Business Account ID and whatsapp_business_management permission.",
      };
    } else {
      const sender = await fetch(
        `https://graph.facebook.com/${version}/${phoneId}?fields=id,display_phone_number`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(10000),
        },
      );
      const senderData = sender.ok
        ? ((await sender.json()) as {
            id?: string;
            display_phone_number?: string;
          })
        : null;
      if (!senderData?.display_phone_number || senderData.id !== phoneId) {
        return {
          ...base,
          message:
            "Meta could not verify your sender phone number. Check the Phone Number ID and the system user's access to that number.",
        };
      }
      const payload = (await response.json()) as {
        data?: {
          name: string;
          language: string;
          status: string;
          category: string;
          components?: {
            type: string;
            text?: string;
            format?: string;
            buttons?: { text: string; url?: string }[];
          }[];
        }[];
      };
      const entry = payload.data?.find(
        (item) => item.name === name && item.language === language,
      );
      if (!entry)
        result = {
          ...base,
          message: `The promotional template (${language}) was not found in your Meta account.`,
        };
      else {
        const components = entry.components || [];
        const template: PromotionalTemplate = {
          name: entry.name,
          language: entry.language,
          status: entry.status,
          category: entry.category,
          body: components.find((item) => item.type === "BODY")?.text || "",
          header: components.find((item) => item.type === "HEADER")?.text || "",
          footer: components.find((item) => item.type === "FOOTER")?.text || "",
          buttons:
            components
              .find((item) => item.type === "BUTTONS")
              ?.buttons?.map((button) => button.text) || [],
        };
        const variables = template.body.match(/\{\{.*?\}\}/g) || [];
        const unsupported =
          components.some(
            (item) =>
              item.type === "HEADER" &&
              (item.format !== "TEXT" || item.text?.includes("{{")),
          ) ||
          components.some((item) =>
            item.buttons?.some((button) => button.url?.includes("{{")),
          );
        const ready =
          entry.status === "APPROVED" &&
          entry.category === "MARKETING" &&
          variables.length === 1 &&
          variables[0] === "{{1}}" &&
          !unsupported;
        result = {
          ready,
          checks,
          template,
          message: ready
            ? "Meta verified your approved marketing template. Promotions are ready to send."
            : "Use an approved MARKETING template with one body variable {{1}} and no media or dynamic button parameters.",
        };
      }
    }
  } catch {
    result = {
      ...base,
      message:
        "Could not reach Meta to check the template. Try refreshing the connection status.",
    };
  }
  cached = { key, expires: Date.now() + 60_000, result };
  return result;
}
