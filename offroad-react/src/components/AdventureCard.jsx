import PropTypes from "prop-types";
import Picture from "./Picture";
import "./AdventureCard.css";

// Cards sit in a 320px-min auto-fill grid, so they are full width on phones and
// roughly a third of a 1200px container on desktop.
const CARD_SIZES = "(max-width: 480px) 92vw, (max-width: 1240px) 45vw, 380px";

export default function AdventureCard({ adventure, eager = false }) {
  return (
    <div className="adventure-card">
      <div className="card-image-wrapper">
        <Picture
          photo={adventure}
          sizes={CARD_SIZES}
          priority={eager}
          className="card-picture"
        />
        <div className="card-overlay">
          <span className="card-date">{adventure.date}</span>
        </div>
      </div>
      <div className="card-body">
        <h3 className="card-title">{adventure.title}</h3>
        <p className="card-location">{adventure.location}</p>
        {adventure.description && <p className="card-description">{adventure.description}</p>}
      </div>
    </div>
  );
}

AdventureCard.propTypes = {
  adventure: PropTypes.shape({
    image: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
    date: PropTypes.string.isRequired,
    location: PropTypes.string.isRequired,
    description: PropTypes.string,
  }).isRequired,
  eager: PropTypes.bool,
};
