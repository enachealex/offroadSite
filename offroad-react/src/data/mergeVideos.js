/**
 * Combine the hand-curated video list with the YouTube snapshot.
 *
 * - Hand-written entries keep their key, title and subtitle. The snapshot
 *   fills in what they lack — duration, publish date, channel.
 * - Videos that only exist in the snapshot are added.
 * - Overrides, keyed by YouTube ID, apply last: hide a video, or replace its
 *   title or subtitle without touching code.
 *
 * Dated videos sort newest first. Undated hand-written entries (such as a
 * "coming soon" placeholder) keep their relative order after them.
 */
export function mergeVideos(manual, fetched, overrides = {}) {
  const fetchedById = new Map(fetched.map((video) => [video.youtubeId, video]));
  const seen = new Set();
  const merged = [];

  for (const entry of manual) {
    const remote = entry.youtubeId ? fetchedById.get(entry.youtubeId) : undefined;
    if (entry.youtubeId) seen.add(entry.youtubeId);
    merged.push(
      remote
        ? {
            ...entry,
            ...remote,
            key: entry.key,
            title: entry.title || remote.title,
            subtitle: entry.subtitle || remote.subtitle,
          }
        : { ...entry },
    );
  }

  for (const video of fetched) {
    if (seen.has(video.youtubeId)) continue;
    seen.add(video.youtubeId);
    merged.push({ key: `yt-${video.youtubeId}`, ...video });
  }

  const visible = merged
    .map((video) => {
      const override = video.youtubeId ? overrides[video.youtubeId] : undefined;
      if (!override) return video;
      if (override.hidden) return null;
      return {
        ...video,
        ...(override.title ? { title: override.title } : {}),
        ...(override.subtitle !== undefined ? { subtitle: override.subtitle } : {}),
      };
    })
    .filter(Boolean);

  // Array#sort is stable, so undated entries stay in their original order.
  return visible.sort((a, b) => {
    if (a.publishedAt && b.publishedAt) return b.publishedAt.localeCompare(a.publishedAt);
    if (a.publishedAt) return -1;
    if (b.publishedAt) return 1;
    return 0;
  });
}
