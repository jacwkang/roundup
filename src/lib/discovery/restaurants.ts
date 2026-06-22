import type { Restaurant, LocalEvent, PlanPreferences } from "@/types";

const YELP_BASE = "https://api.yelp.com/v3";

export async function fetchPopularRestaurants(
  city: string,
  preferences: PlanPreferences = {},
  limit = 10
): Promise<Restaurant[]> {
  const apiKey = process.env.YELP_API_KEY;

  if (!apiKey) {
    return getMockRestaurants(city);
  }

  const params = new URLSearchParams({
    location: city,
    categories: "restaurants",
    sort_by: "rating",
    limit: String(Math.min(limit * 2, 50)),
  });

  if (preferences.tags?.includes("food")) {
    params.set("term", "popular");
  }

  const response = await fetch(`${YELP_BASE}/businesses/search?${params}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!response.ok) {
    console.error("Yelp API error:", await response.text());
    return getMockRestaurants(city);
  }

  const data = (await response.json()) as {
    businesses: Array<{
      name: string;
      rating: number;
      review_count: number;
      price?: string;
      categories: Array<{ title: string }>;
      location?: { address1?: string; city?: string };
      url: string;
    }>;
  };

  return data.businesses.slice(0, limit).map((b) => ({
    name: b.name,
    rating: b.rating,
    reviewCount: b.review_count,
    priceLevel: b.price,
    cuisines: b.categories.map((c) => c.title),
    neighborhood: b.location?.city,
    url: b.url,
    address: b.location?.address1,
  }));
}

function getMockRestaurants(city: string): Restaurant[] {
  return [
    {
      name: `The Local Table (${city})`,
      rating: 4.6,
      reviewCount: 842,
      priceLevel: "$$",
      cuisines: ["American", "New American"],
      neighborhood: "Downtown",
      url: "https://www.yelp.com",
      address: "123 Main St",
    },
    {
      name: "Bella Notte",
      rating: 4.5,
      reviewCount: 1203,
      priceLevel: "$$$",
      cuisines: ["Italian"],
      neighborhood: "West Village",
      url: "https://www.yelp.com",
    },
    {
      name: "Sakura Ramen",
      rating: 4.4,
      reviewCount: 567,
      priceLevel: "$$",
      cuisines: ["Japanese", "Ramen"],
      neighborhood: "Midtown",
      url: "https://www.yelp.com",
    },
  ];
}
