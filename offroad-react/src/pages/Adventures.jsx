import { useState, useRef, useCallback, useEffect } from "react";
import adventures, { trips } from "../data/adventures";
import Lightbox from "../components/Lightbox";
import "./Adventures.css";

export default function Adventures() {
  const [activeTripId, setActiveTripId] = useState(trips[trips.length - 1].id);
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState(null);

  const activeTrip = trips.find((t) => t.id === activeTripId);
  const tripPhotos = adventures.filter((a) => a.trip === activeTripId);
  const featured = tripPhotos[featuredIndex] || tripPhotos[0];

  const handleTripChange = (tripId) => {
    setActiveTripId(tripId);
    setFeaturedIndex(0);
  };

  const openLightbox = (idx) => setLightboxIndex(idx);

  // Ref for thumbnail auto-scroll
  const thumbRefs = useRef([]);
  const thumbsContainerRef = useRef(null);

  // Simple swipe detection for mobile
  const touchStartX = useRef(null);
  const swiping = useRef(false);

  const handleTouchStart = useCallback((e) => {
    touchStartX.current = e.touches[0].clientX;
    swiping.current = false;
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (touchStartX.current === null) return;
    if (Math.abs(e.touches[0].clientX - touchStartX.current) > 10) swiping.current = true;
  }, []);

  const handleTouchEnd = useCallback((e) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 50) {
      if (dx < 0) setFeaturedIndex((i) => (i + 1) % tripPhotos.length);
      else setFeaturedIndex((i) => (i - 1 + tripPhotos.length) % tripPhotos.length);
    }
    touchStartX.current = null;
  }, [tripPhotos.length]);

  // Track previous index to detect wrap-around
  const prevFeaturedIndex = useRef(featuredIndex);
  // Track intended scroll target so rapid key presses don't read stale scrollLeft
  const scrollTarget = useRef(null);

  // Auto-scroll thumbnail strip: page on desktop, scrollIntoView on mobile
  useEffect(() => {
    const el = thumbRefs.current[featuredIndex];
    const container = thumbsContainerRef.current;
    if (!el || !container) return;

    const isDesktop = window.matchMedia("(min-width: 641px)").matches;
    if (isDesktop) {
      const prev = prevFeaturedIndex.current;
      const isWrap =
        (prev === tripPhotos.length - 1 && featuredIndex === 0) ||
        (prev === 0 && featuredIndex === tripPhotos.length - 1);

      // Use the intended target if mid-animation, otherwise read from DOM
      const viewLeft = scrollTarget.current !== null ? scrollTarget.current : container.scrollLeft;
      const pageWidth = container.clientWidth;
      const elLeft = el.offsetLeft - container.offsetLeft;
      const elRight = elLeft + el.offsetWidth;
      const viewRight = viewLeft + pageWidth;

      let newScroll = null;
      if (isWrap) {
        newScroll = Math.max(0, elLeft);
      } else if (elRight > viewRight) {
        newScroll = viewLeft + pageWidth;
      } else if (elLeft < viewLeft) {
        newScroll = Math.max(0, viewLeft - pageWidth);
      }

      if (newScroll !== null) {
        scrollTarget.current = newScroll;
        container.scrollTo({ left: newScroll, behavior: "instant" });
      }
    } else {
      el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    }
    prevFeaturedIndex.current = featuredIndex;
  }, [featuredIndex, tripPhotos.length]);

  // Reset scroll target when animation settles
  useEffect(() => {
    const container = thumbsContainerRef.current;
    if (!container) return;
    const onScroll = () => {
      if (scrollTarget.current !== null && Math.abs(container.scrollLeft - scrollTarget.current) < 2) {
        scrollTarget.current = null;
      }
    };
    container.addEventListener("scroll", onScroll);
    return () => container.removeEventListener("scroll", onScroll);
  }, []);

  // Keyboard shortcuts: arrows to navigate photos and trips
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (lightboxIndex !== null) return; // let lightbox handle its own keys
      if (e.key === "ArrowLeft") {
        setFeaturedIndex((i) => (i - 1 + tripPhotos.length) % tripPhotos.length);
      } else if (e.key === "ArrowRight") {
        setFeaturedIndex((i) => (i + 1) % tripPhotos.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const idx = trips.findIndex((t) => t.id === activeTripId);
        const prev = (idx - 1 + trips.length) % trips.length;
        handleTripChange(trips[prev].id);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        const idx = trips.findIndex((t) => t.id === activeTripId);
        const next = (idx + 1) % trips.length;
        handleTripChange(trips[next].id);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTripId, tripPhotos.length, lightboxIndex]);

  return (
    <div className="adventures-page" onContextMenu={(e) => e.preventDefault()} onDragStart={(e) => e.preventDefault()}>
      <div className="gallery-layout">
        {/* Sidebar — trip list */}
        <aside className="gallery-sidebar">
          <h3 className="sidebar-heading">Trips</h3>
          <ul className="trip-list">
            {trips.map((trip) => {
              const preview = adventures.find((a) => a.trip === trip.id);
              return (
                <li key={trip.id}>
                  <button
                    className={`trip-card ${trip.id === activeTripId ? "trip-card-active" : ""}`}
                    onClick={() => handleTripChange(trip.id)}
                  >
                    <img
                      src={preview?.image}
                      alt={trip.name}
                      className="trip-card-img"
                      loading="lazy"
                    />
                    <div className="trip-card-info">
                      <span className="trip-card-name">{trip.name}</span>
                      <span className="trip-card-count">
                        {adventures.filter((a) => a.trip === trip.id).length} photos
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* Main gallery area */}
        <main className="gallery-main">
          <h1 className="trip-title">{activeTrip.name}</h1>
          <p className="trip-description">{activeTrip.description}</p>

          {/* Featured / hero photo */}
          <div
            className="gallery-featured"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <img
              src={featured.image}
              alt={featured.title}
              className="featured-image"
              loading="eager"
              draggable="false"
              onClick={() => { if (!swiping.current) openLightbox(featuredIndex); }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter") openLightbox(featuredIndex); }}
            />
            <button
              className="featured-nav featured-prev"
              onClick={() => setFeaturedIndex((i) => (i - 1 + tripPhotos.length) % tripPhotos.length)}
              aria-label="Previous photo"
            />
            <button
              className="featured-nav featured-next"
              onClick={() => setFeaturedIndex((i) => (i + 1) % tripPhotos.length)}
              aria-label="Next photo"
            />
            <div className="featured-info">
              <h2>{featured.title}</h2>
              <span>{featured.location}</span>
            </div>
          </div>

          {/* Thumbnail grid */}
          <div className="gallery-thumbs" ref={thumbsContainerRef}>
            {tripPhotos.map((adv, idx) => (
              <button
                key={adv.id}
                ref={(el) => (thumbRefs.current[idx] = el)}
                className={`thumb ${idx === featuredIndex ? "thumb-active" : ""}`}
                onClick={() => setFeaturedIndex(idx)}
              >
                <img
                  src={adv.image}
                  alt={adv.title}
                  loading={idx < 6 ? "eager" : "lazy"}
                  decoding="async"
                />
              </button>
            ))}
          </div>
        </main>
      </div>

      {lightboxIndex !== null && (
        <Lightbox
          images={tripPhotos}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
}
