import "./Footer.css";

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-content">
        <p>&copy; {new Date().getFullYear()} Offroad Adventures. All rights reserved.</p>
      </div>
    </footer>
  );
}
