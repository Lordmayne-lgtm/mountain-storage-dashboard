/* scripts/refresh-competitors.js
 *
 * Refresh competitor data by merging latest Google review ratings
 * from data/reviews.json into data/competitors.json.
 * Pricing, hours, features etc. remain manually maintained.
 * Runs via GitHub Actions on a weekly schedule.
 */

const fs = require("fs");
const path = require("path");

function main() {
  const competitorsPath = path.join(__dirname, "..", "data", "competitors.json");
  const reviewsPath = path.join(__dirname, "..", "data", "reviews.json");

  if (!fs.existsSync(competitorsPath)) {
    throw new Error("data/competitors.json not found; seed the file first.");
  }

  const competitors = JSON.parse(fs.readFileSync(competitorsPath, "utf8"));

  // If reviews.json exists, merge rating data
  if (fs.existsSync(reviewsPath)) {
    const reviews = JSON.parse(fs.readFileSync(reviewsPath, "utf8"));
    const reviewMap = {};
    for (const f of reviews.facilities || []) {
      reviewMap[f.name] = f;
    }

    let updated = 0;
    for (const facility of competitors.facilities || []) {
      const match = reviewMap[facility.name];
      if (match) {
        if (match.google_rating !== null && match.google_rating !== undefined) {
          facility.google_rating = match.google_rating;
          facility.google_review_count = match.google_review_count || 0;
          updated++;
          console.log(`Updated ${facility.name}: ${match.google_rating} stars (${match.google_review_count} reviews)`);
        }
      }
    }
    console.log(`Merged ratings for ${updated} facilities from reviews.json`);
  } else {
    console.log("No reviews.json found; skipping rating merge.");
  }

  competitors.last_updated = new Date().toISOString();
  fs.writeFileSync(competitorsPath, JSON.stringify(competitors, null, 2), "utf8");
  console.log(`Wrote ${competitorsPath}`);
}

main();
