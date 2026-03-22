import { useState } from "react";
import PropTypes from "prop-types";
import "./Lightbox.css";

export default function Lightbox({ images, initialIndex, onClose }) {
  const [index, setIndex] = useState(initialIndex);

  const goNext = () => setIndex((i) => (i + 1) % images.length);
  const goPrev = () => setIndex((i) => (i - 1 + images.length) % images.length);

  const handleKeyDown = (e) => {
    if (e.key === "Escape") onClose();
    if (e.key === "ArrowRight") goNext();
    if (e.key === "ArrowLeft") goPrev();
  };

  return (
    <div className="lightbox" onClick={onClose} onKeyDown={handleKeyDown} tabIndex={0} role="dialog" aria-label="Image lightbox" ref={(el) => el?.focus()}>
      <button className="lightbox-close" onClick={onClose} aria-label="Close">&times;</button>
      <button className="lightbox-nav lightbox-prev" onClick={(e) => { e.stopPropagation(); goPrev(); }} aria-label="Previous">&#8249;</button>
      <div className="lightbox-content" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} role="presentation">
        <img src={images[index].image} alt={images[index].title} />
        <div className="lightbox-caption">
          <h3>{images[index].title}</h3>
          <p>{images[index].description}</p>
        </div>
      </div>
      <button className="lightbox-nav lightbox-next" onClick={(e) => { e.stopPropagation(); goNext(); }} aria-label="Next">&#8250;</button>
      <div className="lightbox-counter">{index + 1} / {images.length}</div>
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
