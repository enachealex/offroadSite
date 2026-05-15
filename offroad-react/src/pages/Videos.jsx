import { useMemo, useState } from "react";
import "./Videos.css";

const videoCatalog = [
  {
    key: "wind-mills-ridge",
    title: "Wind Mills and Ridge",
    subtitle: "Ridgeline run through the windmill route",
    youtubeId: "r8TWAcgmJpc",
    duration: "7:02",
  },
  {
    key: "olympic-peninsula",
    title: "Exploring Olympic Peninsula",
    subtitle: "Forest roads, mountain views, and coastal trail segments",
    youtubeId: "4oosjksBYqM",
    duration: "11:35",
  },
  {
    key: "next-weekend-crawl",
    title: "Weekend Rock Crawl",
    subtitle: "New upload coming soon",
    youtubeId: "",
    duration: "TBD",
  },
];

export default function Videos() {
  const [selectedKey, setSelectedKey] = useState("");

  const origin = globalThis.window?.location.origin ?? "";

  const selectedVideo = useMemo(
    () => videoCatalog.find((video) => video.key === selectedKey) ?? null,
    [selectedKey],
  );

  const canPlaySelectedVideo = Boolean(selectedVideo?.youtubeId);
  const watchUrl = canPlaySelectedVideo
    ? `https://www.youtube.com/watch?v=${selectedVideo.youtubeId}`
    : "";
  const videoUrl = canPlaySelectedVideo
    ? `https://www.youtube.com/embed/${selectedVideo.youtubeId}?autoplay=1&controls=1&modestbranding=1&rel=0&iv_load_policy=3&playsinline=1&origin=${encodeURIComponent(
        origin,
      )}&widget_referrer=${encodeURIComponent(origin)}`
    : "";

  return (
    <div className="videos-page">
      <div className="videos-layout">
        <main className="videos-main">
          <section className="videos-player-wrapper" aria-label="Selected offroad video">
            {canPlaySelectedVideo ? (
              <>
                <div className="videos-player-shell">
                  <iframe
                    className="videos-player"
                    src={videoUrl}
                    title={selectedVideo.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allowFullScreen
                  />
                </div>

                <p className="videos-fallback-text">
                  If playback fails in the embedded player, open the video directly on {" "}
                  <a href={watchUrl} target="_blank" rel="noreferrer">
                    YouTube
                  </a>
                  {"."}
                </p>
              </>
            ) : (
              <div className="videos-player-empty">
                <p>Choose a video from the list on the right to load and play it here.</p>
              </div>
            )}
          </section>
        </main>

        <aside className="videos-sidebar" aria-label="Video selection">
          <h3 className="videos-sidebar-heading">Videos</h3>
          <div className="videos-list">
            {videoCatalog.map((video) => {
              const isSelected = selectedKey === video.key;
              const isAvailable = Boolean(video.youtubeId);
              const thumbnailUrl = isAvailable
                ? `https://i.ytimg.com/vi/${video.youtubeId}/hqdefault.jpg`
                : "";

              return (
                <button
                  key={video.key}
                  type="button"
                  className={`video-card video-list-card ${isSelected ? "is-selected" : ""}`}
                  onClick={() => isAvailable && setSelectedKey(video.key)}
                  disabled={!isAvailable}
                  aria-pressed={isSelected}
                >
                  <div className="video-card-thumb-wrap">
                    {isAvailable ? (
                      <img
                        className="video-card-thumb"
                        src={thumbnailUrl}
                        alt={`${video.title} thumbnail`}
                        loading="lazy"
                      />
                    ) : (
                      <div className="video-card-thumb video-card-thumb-placeholder">Coming Soon</div>
                    )}
                    <span className="video-card-duration">{video.duration}</span>
                  </div>
                  <div className="video-card-meta">
                    <h3>{video.title}</h3>
                    <p>{video.subtitle}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}
