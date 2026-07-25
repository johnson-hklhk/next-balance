import localFont from "next/font/local";
import 'bootstrap/dist/css/bootstrap.min.css';
import "@/app/scss/globals.scss";
import Splash from "@/app/common/Splash";

const kodeMono = localFont({
  src: [
    { path: "../../public/fonts/KodeMono/KodeMono-Regular.ttf", weight: "400", style: "normal" },
    { path: "../../public/fonts/KodeMono/KodeMono-Medium.ttf", weight: "500", style: "normal" },
    { path: "../../public/fonts/KodeMono/KodeMono-SemiBold.ttf", weight: "600", style: "normal" },
    { path: "../../public/fonts/KodeMono/KodeMono-Bold.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-kodemono",
  display: "swap",
});

const title = "💰找數 Gay!!! | Developed by Johnson Lee";
const description = "夾錢分帳計數器";
const shareImage = {
  url: "https://johnsonhklhk.com/balance/share.jpg",
  width: 1366,
  height: 768,
  alt: title,
};

export const metadata = {
  // set NEXT_PUBLIC_SITE_URL in prod so og/twitter images resolve to absolute URLs
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title,
  description,
  openGraph: {
    title,
    description,
    type: "website",
    images: [shareImage],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [shareImage],
  },
  appleWebApp: {
    title: "找數 Gay!",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/logo.svg", type: "image/svg+xml" },
    ],
    apple: "/favicon-for-public/web-app-manifest-192x192.png",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={kodeMono.variable}>
      <body>
        <Splash />
        {children}
      </body>
    </html>
  );
}
