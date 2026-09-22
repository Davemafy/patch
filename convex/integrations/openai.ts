type JsonSchema = Record<string, unknown>;

function getKey() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not configured in Convex.");
  return key;
}

function outputText(payload: any): string {
  if (typeof payload?.output_text === "string") return payload.output_text;
  for (const item of payload?.output ?? []) {
    for (const content of item?.content ?? []) {
      if (content?.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  throw new Error("OpenAI returned no structured output.");
}

async function structured<T>(name: string, schema: JsonSchema, instructions: string, input: string): Promise<T> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5-mini",
      store: false,
      input: [
        { role: "system", content: [{ type: "input_text", text: instructions }] },
        { role: "user", content: [{ type: "input_text", text: input }] },
      ],
      text: {
        format: {
          type: "json_schema",
          name,
          strict: true,
          schema,
        },
      },
    }),
  });

  const json = await response.json();
  if (!response.ok) throw new Error(`OpenAI request failed (${response.status}): ${json?.error?.message || "unknown error"}`);
  return JSON.parse(outputText(json)) as T;
}

export async function understandRepair(description: string, area: string) {
  return structured<{ category: string; searchQuery: string }>(
    "repair_search_context",
    {
      type: "object",
      additionalProperties: false,
      required: ["category", "searchQuery"],
      properties: {
        category: { type: "string" },
        searchQuery: { type: "string" },
      },
    },
    [
      "Turn a normal person's home-repair description into search context.",
      "Do not diagnose the root cause and do not claim urgency, price, availability, or safety facts.",
      "category should be a short trade/service phrase a real repair business would use.",
      "searchQuery should help find nearby businesses that publicly offer the needed service, including the user's area.",
    ].join(" "),
    `Area: ${area}\nProblem: ${description}`,
  );
}

export type ReplyFacts = {
  canTakeJob: boolean | null;
  arrivalText: string | null;
  priceAmount: number | null;
  currency: string | null;
  note: string | null;
};

export async function extractReplyFacts(rawText: string): Promise<ReplyFacts> {
  const parsed = await structured<{
    canTakeJob: "yes" | "no" | "unclear";
    arrivalText: string | null;
    priceAmount: number | null;
    currency: string | null;
    note: string | null;
  }>(
    "repair_reply_facts",
    {
      type: "object",
      additionalProperties: false,
      required: ["canTakeJob", "arrivalText", "priceAmount", "currency", "note"],
      properties: {
        canTakeJob: { type: "string", enum: ["yes", "no", "unclear"] },
        arrivalText: { type: ["string", "null"] },
        priceAmount: { type: ["number", "null"] },
        currency: { type: ["string", "null"] },
        note: { type: ["string", "null"] },
      },
    },
    [
      "Extract only facts literally supported by the repair person's reply.",
      "Never infer a missing price or time. Preserve vague time wording instead of making it more precise.",
      "canTakeJob is yes only when the reply clearly indicates willingness/ability to take this job; no only for a clear refusal; otherwise unclear.",
      "If a price is written as 12k, priceAmount may be 12000. Use NGN only when naira/N/₦ or clear Nigerian context is present in the reply; otherwise null unless another currency is explicit.",
      "note is only for an explicit condition or qualifier that matters to the user, otherwise null.",
    ].join(" "),
    rawText,
  );

  return {
    canTakeJob: parsed.canTakeJob === "yes" ? true : parsed.canTakeJob === "no" ? false : null,
    arrivalText: parsed.arrivalText,
    priceAmount: parsed.priceAmount,
    currency: parsed.currency,
    note: parsed.note,
  };
}
