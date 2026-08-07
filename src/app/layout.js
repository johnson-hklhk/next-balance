import localFont from "next/font/local";
import Script from "next/script";
import 'bootstrap/dist/css/bootstrap.min.css';
import "@/app/scss/globals.scss";
import Splash from "@/app/common/Splash";

// Google Analytics — prod builds only, so dev sessions don't hit the property
const GA_ID = "G-XFEVS04ZCE";
const isProd = process.env.NODE_ENV === "production";

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
        {isProd && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
              strategy="afterInteractive"
            />
            <Script id="ga-init" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${GA_ID}');
              `}
            </Script>
          </>
        )}
      </body>
    </html>
  );
}
