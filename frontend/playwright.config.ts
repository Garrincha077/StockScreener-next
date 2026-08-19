import {defineConfig,devices} from '@playwright/test'

export default defineConfig({
  testDir:'./e2e',
  timeout:30_000,
  expect:{timeout:5_000},
  use:{
    baseURL:'http://127.0.0.1:4173',
    ...devices['Pixel 5'],
    channel:process.env.PW_CHANNEL||undefined,
    trace:'retain-on-failure',
  },
  webServer:{
    command:'npm run preview -- --host 127.0.0.1 --port 4173',
    url:'http://127.0.0.1:4173',
    reuseExistingServer:false,
    timeout:30_000,
  },
})
