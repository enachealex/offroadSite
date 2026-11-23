import { useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import videoCatalog from "../data/videos";
import "./Videos.css";

const monthFormat = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" });

// Only worth naming the channel once videos come from more than one.
const showChannel =
  new Set(videoCatalog.map((video) => video.channelTitle).filter(Boolean)).size > 1;

function cardMeta(video) {
  return [
    showChannel ? video.channelTitle : "",
    video.publishedAt ? monthFormat.format(new Date(video.publishedAt)) : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

export default function Videos() {
  // The playing video lives in the URL (#/videos?v=<id>), so the home page
  // can link straight to a playing video and any video can be shared.
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get("v") ?? "";

  const origin = globalThis.window?.location.origin ?? "";

  const selectedVideo = useMemo(
    () => (selectedId ? videoCatalog.find((video) => video.youtubeId === selectedId) : null) ?? null,
    [selectedId],
  );

  const playerRef = useRef(null);

  // Replace rather than push, so Back leaves the page instead of stepping
  // through every video that was tried.
  const selectVideo = (youtubeId) => {
    setSearchParams({ v: youtubeId }, { replace: true });

    // On narrow screens the list sits below the player, so a video picked
    // from further down would start playing off-screen. Bring the player
    // into view when it isn't already.
    const box = playerRef.current?.getBoundingClientRect();
    const navbarHeight = document.querySelector(".navbar")?.offsetHeight ?? 0;
    if (box && (box.top < navbarHeight || box.bottom > globalThis.innerHeight)) {
      playerRef.current.scrollIntoView({ block: "start" });
    }
  };

  const canPlaySelectedVideo = Boolean(selectedVideo?.youtubeId);
  const watchUrl = canPlaySelectedVideo
    ? `https://www.youtube.com/watch?v=${selectedVideo.youtubeId}`
    : "";
  const videoUrl = canPlaySelectedVideo
    ? `https://www.youtube-nocookie.com/embed/${selectedVideo.youtubeId}?autoplay=1&controls=1&modestbranding=1&rel=0&iv_load_policy=3&playsinline=1&origin=${encodeURIComponent(
        origin,
      )}&widget_referrer=${encodeURIComponent(origin)}`
    : "";

  return (
    <div className="videos-page">
      <div className="videos-layout">
        <main className="videos-main">
          <section className="videos-player-wrapper" ref={playerRef} aria-label="Selected offroad video">
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
              const isAvailable = Boolean(video.youtubeId);
              const isSelected = isAvailable && selectedId === video.youtubeId;
              const thumbnailUrl = isAvailable
                ? `https://i.ytimg.com/vi/${video.youtubeId}/hqdefault.jpg`
                : "";

              return (
                <button
                  key={video.key}
                  type="button"
                  className={`video-card video-list-card ${isSelected ? "is-selected" : ""}`}
                  onClick={() => isAvailable && selectVideo(video.youtubeId)}
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
                    {video.duration && (
                      <span className="video-card-duration">{video.duration}</span>
                    )}
                  </div>
                  <div className="video-card-meta">
                    <h3>{video.title}</h3>
                    {video.subtitle && <p>{video.subtitle}</p>}
                    {cardMeta(video) && <p className="video-card-date">{cardMeta(video)}</p>}
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
