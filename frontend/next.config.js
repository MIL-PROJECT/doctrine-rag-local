/** @type {import('next').NextConfig} */
const nextConfig = {
  // `next build`만 standalone 산출물을 쓰고, `next dev`에서는 끕니다.
  // 그렇지 않으면 build 직후 남은 `.next`와 개발 번들이 섞여 `/_next/static/...` 404가 날 수 있습니다.
  ...(process.env.NODE_ENV === "production" ? { output: "standalone" } : {}),
  compiler: {
    styledComponents: true,
  },
};

module.exports = nextConfig;
