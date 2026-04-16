import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  workboxOptions: { skipWaiting: true, clientsClaim: true },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {},
};

export default withPWA(nextConfig);
