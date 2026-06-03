import Nav from "./Nav";
import Hero from "./Hero";
import LogoStrip from "./LogoStrip";
import Features from "./Features";
import ChartsStory from "./ChartsStory";
import Community from "./Community";
import TrendingAudio from "./TrendingAudio";
import HowItWorks from "./HowItWorks";
import Pricing from "./Pricing";
import Testimonials from "./Testimonials";
import FinalCTA from "./FinalCTA";
import Footer from "./Footer";

export default function Landing() {
  return (
    <div className="min-h-dvh bg-background">
      <Nav />
      <main>
        <Hero />
        <LogoStrip />
        <Features />
        <ChartsStory />
        <Community />
        <TrendingAudio />
        <HowItWorks />
        <Pricing />
        <Testimonials />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
