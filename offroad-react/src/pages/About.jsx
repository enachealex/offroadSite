import adventures from "../data/adventures";
import Picture from "../components/Picture";
import "./About.css";

// Pulled from the gallery data rather than hardcoded, so the path can never
// drift out of sync with the generated files again.
const portrait = adventures.find((photo) => photo.title === "Valley of Fog") ?? adventures.at(-1);

const ABOUT_SIZES = "(max-width: 768px) 92vw, 440px";

export default function About() {
  return (
    <div className="about-page">
      <header className="page-header">
        <h1>About</h1>
      </header>

      <div className="about-content">
        <div className="about-image">
          <Picture photo={portrait} sizes={ABOUT_SIZES} alt="Out on the trail" />
        </div>
        <div className="about-text">
          <h2>Two trucks, a lot of gravel</h2>
          <p>
            Offroad Adventures is a running record of weekends spent on the forest
            service roads and mountain passes of Washington State — the overlooks worth
            the drive, the washouts that turned us around, and the fog that rolled into
            the valley while we were still setting up camp.
          </p>
          <p>
            Most of it happens within a few hours of home: the trails around Snoqualmie
            and Stampede Pass, the ridges above Keechelus Lake, and longer runs out to
            the Olympic Peninsula and the dry country east of the Cascades.
          </p>
          <p>
            Everything here was shot on the trail. No staged photos, no drone footage —
            just what the weekend actually looked like.
          </p>

          <div className="about-details">
            <div className="about-detail">
              <h3>The Rigs</h3>
              <p>
                A Tundra TRD Pro and a 4Runner, with a Land Cruiser and a Jeep along for
                a few of the runs. Nothing exotic — just enough clearance and traction to
                get up the mountain and back down again.
              </p>
            </div>
            <div className="about-detail">
              <h3>The Trails</h3>
              <p>
                Gravel and rock more often than mud. Ridge lines, old mine roads, and the
                occasional snowfield that had no business still being there in June.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
