import { useEffect } from "react";
import GradientMesh from "../components/landing/background/GradientMesh";
import Spotlight from "../components/landing/background/Spotlight";
import LandingNav from "../components/landing/sections/LandingNav";
import HeroSection from "../components/landing/sections/HeroSection";
import SocialProofSection from "../components/landing/sections/SocialProofSection";
import FeaturesSection from "../components/landing/sections/FeaturesSection";
import AnalyticsPreview from "../components/landing/sections/AnalyticsPreview";
import CommunityShowcase from "../components/landing/sections/CommunityShowcase";
import TrendingAudio from "../components/landing/sections/TrendingAudio";
import TipsSection from "../components/landing/sections/TipsSection";
import HowItWorks from "../components/landing/sections/HowItWorks";
import PricingSection from "../components/landing/sections/PricingSection";
import TestimonialCarousel from "../components/landing/sections/TestimonialCarousel";
import CTASection from "../components/landing/sections/CTASection";
import LandingFooter from "../components/landing/sections/LandingFooter";

export default function LandingPage() {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = "Lumen — The creator OS for analytics, growth & collabs";
    const meta = document.querySelector('meta[name="description"]');
    const prevDesc = meta?.getAttribute("content");
    if (meta) {
      meta.setAttribute(
        "content",
        "Real-time engagement analytics, AI growth insights, and brand collaborations — all in one cinematic creator workspace."
      );
    }
    const prevBg = document.body.style.backgroundColor;
    document.body.style.backgroundColor = "#fafafb";
    return () => {
      document.title = prevTitle;
      if (meta && prevDesc) meta.setAttribute("content", prevDesc);
      document.body.style.backgroundColor = prevBg;
    };
  }, []);

  return (
    <div className="lumen-landing relative min-h-screen text-slate-900">
      <GradientMesh />
      <Spotlight />

      <LandingNav />

      <main>
        <HeroSection />
        <SocialProofSection />
        <FeaturesSection />
        <AnalyticsPreview />
        <CommunityShowcase />
        <TrendingAudio />
        <TipsSection />
        <HowItWorks />
        <PricingSection />
        <TestimonialCarousel />
        <CTASection />
      </main>

      <LandingFooter />
    </div>
  );
}
