import { useCallback, useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import Picture from "./Picture";
import "./Lightbox.css";

// The lightbox image is the largest thing on screen, so it is allowed to ask
// for a full-viewport file.
const LIGHTBOX_SIZES = "100vw";

export default function Lightbox({ images, initialIndex, onClose }) {
  const [index, setIndex] = useState(initialIndex);
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const touchStartRef = useRef(null);

  const goNext = useCallback(() => setIndex((i) => (i + 1) % images.length), [images.length]);
  const goPrev = useCallback(
    () => setIndex((i) => (i - 1 + images.length) % images.length),
    [images.length],
  );

  const current = images[index];

  // Send focus into the dialog on open and hand it back to whatever opened it
  // on close, so keyboard users are never dumped at the top of the document.
  useEffect(() => {
    const opener = document.activeElement;
    closeRef.current?.focus();
    return () => {
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, []);

  // A modal that leaves the page scrollable behind it lets keyboard and screen
  // reader users wander out of the dialog without closing it.
  useEffect(() => {
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        goNext();
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrev();
        return;
      }
      if (event.key !== "Tab") return;

      // Focus trap: cycle within the dialog's own controls.
      const focusables = dialogRef.current?.querySelectorAll("button");
      if (!focusables?.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [goNext, goPrev, onClose]);

  const onTouchStart = (event) => {
    touchStartRef.current = event.touches[0].clientX;
  };

  const onTouchEnd = (event) => {
    if (touchStartRef.current === null) return;
    const dx = event.changedTouches[0].clientX - touchStartRef.current;
    touchStartRef.current = null;
    if (Math.abs(dx) < 50) return;
    if (dx < 0) goNext();
    else goPrev();
  };

  return (
    <div
      className="lightbox"
      ref={dialogRef}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${current.title}, photo ${index + 1} of ${images.length}`}
    >
      <button className="lightbox-close" ref={closeRef} onClick={onClose} aria-label="Close">
        <span aria-hidden="true">&times;</span>
      </button>
      <button
        className="lightbox-nav lightbox-prev"
        onClick={(e) => { e.stopPropagation(); goPrev(); }}
        aria-label="Previous photo"
      >
        <span aria-hidden="true">&#8249;</span>
      </button>
      <div
        className="lightbox-content"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        role="presentation"
      >
        <Picture photo={current} sizes={LIGHTBOX_SIZES} priority className="lightbox-picture" />
        <div className="lightbox-caption">
          <h3>{current.title}</h3>
          {current.description && <p>{current.description}</p>}
        </div>
      </div>
      <button
        className="lightbox-nav lightbox-next"
        onClick={(e) => { e.stopPropagation(); goNext(); }}
        aria-label="Next photo"
      >
        <span aria-hidden="true">&#8250;</span>
      </button>
      <div className="lightbox-counter" aria-hidden="true">{index + 1} / {images.length}</div>
    </div>
  );
}

Lightbox.propTypes = {
  images: PropTypes.arrayOf(PropTypes.shape({
    image: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
    description: PropTypes.string,
  })).isRequired,
  initialIndex: PropTypes.number.isRequired,
  onClose: PropTypes.func.isRequired,
};
