import type { Ad, MetaConnection } from "./types";

const GRAPH = "https://graph.facebook.com/v25.0";

async function graph<T>(connection: MetaConnection, path: string, params: Record<string, unknown>): Promise<T> {
  const body = new URLSearchParams({ access_token: connection.accessToken });
  for (const [key, value] of Object.entries(params)) {
    body.set(key, typeof value === "string" ? value : JSON.stringify(value));
  }
  const res = await fetch(`${GRAPH}/${path}`, { method: "POST", body, cache: "no-store" });
  const json = await res.json();
  if (!res.ok || json.error) {
    const error = json.error ?? {};
    throw new Error(error.error_user_msg || error.message || `Meta returned ${res.status}`);
  }
  return json as T;
}

export const accountPath = (connection: MetaConnection) =>
  connection.adAccountId.startsWith("act_") ? connection.adAccountId : `act_${connection.adAccountId}`;

export async function createCampaign(connection: MetaConnection, name: string): Promise<string> {
  const campaign = await graph<{ id: string }>(connection, `${accountPath(connection)}/campaigns`, {
    name,
    objective: "OUTCOME_TRAFFIC",
    status: "PAUSED",
    special_ad_categories: [],
    is_adset_budget_sharing_enabled: false,
  });
  return campaign.id;
}

// Creates one paused ad (image, ad set, creative, ad) inside the campaign. Nothing spends until it is switched on in Ads Manager.
export async function createPausedAd(
  connection: MetaConnection,
  campaignId: string,
  ad: Ad,
  link: string,
): Promise<string> {
  const account = accountPath(connection);
  const image = Buffer.from(await (await fetch(ad.imageUrl)).arrayBuffer()).toString("base64");
  const uploaded = await graph<{ images: Record<string, { hash: string }> }>(connection, `${account}/adimages`, {
    bytes: image,
  });
  const hash = Object.values(uploaded.images)[0].hash;

  const adSet = await graph<{ id: string }>(connection, `${account}/adsets`, {
    name: ad.headline,
    campaign_id: campaignId,
    daily_budget: Math.round(ad.dailyBudget * 100),
    billing_event: "IMPRESSIONS",
    optimization_goal: "LINK_CLICKS",
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    status: "PAUSED",
    targeting: { geo_locations: { countries: ["US"] }, targeting_automation: { advantage_audience: 1 } },
  });

  const creative = await graph<{ id: string }>(connection, `${account}/adcreatives`, {
    name: ad.headline,
    object_story_spec: {
      page_id: connection.pageId,
      link_data: {
        link,
        message: ad.primaryText,
        name: ad.headline,
        image_hash: hash,
        call_to_action: { type: "SHOP_NOW", value: { link } },
      },
    },
  });

  const created = await graph<{ id: string }>(connection, `${account}/ads`, {
    name: ad.headline,
    adset_id: adSet.id,
    creative: { creative_id: creative.id },
    status: "PAUSED",
  });
  return created.id;
}

// Removes a campaign and everything under it; used to clear a failed attempt before publishing again.
export async function deleteCampaign(connection: MetaConnection, campaignId: string) {
  await fetch(`${GRAPH}/${campaignId}?access_token=${encodeURIComponent(connection.accessToken)}`, {
    method: "DELETE",
    cache: "no-store",
  }).catch(() => {});
}
