// Prototype/demo data for the Design World UI.
//
// Everything in this file is clearly-labeled DEMO content for visually
// demonstrating the broader Design World product (Discover feed, non-Pune
// events). It is never presented as verified or real, and it is never used
// to answer "Ask Design World" — that always calls the real backend agent.
// Real workshop results come only from server responses, never from here.

const DEMO_DISCOVER_ITEMS = [
  { title: "Experimental Typography", designer: "Aanya Kapoor", location: "Mumbai, India", category: "Visual/Graphic Design" },
  { title: "Material-led Interfaces", designer: "Mei Lin", location: "Seoul, South Korea", category: "UX/Product Design" },
  { title: "Sustainable Packaging Systems", designer: "Noah Fischer", location: "Copenhagen, Denmark", category: "Industrial Design" },
  { title: "Motion in Editorial Design", designer: "Priya Raman", location: "Bengaluru, India", category: "Motion" },
  { title: "Design Systems as Products", designer: "Jonas Berg", location: "Berlin, Germany", category: "Design Systems" },
  { title: "Illustration for Interfaces", designer: "Sara Ahmed", location: "Cairo, Egypt", category: "Illustration" },
];

// Demo events shown in the "More to explore" section of Events — never the
// Pune workshop results, which only come from the real agent.
const DEMO_EVENTS = [
  {
    name: "National Student Design Awards 2026",
    type: "competition",
    organizer: "Design Council of India",
    venue: "Online submission",
    date: "2026-11-15",
    eligibility: "Undergraduate design students in India",
    price: "Free",
  },
  {
    name: "Global Design Week 2026",
    type: "event",
    organizer: "World Design Organization",
    venue: "Multiple host cities",
    date: "2026-11-02",
    eligibility: "Open to design students and professionals",
    price: "Varies",
  },
  {
    name: "Behance Portfolio Review Circle",
    type: "community",
    organizer: "Behance India Community",
    venue: "Online (Discord)",
    date: "Ongoing",
    eligibility: "Open to all designers",
    price: "Free",
  },
];

const DESIGN_INTERESTS = [
  { id: "ux-ui", label: "UX/UI" },
  { id: "graphic", label: "Graphic Design" },
  { id: "product", label: "Product Design" },
  { id: "service", label: "Service Design" },
  { id: "branding", label: "Branding" },
  { id: "typography", label: "Typography" },
  { id: "illustration", label: "Illustration" },
  { id: "motion", label: "Motion Design" },
  { id: "3d", label: "3D" },
  { id: "research", label: "Design Research" },
  { id: "ai-design", label: "AI + Design" },
  { id: "other", label: "Other" },
];

function loadDemoDiscoverItems() {
  return DEMO_DISCOVER_ITEMS;
}

function loadDemoEvents() {
  return DEMO_EVENTS;
}
