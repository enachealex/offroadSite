import { Link } from "react-router-dom";
import adventures, { trips } from "../data/adventures";
import AdventureCard from "../components/AdventureCard";
import Picture from "../components/Picture";
import "./Home.css";

// Photos arrive sorted oldest-first, so the tail is the newest work.
const recent = adventures.slice(-3).reverse();

const hero = adventures.find((photo) => photo.featured) ?? adventures.at(-1);

const firstYear = adventures
  .map((photo) => photo.sortDate)
  .filter(Boolean)
  .sort()[0]
  ?.slice(0, 4);

export default function Home() {
  return (
    <div className="home">
      <section className="hero">
        {/* An <img> rather than a CSS background so the browser can pick a file
            that matches the viewport instead of upscaling one fixed size. */}
        <Picture photo={hero} sizes="100vw" priority alt="" className="hero-bg" />
        <div className="hero-overlay" />
        <div className="hero-content">
          <h1>Offroad Adventures</h1>
          <p className="hero-subtitle">Exploring trails, conquering terrain, and chasing horizons.</p>
          <div className="hero-buttons">
            <Link to="/adventures" className="hero-cta hero-cta-outline">Adventures</Link>
            <Link to="/videos" className="hero-cta hero-cta-outline">Videos</Link>
            <Link to="/about" className="hero-cta hero-cta-outline">About</Link>
          </div>
        </div>
      </section>

      <section className="section featured-section">
        <h2 className="section-title">Recent Adventures</h2>
        <div className="featured-grid">
          {recent.map((adv) => (
            <Link
              key={adv.id}
              to="/adventures"
              state={{ tripId: adv.trip, photoId: adv.id }}
              className="featured-link"
            >
              <AdventureCard adventure={adv} eager />
            </Link>
          ))}
        </div>
        <div className="section-cta">
          <Link to="/adventures" className="btn-secondary">See All Adventures</Link>
        </div>
      </section>

      <section className="section stats-section">
        <div className="stats-grid">
          <div className="stat">
            <span className="stat-number">{adventures.length}</span>
            <span className="stat-label">Photos</span>
          </div>
          <div className="stat">
            <span className="stat-number">{trips.length}</span>
            <span className="stat-label">Trips</span>
          </div>
          <div className="stat">
            <span className="stat-number">{firstYear}</span>
            <span className="stat-label">Since</span>
          </div>
        </div>
      </section>
    </div>
  );
}
