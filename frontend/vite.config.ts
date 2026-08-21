import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import {rmSync} from 'node:fs'
import {resolve} from 'node:path'

export default defineConfig({
  plugins:[react(),{
    name:'exclude-canonical-audit-snapshot',
    closeBundle(){rmSync(resolve(import.meta.dirname,'dist/data/latest.json'),{force:true})},
  }],
  base:'./',
  build:{
    outDir:'dist',
    sourcemap:false,
  },
})
