import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// 커스텀 도메인(public/CNAME)으로 배포하므로 사이트 루트가 기본값이다.
// CNAME 없이 GitHub Pages 프로젝트 사이트로 쓸 때는 워크플로가 VITE_BASE=/<repo>/ 를 넘긴다.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
