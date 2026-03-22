import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import Home from "./pages/Home";

const Adventures = lazy(() => import("./pages/Adventures"));
const Videos = lazy(() => import("./pages/Videos"));
const About = lazy(() => import("./pages/About"));

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <main style={{ flex: 1 }}>
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
    </BrowserRouter>
  );
}
