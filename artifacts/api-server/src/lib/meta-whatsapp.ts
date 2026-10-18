export class MetaWhatsAppError extends Error {
  constructor(
    message: string,
    public code: string,
    public retryable = false,
    public ambiguous = false,
  ) {
    super(message);
  }
}

export async function sendMetaWhatsAppTemplate(
  to: string,
  templateName: string,
  variables: Record<string, string>,
  templateLanguage?: string,
  callbackData?: string,
) {
  const token = process.env.META_WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  const version = process.env.META_GRAPH_API_VERSION || "v26.0";
  const language =
    templateLanguage || process.env.META_WHATSAPP_TEMPLATE_LANGUAGE || "en_US";
  const recipient = to.replace(/^\+/, "");
  if (!token || !phoneId || !/^\d+$/.test(phoneId))
    throw new Error("Meta WhatsApp credentials are incomplete");
  if (
    !/^v\d+\.\d+$/.test(version) ||
    !/^[a-z0-9_]+$/.test(templateName) ||
    !/^[a-z]{2}(?:_[A-Z]{2})?$/.test(language)
  ) {
    throw new Error("Meta WhatsApp template configuration is invalid");
  }
  if (!/^[1-9]\d{7,14}$/.test(recipient))
    throw new Error("WhatsApp recipient phone is invalid");
  const parameters = Object.entries(variables)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([, value]) => ({ type: "text", text: value }));
  const body = {
    messaging_product: "whatsapp",
    to: recipient,
    type: "template",
    ...(callbackData ? { biz_opaque_callback_data: callbackData } : {}),
    template: {
      name: templateName,
      language: { code: language },
      ...(parameters.length
        ? { components: [{ type: "body", parameters }] }
        : {}),
    },
  };
  let response: Response;
  try {
    response = await fetch(
      `https://graph.facebook.com/${version}/${phoneId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      },
    );
  } catch {
    throw new MetaWhatsAppError(
      "Meta response could not be confirmed",
      "NETWORK_UNCONFIRMED",
      false,
      true,
    );
  }
  let result: {
    messages?: { id?: string }[];
    error?: { code?: number; is_transient?: boolean };
  };
  try {
    result = (await response.json()) as typeof result;
  } catch {
    throw new MetaWhatsAppError(
      "Meta returned an unreadable response",
      "RESPONSE_UNCONFIRMED",
      false,
      true,
    );
  }
  if (!response.ok || !result.messages?.[0]?.id) {
    console.error(
      "[Meta WhatsApp] API error code:",
      result.error?.code || response.status,
    );
    throw new MetaWhatsAppError(
      "Meta WhatsApp did not accept the message",
      String(result.error?.code || response.status),
      response.status === 429 ||
        response.status >= 500 ||
        result.error?.is_transient === true,
      response.ok,
    );
  }
  return { id: result.messages[0].id };
}
