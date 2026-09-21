import "./globals.css";
import "./production-states.css";

export const metadata = {
  title: "Karikku POS",
  icons: { apple: "/apple-touch-icon.png" },
  description:
    "Juice shop billing, sales, expenses, and daily business management.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
