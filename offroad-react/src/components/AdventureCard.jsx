import { useState } from "react";
import PropTypes from "prop-types";
import "./AdventureCard.css";

export default function AdventureCard({ adventure }) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="adventure-card">
      <div className="card-image-wrapper">
        {!loaded && <div className="card-image-placeholder" />}
        <img
          src={adventure.image}
          alt={adventure.title}
          className={`card-image ${loaded ? "loaded" : ""}`}
          loading="lazy"
          onLoad={() => setLoaded(true)}
        />
        <div className="card-overlay">
          <span className="card-date">{adventure.date}</span>
        </div>
      </div>
      <div className="card-body">
        <h3 className="card-title">{adventure.title}</h3>
        <p className="card-location">{adventure.location}</p>
        <p className="card-description">{adventure.description}</p>
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
    description: PropTypes.string.isRequired,
  }).isRequired,
};
