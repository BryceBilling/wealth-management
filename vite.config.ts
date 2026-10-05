import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({root:'apps/desktop',plugins:[react()],server:{port:1420,strictPort:true},build:{outDir:'../../dist',emptyOutDir:true}});
