import { Link } from "react-router-dom";
import adventures from "../data/adventures";
import AdventureCard from "../components/AdventureCard";
import "./Home.css";

const featured = adventures.slice(0, 3);

export default function Home() {
  return (
    <div className="home">
      <section className="hero">
        <div className="hero-bg" style={{ backgroundImage: "url(/images/adventures/20210918_125117.jpg)" }} />
        <div className="hero-overlay" />
        <div className="hero-content">
          <h1>Offroad Adventures</h1>
          <p className="hero-subtitle">Exploring trails, conquering terrain, and chasing horizons.</p>
          <Link to="/adventures" className="hero-cta">View Adventures</Link>
        </div>
      </section>

      <section className="section featured-section">
        <h2 className="section-title">Recent Adventures</h2>
        <div className="featured-grid">
          {featured.map((adv) => (
            <AdventureCard key={adv.id} adventure={adv} eager />
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
            <span className="stat-number">2</span>
            <span className="stat-label">Trips</span>
          </div>
          <div className="stat">
            <span className="stat-number">2021</span>
            <span className="stat-label">Since</span>
          </div>
        </div>
      </section>
    </div>
  );
}
