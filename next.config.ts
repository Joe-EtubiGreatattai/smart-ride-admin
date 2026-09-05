import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  images: {
    // Driver documents and avatars are served from Cloudinary. Scoped to the
    // account's delivery path so this cannot be used to proxy arbitrary hosts.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        port: "",
        pathname: "/dhigdapi8/**",
        search: "",
      },
    ],
  },
};

export default nextConfig;
