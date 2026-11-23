import { lazy, Suspense, useEffect, useRef } from "react";
import {
  HashRouter,
  Routes,
  Route,
  useLocation,
  useNavigate,
  useNavigationType,
} from "react-router-dom";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import Home from "./pages/Home";

const Adventures = lazy(() => import("./pages/Adventures"));
const Videos = lazy(() => import("./pages/Videos"));
const About = lazy(() => import("./pages/About"));

function AppShell() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const navigationType = useNavigationType();
  const touchStateRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
    startedAt: 0,
  });

  // Start each newly opened page at the top. Without this a page keeps the
  // previous page's scroll position, so following the home page's featured
  // video left the player off-screen on phones. Back/Forward (POP) is left
  // alone so the browser can restore where the visitor was.
  const lastPathname = useRef(pathname);
  useEffect(() => {
    // Only a change of page counts — picking a video rewrites ?v= on the
    // same page and must not jump the scroll position.
    const pageChanged = lastPathname.current !== pathname;
    lastPathname.current = pathname;
    if (pageChanged && navigationType !== "POP") {
      globalThis.scrollTo({ top: 0, left: 0, behavior: "instant" });
    }
  }, [pathname, navigationType]);

  useEffect(() => {
    const supportsTouch = "ontouchstart" in globalThis;
    if (!supportsTouch) {
      return undefined;
    }

    const onTouchStart = (event) => {
      if (event.touches.length !== 1) {
        return;
      }

      const touch = event.touches[0];
      const isMobileViewport = globalThis.innerWidth <= 768;
      const startsAtLeftEdge = touch.clientX <= 24;

      if (!isMobileViewport || !startsAtLeftEdge) {
        touchStateRef.current.active = false;
        return;
      }

      touchStateRef.current = {
        active: true,
        startX: touch.clientX,
        startY: touch.clientY,
        startedAt: Date.now(),
      };
    };

    const onTouchEnd = (event) => {
      const state = touchStateRef.current;
      if (!state.active) {
        return;
      }

      touchStateRef.current.active = false;

      const touch = event.changedTouches[0];
      const deltaX = touch.clientX - state.startX;
      const deltaY = Math.abs(touch.clientY - state.startY);
      const elapsedMs = Date.now() - state.startedAt;

      const isSwipeRight = deltaX > 80;
      const isMostlyHorizontal = deltaY < 60;
      const isQuickGesture = elapsedMs < 700;
      const canGoBack = globalThis.history.length > 1;

      if (isSwipeRight && isMostlyHorizontal && isQuickGesture && canGoBack) {
        navigate(-1);
      }
    };

    const onTouchCancel = () => {
      touchStateRef.current.active = false;
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("touchcancel", onTouchCancel, { passive: true });

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchCancel);
    };
  }, [navigate]);

  return (
    <>
      {/* Under HashRouter the URL hash *is* the route, so a plain
          href="#main-content" would navigate to a non-existent route and blank
          the page. Move focus directly instead of touching the hash. */}
      <button
        type="button"
        className="skip-link"
        onClick={() => {
          const main = document.getElementById("main-content");
          main?.focus();
          main?.scrollIntoView();
        }}
      >
        Skip to content
      </button>
      <Navbar />
      <main id="main-content" tabIndex={-1} style={{ flex: 1 }}>
        <Suspense fallback={<div style={{ minHeight: "60vh" }} />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/adventures" element={<Adventures />} />
            <Route path="/videos" element={<Videos />} />
            <Route path="/about" element={<About />} />
          </Routes>
        </Suspense>
      </main>
      <Footer />
    </>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AppShell />
    </HashRouter>
  );
}
