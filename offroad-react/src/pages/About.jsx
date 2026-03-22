import "./About.css";

export default function About() {
  return (
    <div className="about-page">
      <header className="page-header">
        <h1>About</h1>
      </header>

      <div className="about-content">
        <div className="about-image">
          <img src="/images/adventures/20210917_175403.jpg" alt="Out on the trail" />
        </div>
        <div className="about-text">
          <h2>The Adventure Starts Here</h2>
          <p>
            Welcome to Offroad Adventures — a place to document and share my love for
            hitting the trails, exploring off the beaten path, and pushing rigs through
            some of the best terrain out there.
          </p>
          <p>
            Whether it's a weekend trip through desert washes, night runs with LED bars
            blazing, or early-morning trail crawls through rocky sections — this is where
            I capture it all.
          </p>
          <p>
            This site is all about the photos, the memories, and the love of getting dirty.
            No database, no complex backend — just pure adventure content built with React.
          </p>

          <div className="about-details">
            <div className="about-detail">
              <h3>The Rig</h3>
              <p>Purpose-built for off-road — upgraded suspension, LED lighting, skid plates, and all the gear needed to get through whatever the trail throws at us.</p>
            </div>
            <div className="about-detail">
              <h3>The Trails</h3>
              <p>From rocky crawls to wide-open desert runs, every trip is different. Always scouting the next adventure and pushing further out.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
