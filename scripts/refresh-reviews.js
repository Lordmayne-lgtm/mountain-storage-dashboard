/* scripts/refresh-reviews.js
 *
 * Refresh Google Places reviews for Mountain Storage and competitors.
 * Writes aggregated data to data/reviews.json.
 * Runs via GitHub Actions on a schedule.
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
  { name: "Mountain Storage", placeId: "ChIJjeBQawArM4YR74Wn2wR_1RY", includeUhaul: true },
  { name: "Mini Mall Storage", placeId: "ChIJd46H4ljVMoYRLBgAyr4nIWA" },
  { name: "Secure Space Storage", placeId: "ChIJLxAIsIDVMoYRBtrvbr2SLE0" },
  { name: "Hwy 7 South Storage", placeId: "ChIJdbKxCJ7VMoYRKP3zNSEno-E" },
  { name: "Modern Storage", placeId: "ChIJncH3MQbVMoYRLi7t8jXJGfw" },
  { name: "New Frontier", placeId: "ChIJ_6XC5jjVMoYRZaVYEW0_9CI" },
  { name: "Central Access Storage", placeId: "ChIJEwHBiDvVMoYRiFT3GaQNhZo" },
  { name: "S&S Storage S Moore", placeId: "ChIJId6ggH4rM4YRHQ9rczoDMVU" },
  { name: "S&S Storage Pearcy", placeId: "ChIJ-6_DGb4sM4YRjhVqCCHIVv0" },
  { name: "Lake Hamilton Storage", placeId: "ChIJH-0qEugsM4YRA61c8Z5BHCY" },
  { name: "Malvern Ave Storage", placeId: "ChIJ3VFUJJzTMoYRxZK77e0xekI" }
];

function httpsJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

async function fetchGoogleDetails(placeId) {
  const fields = "rating,user_ratings_total,reviews";
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=${fields}&key=${GOOGLE_API_KEY}`;
  const json = await httpsJson(url);
  if (json.status !== "OK" || !json.result) {
    console.warn(`Google Places status=${json.status} for ${placeId}`);
    return { google_rating: null, google_review_count: 0, google_reviews: [] };
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

async function main() {
  const out = { last_updated: new Date().toISOString(), facilities: [] };
  for (const facility of FACILITIES) {
    console.log(`Fetching reviews for ${facility.name}...`);
    const googleData = await fetchGoogleDetails(facility.placeId);
    out.facilities.push({
      name: facility.name,
      google_place_id: facility.placeId,
      google_rating: googleData.google_rating,
      google_review_count: googleData.google_review_count,
      google_reviews: googleData.google_reviews
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
