import { Link } from "react-router-dom";
import adventures, { trips } from "../data/adventures";
import { featuredVideo } from "../data/videos";
import AdventureCard from "../components/AdventureCard";
import Picture from "../components/Picture";
import "./Home.css";

// Photos arrive sorted oldest-first, so the tail is the newest work.
const recent = adventures.slice(-3).reverse();

const hero = adventures.find((photo) => photo.featured) ?? adventures.at(-1);

const years = adventures.map((photo) => photo.sortDate).filter(Boolean).sort();
const firstYear = years[0]?.slice(0, 4);

// Each trip gets its own cover shot and a readable span of dates.
const tripCards = trips.map((trip) => {
  const photos = adventures.filter((photo) => photo.trip === trip.id);
  const first = photos[0];
  const last = photos.at(-1);
  const span = first?.date === last?.date ? first?.date : `${first?.date} – ${last?.date}`;
  return { ...trip, cover: first, span, photos };
});

const TRIP_COVER_SIZES = "(max-width: 700px) 92vw, (max-width: 1240px) 45vw, 380px";

export default function Home() {
  return (
    <div className="home">
      <section className="hero">
        {/* An <img> rather than a CSS background so the browser can pick a file
            that matches the viewport instead of upscaling one fixed size. */}
        <Picture photo={hero} sizes="100vw" priority alt="" className="hero-bg" />
        <div className="hero-overlay" />
        <div className="hero-content">
          <p className="hero-eyebrow">Pacific Northwest</p>
          <h1>Offroad Adventures</h1>
          <p className="hero-subtitle">
            Forest service roads, mountain passes, and ridge lines across Washington —
            photographed one weekend at a time.
          </p>
          <div className="hero-buttons">
            <Link to="/adventures" className="hero-cta hero-cta-solid">Explore Adventures</Link>
            <Link to="/videos" className="hero-cta hero-cta-outline">Watch Videos</Link>
          </div>
        </div>
        <div className="hero-stats">
          <div className="hero-stat">
            <span className="hero-stat-number">{adventures.length}</span>
            <span className="hero-stat-label">Photos</span>
          </div>
          <div className="hero-stat">
            <span className="hero-stat-number">{trips.length}</span>
            <span className="hero-stat-label">Trips</span>
          </div>
          <div className="hero-stat">
            <span className="hero-stat-number">{firstYear}</span>
            <span className="hero-stat-label">Since</span>
          </div>
        </div>
      </section>

      <section className="section trips-section">
        <header className="section-head">
          <h2 className="section-title">The Trips</h2>
          <p className="section-lede">Every run, from the first meet-up to the last ridge.</p>
        </header>
        <div className="trip-grid">
          {tripCards.map((trip) => (
            <Link
              key={trip.id}
              to="/adventures"
              state={{ tripId: trip.id }}
              className="trip-tile"
            >
              {trip.cover && (
                <Picture
                  photo={trip.cover}
                  sizes={TRIP_COVER_SIZES}
                  alt=""
                  className="trip-tile-img"
                />
              )}
              <div className="trip-tile-body">
                <span className="trip-tile-count">{trip.photoCount} photos</span>
                <h3 className="trip-tile-name">{trip.name}</h3>
                <p className="trip-tile-span">{trip.span}</p>
                <p className="trip-tile-desc">{trip.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="section featured-section">
        <header className="section-head">
          <h2 className="section-title">Latest Photos</h2>
          <p className="section-lede">The most recent shots off the trail.</p>
        </header>
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

      {featuredVideo && (
        <section className="section video-section">
          <div className="video-panel">
            <Link to="/videos" className="video-thumb" aria-label={`Watch ${featuredVideo.title}`}>
              <img
                src={`https://i.ytimg.com/vi/${featuredVideo.youtubeId}/hqdefault.jpg`}
                alt=""
                loading="lazy"
              />
              <span className="video-play" aria-hidden="true" />
            </Link>
            <div className="video-copy">
              <p className="section-eyebrow">From the channel</p>
              <h2>{featuredVideo.title}</h2>
              <p>{featuredVideo.subtitle}</p>
              <Link to="/videos" className="btn-secondary">Watch Videos</Link>
            </div>
          </div>
        </section>
      )}

      <section className="section about-section">
        <div className="about-panel">
          <h2>Two trucks, a lot of gravel</h2>
          <p>
            What started as a weekend drive turned into a running record of the trails
            around the Cascades and the Olympic Peninsula — the overlooks, the washouts,
            and the occasional snowfield in June.
          </p>
          <Link to="/about" className="btn-secondary">More About the Trips</Link>
        </div>
      </section>
    </div>
  );
}
