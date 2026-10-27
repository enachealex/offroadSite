import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeVideos } from "../src/data/mergeVideos.js";

const manual = [
  { key: "wind-mills", title: "Wind Mills and Ridge", subtitle: "Hand-written", youtubeId: "a", duration: "7:00" },
  { key: "olympic", title: "Olympic Peninsula", subtitle: "", youtubeId: "b" },
  { key: "coming-soon", title: "Weekend Rock Crawl", subtitle: "Soon", youtubeId: "" },
];

const fetched = [
  { youtubeId: "c", title: "New upload", subtitle: "Fresh", duration: "20:00", publishedAt: "2025-03-01T00:00:00Z", channelTitle: "Rig" },
  { youtubeId: "a", title: "WIND MILLS (4K)", subtitle: "From YouTube", duration: "7:02", publishedAt: "2024-01-01T00:00:00Z", channelTitle: "Rig" },
  { youtubeId: "b", title: "Olympic", subtitle: "Forest roads", duration: "11:35", publishedAt: "2024-06-01T00:00:00Z", channelTitle: "Rig" },
];

test("without a snapshot the hand-written list is unchanged", () => {
  assert.deepEqual(mergeVideos(manual, []), manual);
});

test("hand-written entries keep their wording but take fetched details", () => {
  const byKey = Object.fromEntries(mergeVideos(manual, fetched).map((v) => [v.key, v]));

  assert.equal(byKey["wind-mills"].title, "Wind Mills and Ridge");
  assert.equal(byKey["wind-mills"].subtitle, "Hand-written");
  assert.equal(byKey["wind-mills"].duration, "7:02", "fetched duration is authoritative");
  assert.equal(byKey["wind-mills"].publishedAt, "2024-01-01T00:00:00Z");

  assert.equal(byKey.olympic.subtitle, "Forest roads", "blank hand-written subtitle is filled in");
});

test("new uploads are added and everything sorts newest first", () => {
  const merged = mergeVideos(manual, fetched);
  assert.deepEqual(
    merged.map((v) => v.key),
    ["yt-c", "olympic", "wind-mills", "coming-soon"],
    "undated placeholder stays last",
  );
  assert.equal(merged.length, 4, "no duplicates");
});

test("overrides hide videos and replace wording", () => {
  const merged = mergeVideos(manual, fetched, {
    c: { hidden: true },
    b: { title: "Olympic Peninsula Loop", subtitle: "" },
  });
  assert.ok(!merged.some((v) => v.youtubeId === "c"));
  const olympic = merged.find((v) => v.youtubeId === "b");
  assert.equal(olympic.title, "Olympic Peninsula Loop");
  assert.equal(olympic.subtitle, "", "an empty override subtitle clears it");
});
