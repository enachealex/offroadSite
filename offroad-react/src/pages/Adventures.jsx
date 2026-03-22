import { useState } from "react";
import adventures, { trips } from "../data/adventures";
import AdventureCard from "../components/AdventureCard";
import Lightbox from "../components/Lightbox";
import "./Adventures.css";

export default function Adventures() {
  const [activeTrip, setActiveTrip] = useState("all");
  const [lightboxIndex, setLightboxIndex] = useState(null);

  const filtered = activeTrip === "all"
    ? adventures
    : adventures.filter((a) => a.trip === activeTrip);

  return (
    <div className="adventures-page">
      <header className="page-header">
        <h1>Adventures</h1>
        <p>Browse through all the offroad adventures, organized by trip.</p>
      </header>

      <div className="filter-bar">
        <button
          className={`filter-btn ${activeTrip === "all" ? "active" : ""}`}
          onClick={() => setActiveTrip("all")}
        >
          All Trips
        </button>
        {trips.map((trip) => (
          <button
            key={trip.id}
            className={`filter-btn ${activeTrip === trip.id ? "active" : ""}`}
            onClick={() => setActiveTrip(trip.id)}
          >
            {trip.name}
          </button>
        ))}
      </div>

      <div className="adventures-grid">
        {filtered.map((adv, idx) => (
          <div key={adv.id} onClick={() => setLightboxIndex(idx)} onKeyDown={(e) => { if (e.key === 'Enter') setLightboxIndex(idx); }} role="button" tabIndex={0} className="adventure-click">
            <AdventureCard adventure={adv} eager={idx < 6} />
          </div>
        ))}
      </div>

      {lightboxIndex !== null && (
        <Lightbox
          images={filtered}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
}
