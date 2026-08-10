import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// GitHub Pages 프로젝트 사이트는 /<repo>/ 하위에 배포된다.
// 워크플로에서 VITE_BASE를 넘겨 저장소 이름에 맞춘다.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/rel-mgmt/',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
