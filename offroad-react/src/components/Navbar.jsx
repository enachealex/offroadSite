import { Link, NavLink } from "react-router-dom";
import "./Navbar.css";

export default function Navbar() {
  return (
    <nav className="navbar">
      <Link to="/" className="navbar-brand">
        <img src="/images/branding/offroad-logo.png" alt="Offroad Adventures" className="navbar-logo" />
        <span className="navbar-title">Offroad Adventures</span>
      </Link>
      <div className="navbar-links">
        <NavLink to="/" end>Home</NavLink>
        <NavLink to="/adventures">Adventures</NavLink>
        <NavLink to="/videos">Videos</NavLink>
        <NavLink to="/about">About</NavLink>
      </div>
    </nav>
  );
}
