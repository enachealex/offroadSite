import { useState, useEffect } from "react";
import { Link, NavLink } from "react-router-dom";
import "./Navbar.css";

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = () => setMenuOpen(false);

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
        aria-label={menuOpen ? "Close menu" : "Open menu"}
        aria-expanded={menuOpen}
        aria-controls="navbar-links"
      >
        <span /><span /><span />
      </button>
      {menuOpen && <div className="navbar-backdrop" onClick={() => setMenuOpen(false)} />}
      <div id="navbar-links" className={`navbar-links ${menuOpen ? "navbar-links-open" : ""}`}>
        <NavLink to="/" end onClick={closeMenu}>Home</NavLink>
        <NavLink to="/adventures" onClick={closeMenu}>Adventures</NavLink>
        <NavLink to="/videos" onClick={closeMenu}>Videos</NavLink>
        <NavLink to="/about" onClick={closeMenu}>About</NavLink>
      </div>
    </nav>
  );
}
