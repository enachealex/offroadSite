import { useState, useEffect } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import "./Navbar.css";

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  // Close menu on route change
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // Prevent body scroll when menu is open
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  return (
    <nav className="navbar" onContextMenu={(e) => e.preventDefault()}>
      <Link to="/" className="navbar-brand">
        <img src="/images/branding/offroad-logo.png" alt="Offroad Adventures" className="navbar-logo" />
        <span className="navbar-title">Offroad Adventures</span>
      </Link>
      <button
        className={`navbar-toggle ${menuOpen ? "open" : ""}`}
        onClick={() => setMenuOpen(!menuOpen)}
        aria-label="Toggle menu"
      >
        <span /><span /><span />
      </button>
      {menuOpen && <div className="navbar-backdrop" onClick={() => setMenuOpen(false)} />}
      <div className={`navbar-links ${menuOpen ? "navbar-links-open" : ""}`}>
        <NavLink to="/" end>Home</NavLink>
        <NavLink to="/adventures">Adventures</NavLink>
        <NavLink to="/videos">Videos</NavLink>
        <NavLink to="/about">About</NavLink>
      </div>
    </nav>
  );
}
