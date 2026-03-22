/* scripts/refresh-reviews.js
 *
 * Refresh Google Places + U-Haul reviews for Mountain Storage and competitors.
 * Writes aggregated data to data/reviews.json.
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

if (!GOOGLE_API_KEY) {
  console.error("Missing GOOGLE_PLACES_API_KEY env var");
  process.exit(1);
}

const FACILITIES = [
  { name: "Mountain Storage", placeId: "YOUR_MOUNTAIN_STORAGE_PLACE_ID", includeUhaul: true },
  { name: "Mini Mall Storage", placeId: "MINI_MALL_PLACE_ID" },
  { name: "Secure Space Storage", placeId: "SECURE_SPACE_PLACE_ID" },
  { name: "Hwy 7 South Storage", placeId: "HWY7_SOUTH_PLACE_ID" },
  { name: "Modern Storage", placeId: "MODERN_STORAGE_PLACE_ID" },
  { name: "New Frontier", placeId: "NEW_FRONTIER_PLACE_ID" },
  { name: "Central Access Storage", placeId: "CENTRAL_ACCESS_PLACE_ID" },
  { name: "S&S Storage S Moore", placeId: "SS_MOORE_PLACE_ID" },
  { name: "S&S Storage Pearcy", placeId: "SS_PEARCY_PLACE_ID" },
  { name: "Lake Hamilton Storage", placeId: "LAKE_HAMILTON_PLACE_ID" },
  { name: "Malvern Ave Storage", placeId: "MALVERN_AVE_PLACE_ID" }
];

function httpsJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            resolve(json);
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

async function fetchGoogleDetails(placeId) {
  const fields = [
    "rating",
    "user_ratings_total",
    "review"
  ].join("%2C");

  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(
    placeId
  )}&fields=${fields}&key=${encodeURIComponent(GOOGLE_API_KEY)}`;

  const json = await httpsJson(url);

  if (json.status !== "OK" || !json.result) {
    console.warn(`Google Places returned status=${json.status} for placeId=${placeId}`);
    return {
      google_rating: null,
      google_review_count: 0,
      google_reviews: []
    };
  }

  const r = json.result;
  const reviews = (r.reviews || []).slice(0, 10).map((rev) => ({
    author: rev.author_name,
    rating: rev.rating,
    date: rev.relative_time_description || "",
    text: rev.text || ""
  }));

  return {
    google_rating: r.rating || null,
    google_review_count: r.user_ratings_total || 0,
    google_reviews: reviews
  };
}

// Placeholder U-Haul fetcher. You can replace this with a real HTTP call later.
async function fetchUhaulReviews() {
  // In a real implementation, you might call a scraping API here
  // and parse reviews from the U-Haul dealer page.
  return {
    uhaul_rating: 4.9,
    uhaul_review_count: 22,
    uhaul_reviews: []
  };
}

async function main() {
  const out = {
    last_updated: new Date().toISOString(),
    facilities: []
  };

  for (const facility of FACILITIES) {
    console.log(`Fetching reviews for ${facility.name}...`);
    const googleData = await fetchGoogleDetails(facility.placeId);

    let uhaulData = {};
    if (facility.includeUhaul) {
      uhaulData = await fetchUhaulReviews();
    }

    out.facilities.push({
      name: facility.name,
      source: facility.includeUhaul ? "google_and_uhaul" : "google",
      google_place_id: facility.placeId,
      google_rating: googleData.google_rating,
      google_review_count: googleData.google_review_count,
      google_reviews: googleData.google_reviews,
      ...uhaulData
    });
  }

  const targetPath = path.join(__dirname, "..", "data", "reviews.json");
  fs.writeFileSync(targetPath, JSON.stringify(out, null, 2), "utf8");
  console.log(`Wrote ${targetPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
