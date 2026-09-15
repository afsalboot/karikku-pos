export default function manifest() {
  return {
    name: "Karikku POS",
    short_name: "Karikku POS",
    description: "Karikku Juice Shop point of sale",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f7f1",
    theme_color: "#245b3a",
    icons: [
      { src: "/logo.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png", purpose: "any" },
    ],
  };
}
